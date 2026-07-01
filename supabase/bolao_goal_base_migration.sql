-- ═══════════════════════════════════════════════════════════════
-- Bolão – Base de Gols para Pontuação
-- Execute no Supabase SQL Editor (depois de bolao_stage_multiplier_migration.sql)
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona goal_base em bolao_pools
--    'regular'    = 90min + acréscimos (resultado ao fim dos 90 minutos, sem prorrogação)
--    'extra_time' = 90min + acréscimos + prorrogação (resultado oficial; padrão)
--    'penalty'    = extra_time + gols convertidos nos pênaltis contados no placar
ALTER TABLE public.bolao_pools
ADD COLUMN IF NOT EXISTS goal_base TEXT NOT NULL DEFAULT 'extra_time'
  CHECK (goal_base IN ('regular', 'extra_time', 'penalty'));

-- 2. Adiciona colunas de detalhamento de placar em bolao_matches
--    score_home / score_away     = placar após prorrogação (sem pênaltis) — coluna existente
--    score_regular_home / away   = placar aos 90min (null quando igual a score_home)
--    score_pen_home / away       = gols convertidos na disputa de pênaltis (null quando não houve)
ALTER TABLE public.bolao_matches
ADD COLUMN IF NOT EXISTS score_regular_home INTEGER,
ADD COLUMN IF NOT EXISTS score_regular_away INTEGER,
ADD COLUMN IF NOT EXISTS score_pen_home     INTEGER,
ADD COLUMN IF NOT EXISTS score_pen_away     INTEGER;

-- 3. Função para atualizar goal_base (bypassa RLS)
CREATE OR REPLACE FUNCTION public.update_pool_goal_base(
  p_pool_id  UUID,
  p_goal_base TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_pools
  SET goal_base  = p_goal_base,
      updated_at = now()
  WHERE id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Dropa a assinatura antiga de score_match_predictions (que recebia os gols por parâmetro).
--    A nova versão lê o placar diretamente do banco e aplica o goal_base do bolão.
DROP FUNCTION IF EXISTS public.score_match_predictions(UUID, INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.score_match_predictions(UUID, INTEGER, INTEGER);

-- 5. Nova score_match_predictions — lê placar do banco, respeita goal_base
CREATE OR REPLACE FUNCTION public.score_match_predictions(
  p_match_id UUID,
  p_pool_id  UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_match                 RECORD;
  pred                    RECORD;
  v_scoring_model         TEXT;
  v_config                JSONB;
  v_stage_multipliers     JSONB;
  v_goal_base             TEXT;
  v_multiplier            NUMERIC;
  v_effective_home        INTEGER;
  v_effective_away        INTEGER;
  v_points                INTEGER;
  v_updated               INTEGER := 0;
  v_real_result           TEXT;
  v_pred_result           TEXT;
  v_winner_goals_correct  BOOLEAN;
  v_loser_goals_correct   BOOLEAN;
  v_saldo_correct         BOOLEAN;
BEGIN
  SELECT * INTO v_match FROM public.bolao_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_match.score_home IS NULL OR v_match.score_away IS NULL THEN RETURN 0; END IF;

  FOR pred IN
    SELECT bp.id, bp.home_goals, bp.away_goals, bp.pool_id
    FROM public.bolao_predictions bp
    WHERE bp.match_id = p_match_id
      AND (p_pool_id IS NULL OR bp.pool_id = p_pool_id)
  LOOP
    SELECT scoring_model, scoring_config, stage_multipliers, goal_base
    INTO v_scoring_model, v_config, v_stage_multipliers, v_goal_base
    FROM public.bolao_pools
    WHERE id = pred.pool_id;

    IF v_scoring_model IS NULL THEN v_scoring_model := 'classic'; END IF;
    IF v_goal_base IS NULL THEN v_goal_base := 'extra_time'; END IF;

    -- Placar efetivo de acordo com a base escolhida pelo admin
    CASE v_goal_base
      WHEN 'regular' THEN
        -- 90min: usa score_regular se disponível, senão cai em score_home (sem prorrogação)
        v_effective_home := COALESCE(v_match.score_regular_home, v_match.score_home);
        v_effective_away := COALESCE(v_match.score_regular_away, v_match.score_away);
      WHEN 'penalty' THEN
        -- prorrogação + gols dos pênaltis somados ao placar
        v_effective_home := v_match.score_home + COALESCE(v_match.score_pen_home, 0);
        v_effective_away := v_match.score_away + COALESCE(v_match.score_pen_away, 0);
      ELSE -- 'extra_time' (padrão)
        v_effective_home := v_match.score_home;
        v_effective_away := v_match.score_away;
    END CASE;

    IF v_effective_home IS NULL OR v_effective_away IS NULL THEN CONTINUE; END IF;

    v_multiplier := COALESCE((v_stage_multipliers->>v_match.stage)::numeric, 1);

    v_real_result := CASE
      WHEN v_effective_home > v_effective_away THEN 'home'
      WHEN v_effective_home < v_effective_away THEN 'away'
      ELSE 'draw'
    END;

    v_pred_result := CASE
      WHEN pred.home_goals > pred.away_goals THEN 'home'
      WHEN pred.home_goals < pred.away_goals THEN 'away'
      ELSE 'draw'
    END;

    v_winner_goals_correct := CASE
      WHEN v_real_result = 'home' THEN pred.home_goals = v_effective_home
      WHEN v_real_result = 'away' THEN pred.away_goals = v_effective_away
      ELSE FALSE
    END;
    v_loser_goals_correct := CASE
      WHEN v_real_result = 'home' THEN pred.away_goals = v_effective_away
      WHEN v_real_result = 'away' THEN pred.home_goals = v_effective_home
      ELSE FALSE
    END;
    v_saldo_correct := (pred.home_goals - pred.away_goals) = (v_effective_home - v_effective_away);

    IF v_scoring_model = 'custom' THEN
      IF pred.home_goals = v_effective_home AND pred.away_goals = v_effective_away THEN
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

    ELSIF pred.home_goals = v_effective_home AND pred.away_goals = v_effective_away THEN
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
