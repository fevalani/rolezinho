-- ═══════════════════════════════════════════════════════════════
-- Fix: Scoring de palpites bypassando RLS
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Função que recalcula points_earned para todos os palpites de uma partida.
-- Roda como SECURITY DEFINER para poder atualizar linhas de outros usuários,
-- ignorando a política RLS que restringe writes ao próprio user_id.
CREATE OR REPLACE FUNCTION public.score_match_predictions(
  p_match_id UUID,
  p_real_home INTEGER,
  p_real_away INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  pred RECORD;
  v_points INTEGER;
  v_updated INTEGER := 0;
  v_real_result TEXT;
  v_pred_result TEXT;
BEGIN
  v_real_result := CASE
    WHEN p_real_home > p_real_away THEN 'home'
    WHEN p_real_home < p_real_away THEN 'away'
    ELSE 'draw'
  END;

  FOR pred IN
    SELECT id, home_goals, away_goals
    FROM public.bolao_predictions
    WHERE match_id = p_match_id
  LOOP
    v_pred_result := CASE
      WHEN pred.home_goals > pred.away_goals THEN 'home'
      WHEN pred.home_goals < pred.away_goals THEN 'away'
      ELSE 'draw'
    END;

    -- Placar exato
    IF pred.home_goals = p_real_home AND pred.away_goals = p_real_away THEN
      v_points := 15;

    -- Empate certo, gols diferentes
    ELSIF v_real_result = 'draw' AND v_pred_result = 'draw' THEN
      v_points := 10;

    -- Vencedor correto
    ELSIF v_real_result != 'draw' AND v_real_result = v_pred_result THEN
      IF v_real_result = 'home' AND pred.home_goals = p_real_home THEN
        v_points := 10; -- gols do vencedor corretos
      ELSIF v_real_result = 'away' AND pred.away_goals = p_real_away THEN
        v_points := 10;
      ELSIF v_real_result = 'home' AND pred.away_goals = p_real_away THEN
        v_points := 5; -- gols do perdedor corretos
      ELSIF v_real_result = 'away' AND pred.home_goals = p_real_home THEN
        v_points := 5;
      ELSE
        v_points := 3; -- só acertou o vencedor
      END IF;

    ELSE
      v_points := 0;
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
