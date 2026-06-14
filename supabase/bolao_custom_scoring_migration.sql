-- ═══════════════════════════════════════════════════════════════
-- Bolão – Modelo de Pontuação Personalizado
-- Execute no Supabase SQL Editor (depois de bolao_scoring_model_migration.sql)
-- ═══════════════════════════════════════════════════════════════

-- 1. Permite o valor 'custom' em scoring_model e adiciona scoring_config (JSONB)
ALTER TABLE public.bolao_pools
  DROP CONSTRAINT IF EXISTS bolao_pools_scoring_model_check;

ALTER TABLE public.bolao_pools
  ADD CONSTRAINT bolao_pools_scoring_model_check
  CHECK (scoring_model IN ('classic', 'extended', 'simplified', 'custom'));

ALTER TABLE public.bolao_pools
  ADD COLUMN IF NOT EXISTS scoring_config JSONB;

-- 2. create_bolao_pool agora aceita scoring_config
DROP FUNCTION IF EXISTS public.create_bolao_pool(TEXT, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_bolao_pool(
  p_name            TEXT,
  p_championship_id UUID,
  p_user_id         UUID,
  p_scoring_model   TEXT  DEFAULT 'classic',
  p_scoring_config  JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_pool_id UUID;
BEGIN
  INSERT INTO public.bolao_pools (name, championship_id, created_by, scoring_model, scoring_config)
  VALUES (p_name, p_championship_id, p_user_id, p_scoring_model, p_scoring_config)
  RETURNING id INTO v_pool_id;

  INSERT INTO public.bolao_pool_members (pool_id, user_id)
  VALUES (v_pool_id, p_user_id);

  RETURN v_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. update_pool_scoring_model agora grava scoring_config
DROP FUNCTION IF EXISTS public.update_pool_scoring_model(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_pool_scoring_model(
  p_pool_id        UUID,
  p_scoring_model  TEXT,
  p_scoring_config JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_pools
  SET scoring_model  = p_scoring_model,
      scoring_config = p_scoring_config,
      updated_at     = now()
  WHERE id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. score_match_predictions com suporte ao modelo 'custom'
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

  FOR pred IN
    SELECT bp.id, bp.home_goals, bp.away_goals, bp.pool_id
    FROM public.bolao_predictions bp
    WHERE bp.match_id = p_match_id
      AND (p_pool_id IS NULL OR bp.pool_id = p_pool_id)
  LOOP
    -- Busca o modelo de pontuação e config do bolão deste palpite
    SELECT scoring_model, scoring_config INTO v_scoring_model, v_config
    FROM public.bolao_pools
    WHERE id = pred.pool_id;

    IF v_scoring_model IS NULL THEN
      v_scoring_model := 'classic';
    END IF;

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

    UPDATE public.bolao_predictions
    SET points_earned = v_points,
        updated_at    = now()
    WHERE id = pred.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
