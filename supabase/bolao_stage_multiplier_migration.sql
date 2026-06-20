-- ═══════════════════════════════════════════════════════════════
-- Bolão – Multiplicador de pontos por fase eliminatória (mata-mata)
-- Execute no Supabase SQL Editor (depois de bolao_custom_scoring_migration.sql)
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona coluna stage_multipliers na tabela bolao_pools
--    Mapa { "ROUND_OF_32": 2, "QUARTER_FINALS": 3, ... } — fase ausente = 1x (sem alteração).
--    Cada campeonato tem seu próprio conjunto de fases eliminatórias (ex: a
--    Copa do Mundo 2026 começa nas dezesseis-avos / ROUND_OF_32).
ALTER TABLE public.bolao_pools
ADD COLUMN IF NOT EXISTS stage_multipliers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Função para atualizar stage_multipliers
--    (bypassa RLS – não há UPDATE policy em bolao_pools)
CREATE OR REPLACE FUNCTION public.update_pool_stage_multipliers(
  p_pool_id           UUID,
  p_stage_multipliers JSONB
)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_pools
  SET stage_multipliers = COALESCE(p_stage_multipliers, '{}'::jsonb),
      updated_at         = now()
  WHERE id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. score_match_predictions agora multiplica os pontos pelo multiplicador
--    cadastrado para a fase (stage) da partida.
CREATE OR REPLACE FUNCTION public.score_match_predictions(
  p_match_id UUID,
  p_real_home INTEGER,
  p_real_away INTEGER,
  p_pool_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  pred                    RECORD;
  v_scoring_model         TEXT;
  v_config                JSONB;
  v_stage_multipliers     JSONB;
  v_stage                 TEXT;
  v_multiplier            NUMERIC;
  v_points                INTEGER;
  v_updated               INTEGER := 0;
  v_real_result           TEXT;
  v_pred_result           TEXT;
  v_winner_goals_correct  BOOLEAN;
  v_loser_goals_correct   BOOLEAN;
  v_saldo_correct         BOOLEAN;
BEGIN
  v_real_result := CASE
    WHEN p_real_home > p_real_away THEN 'home'
    WHEN p_real_home < p_real_away THEN 'away'
    ELSE 'draw'
  END;

  SELECT stage INTO v_stage
  FROM public.bolao_matches
  WHERE id = p_match_id;

  FOR pred IN
    SELECT bp.id, bp.home_goals, bp.away_goals, bp.pool_id
    FROM public.bolao_predictions bp
    WHERE bp.match_id = p_match_id
      AND (p_pool_id IS NULL OR bp.pool_id = p_pool_id)
  LOOP
    -- Busca o modelo de pontuação, config e multiplicadores de fase do bolão deste palpite
    SELECT scoring_model, scoring_config, stage_multipliers
    INTO v_scoring_model, v_config, v_stage_multipliers
    FROM public.bolao_pools
    WHERE id = pred.pool_id;

    IF v_scoring_model IS NULL THEN
      v_scoring_model := 'classic';
    END IF;

    v_multiplier := COALESCE((v_stage_multipliers->>v_stage)::numeric, 1);

    v_pred_result := CASE
      WHEN pred.home_goals > pred.away_goals THEN 'home'
      WHEN pred.home_goals < pred.away_goals THEN 'away'
      ELSE 'draw'
    END;

    v_winner_goals_correct := CASE
      WHEN v_real_result = 'home' THEN pred.home_goals = p_real_home
      WHEN v_real_result = 'away' THEN pred.away_goals = p_real_away
      ELSE FALSE
    END;
    v_loser_goals_correct := CASE
      WHEN v_real_result = 'home' THEN pred.away_goals = p_real_away
      WHEN v_real_result = 'away' THEN pred.home_goals = p_real_home
      ELSE FALSE
    END;
    v_saldo_correct := (pred.home_goals - pred.away_goals) = (p_real_home - p_real_away);

    IF v_scoring_model = 'custom' THEN
      -- ── Modelo personalizado: lê os pontos de scoring_config ──
      IF pred.home_goals = p_real_home AND pred.away_goals = p_real_away THEN
        v_points := COALESCE((v_config->>'exact')::int, 15);
      ELSIF v_real_result != v_pred_result THEN
        v_points := COALESCE((v_config->>'wrong')::int, 0);
      ELSIF v_real_result = 'draw' THEN
        v_points := COALESCE((v_config->>'draw')::int, 0);
      ELSIF v_winner_goals_correct THEN
        v_points := COALESCE((v_config->>'winner_goals')::int, 0);
      ELSIF v_loser_goals_correct THEN
        v_points := COALESCE((v_config->>'loser_goals')::int, 0);
      ELSIF v_saldo_correct THEN
        v_points := COALESCE((v_config->>'winner_saldo')::int, 0);
      ELSE
        v_points := COALESCE((v_config->>'winner')::int, 0);
      END IF;

    -- ── Modelos predefinidos ──
    ELSIF pred.home_goals = p_real_home AND pred.away_goals = p_real_away THEN
      v_points := 15;

    ELSIF v_real_result != v_pred_result THEN
      v_points := 0;

    ELSIF v_real_result = 'draw' THEN
      v_points := CASE WHEN v_scoring_model = 'classic' THEN 10 ELSE 5 END;

    ELSE
      IF v_scoring_model = 'classic' THEN
        v_points := CASE
          WHEN v_winner_goals_correct THEN 10
          WHEN v_loser_goals_correct  THEN 5
          ELSE 3
        END;
      ELSIF v_scoring_model = 'extended' THEN
        v_points := CASE
          WHEN v_winner_goals_correct THEN 10
          WHEN v_loser_goals_correct  THEN 8
          ELSE 5
        END;
      ELSE -- simplified
        v_points := CASE
          WHEN v_winner_goals_correct OR v_loser_goals_correct THEN 10
          ELSE 5
        END;
      END IF;
    END IF;

    v_points := ROUND(v_points * v_multiplier);

    UPDATE public.bolao_predictions
    SET points_earned = v_points,
        updated_at    = now()
    WHERE id = pred.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
