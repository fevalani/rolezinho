-- ══════════════════════════════════════════════════════════════
-- Bolão — endurecimento (auditoria S-02, S-03, S-07)
-- Rodar no Supabase SQL Editor depois das demais migrations do bolão.
-- ══════════════════════════════════════════════════════════════

-- ── S-03: create_bolao_pool deixa de confiar no p_user_id ───────
-- Antes o cliente informava quem era o criador (qualquer um criava bolão
-- "em nome" de outra pessoa). Agora é sempre auth.uid().
DROP FUNCTION IF EXISTS public.create_bolao_pool(TEXT, UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_bolao_pool(TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_bolao_pool(TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_bolao_pool(
  p_name            TEXT,
  p_championship_id UUID,
  p_scoring_model   TEXT  DEFAULT 'classic',
  p_scoring_config  JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pool_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  INSERT INTO public.bolao_pools (name, championship_id, created_by, scoring_model, scoring_config)
  VALUES (p_name, p_championship_id, v_uid, p_scoring_model, p_scoring_config)
  RETURNING id INTO v_pool_id;

  INSERT INTO public.bolao_pool_members (pool_id, user_id) VALUES (v_pool_id, v_uid);
  RETURN v_pool_id;
END $$;

REVOKE ALL ON FUNCTION public.create_bolao_pool(TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bolao_pool(TEXT, UUID, TEXT, JSONB) TO authenticated;

-- ── S-07: trava de palpite no banco ─────────────────────────────
-- Espelha isMatchLocked do cliente (bolaoService.ts): partida fora de
-- TIMED/SCHEDULED, ou a menos de 1 min do início, não aceita mudança de placar.
-- Chamadas diretas da API rodam como `authenticated`; as funções
-- SECURITY DEFINER (score_match_predictions) rodam como dono e podem gravar
-- points_earned, que o usuário comum NÃO pode alterar. (O trigger é SECURITY
-- INVOKER de propósito: com DEFINER, current_user seria sempre o dono.)
CREATE OR REPLACE FUNCTION public.bolao_predictions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_match public.bolao_matches;
  v_match_id UUID := COALESCE(NEW.match_id, OLD.match_id);
  v_direct BOOLEAN := (current_user = 'authenticated');
  v_locked BOOLEAN;
BEGIN
  IF NOT v_direct THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' AND NEW.points_earned IS NOT NULL THEN
    RAISE EXCEPTION 'Pontos são calculados pelo servidor';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.points_earned IS DISTINCT FROM OLD.points_earned THEN
    RAISE EXCEPTION 'Pontos são calculados pelo servidor';
  END IF;

  SELECT * INTO v_match FROM public.bolao_matches WHERE id = v_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partida não encontrada'; END IF;

  v_locked := v_match.status NOT IN ('TIMED', 'SCHEDULED')
           OR now() > v_match.utc_date - INTERVAL '1 minute';

  IF v_locked AND (
       TG_OP = 'INSERT'
    OR TG_OP = 'DELETE'
    OR NEW.home_goals IS DISTINCT FROM OLD.home_goals
    OR NEW.away_goals IS DISTINCT FROM OLD.away_goals
  ) THEN
    RAISE EXCEPTION 'Palpites encerrados para esta partida';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS bolao_predictions_guard ON public.bolao_predictions;
CREATE TRIGGER bolao_predictions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bolao_predictions
  FOR EACH ROW EXECUTE FUNCTION public.bolao_predictions_guard();

-- ── S-02 (parcial): partidas já iniciadas ficam protegidas ──────
-- O sync de resultados ainda roda no navegador de quem abre o bolão, então
-- as policies "write" continuam abertas para usuários logados. Este trigger
-- impede o dano mais grave sem quebrar o sync: reescrever times/data/campeonato
-- de partida existente e apagar partidas que já começaram. Fechar de vez exige
-- mover o sync para uma function server-side (service role) — ver auditoria.
CREATE OR REPLACE FUNCTION public.bolao_matches_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' OR public.is_app_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED') THEN
      RAISE EXCEPTION 'Partida já iniciada não pode ser apagada';
    END IF;
    RETURN OLD;
  END IF;

  -- "iniciada" = em andamento ou encerrada. Adiada/suspensa pode ser reagendada.
  IF OLD.status IN ('IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED') AND (
       NEW.utc_date        IS DISTINCT FROM OLD.utc_date
    OR NEW.home_team       IS DISTINCT FROM OLD.home_team
    OR NEW.away_team       IS DISTINCT FROM OLD.away_team
    OR NEW.championship_id IS DISTINCT FROM OLD.championship_id
    OR NEW.fd_match_id     IS DISTINCT FROM OLD.fd_match_id
  ) THEN
    RAISE EXCEPTION 'Partida já iniciada: só placar e status podem mudar';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bolao_matches_guard ON public.bolao_matches;
CREATE TRIGGER bolao_matches_guard
  BEFORE UPDATE OR DELETE ON public.bolao_matches
  FOR EACH ROW EXECUTE FUNCTION public.bolao_matches_guard();
