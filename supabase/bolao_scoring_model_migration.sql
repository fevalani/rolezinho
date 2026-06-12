-- ═══════════════════════════════════════════════════════════════
-- Bolão – Modelos de Pontuação
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona coluna scoring_model na tabela bolao_pools
ALTER TABLE public.bolao_pools
ADD COLUMN IF NOT EXISTS scoring_model TEXT NOT NULL DEFAULT 'classic'
  CHECK (scoring_model IN ('classic', 'extended', 'simplified'));

-- 2. Atualiza create_bolao_pool para aceitar o modelo de pontuação
CREATE OR REPLACE FUNCTION public.create_bolao_pool(
  p_name            TEXT,
  p_championship_id UUID,
  p_user_id         UUID,
  p_scoring_model   TEXT DEFAULT 'classic'
)
RETURNS UUID AS $$
DECLARE
  v_pool_id UUID;
BEGIN
  INSERT INTO public.bolao_pools (name, championship_id, created_by, scoring_model)
  VALUES (p_name, p_championship_id, p_user_id, p_scoring_model)
  RETURNING id INTO v_pool_id;

  INSERT INTO public.bolao_pool_members (pool_id, user_id)
  VALUES (v_pool_id, p_user_id);

  RETURN v_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Reescreve score_match_predictions com suporte a modelos e filtro por pool
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
  v_points                INTEGER;
  v_updated               INTEGER := 0;
  v_real_result           TEXT;
  v_pred_result           TEXT;
  v_winner_goals_correct  BOOLEAN;
  v_loser_goals_correct   BOOLEAN;
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
    -- Busca o modelo de pontuação do bolão deste palpite
    SELECT scoring_model INTO v_scoring_model
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

    -- Placar exato: sempre 15
    IF pred.home_goals = p_real_home AND pred.away_goals = p_real_away THEN
      v_points := 15;

    -- Resultado errado: sempre 0
    ELSIF v_real_result != v_pred_result THEN
      v_points := 0;

    -- Empate certo, gols diferentes
    ELSIF v_real_result = 'draw' THEN
      v_points := CASE WHEN v_scoring_model = 'classic' THEN 10 ELSE 5 END;

    -- Vencedor correto (não-empate)
    ELSE
      v_winner_goals_correct := CASE
        WHEN v_real_result = 'home' THEN pred.home_goals = p_real_home
        ELSE pred.away_goals = p_real_away
      END;
      v_loser_goals_correct := CASE
        WHEN v_real_result = 'home' THEN pred.away_goals = p_real_away
        ELSE pred.home_goals = p_real_home
      END;

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

-- 4. Função para resetar pontuações de um bolão específico
CREATE OR REPLACE FUNCTION public.reset_pool_scores(p_pool_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_predictions
  SET points_earned = NULL,
      updated_at    = now()
  WHERE pool_id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função para atualizar scoring_model (bypassa RLS – não há UPDATE policy em bolao_pools)
CREATE OR REPLACE FUNCTION public.update_pool_scoring_model(
  p_pool_id       UUID,
  p_scoring_model TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_pools
  SET scoring_model = p_scoring_model,
      updated_at    = now()
  WHERE id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
