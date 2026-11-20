-- ══════════════════════════════════════════════════════════════
-- Arena — saldo e prêmios só mudam por RPC (auditoria S-01)
-- Rodar no Supabase SQL Editor depois de arena_migration.sql.
-- Antes: o dono podia dar UPDATE na própria carteira/aposta pelo console
-- (saldo infinito). Agora o cliente só LÊ; toda escrita de dinheiro passa
-- por funções SECURITY DEFINER que usam auth.uid() e validam o estado.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Fecha as portas diretas ──────────────────────────────
DROP POLICY IF EXISTS "Arena Wallets: usuário insere própria"    ON public.arena_wallets;
DROP POLICY IF EXISTS "Arena Wallets: usuário atualiza própria"  ON public.arena_wallets;
DROP POLICY IF EXISTS "Arena Bets: usuário insere própria"       ON public.arena_bets;
DROP POLICY IF EXISTS "Arena Bets: atualizar"                    ON public.arena_bets;
DROP POLICY IF EXISTS "Arena Bets: usuário exclui própria"       ON public.arena_bets;
-- O criador só muda status/resultado do caso pelas RPCs abaixo.
DROP POLICY IF EXISTS "Arena Duels: criador atualiza"            ON public.arena_duels;

-- ── 2. Carteira: cria com 1000 pts (idempotente) ────────────
CREATE OR REPLACE FUNCTION public.arena_ensure_wallet()
RETURNS public.arena_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet public.arena_wallets;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  INSERT INTO public.arena_wallets (user_id, balance) VALUES (v_uid, 1000)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.arena_wallets WHERE user_id = v_uid;
  RETURN v_wallet;
END $$;

-- ── 3. Apostar: valida caso aberto, valor e saldo; debita junto ──
CREATE OR REPLACE FUNCTION public.arena_place_bet(
  p_duel_id UUID, p_side TEXT, p_amount INTEGER
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_duel public.arena_duels;
  v_odds NUMERIC;
  v_balance INTEGER;
  v_bet_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_side NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'Lado inválido'; END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  SELECT * INTO v_duel FROM public.arena_duels WHERE id = p_duel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso não encontrado'; END IF;
  IF v_duel.status <> 'open' THEN RAISE EXCEPTION 'Este caso não aceita mais apostas'; END IF;

  INSERT INTO public.arena_wallets (user_id, balance) VALUES (v_uid, 1000)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.arena_wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  v_odds := CASE p_side WHEN 'A' THEN v_duel.odds_a WHEN 'B' THEN v_duel.odds_b ELSE v_duel.odds_c END;

  -- UNIQUE (duel_id, user_id) devolve 23505 se já apostou
  INSERT INTO public.arena_bets (duel_id, user_id, side, amount, potential_payout)
  VALUES (p_duel_id, v_uid, p_side, p_amount, floor(p_amount * v_odds)::INTEGER)
  RETURNING id INTO v_bet_id;

  UPDATE public.arena_wallets
     SET balance = balance - p_amount, updated_at = now()
   WHERE user_id = v_uid;
  RETURN v_bet_id;
END $$;

-- ── 4. Desfazer aposta (só enquanto o caso não foi resolvido) ──
CREATE OR REPLACE FUNCTION public.arena_delete_bet(p_bet_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bet public.arena_bets;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_bet FROM public.arena_bets WHERE id = p_bet_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aposta não encontrada'; END IF;
  SELECT status INTO v_status FROM public.arena_duels WHERE id = v_bet.duel_id;
  IF v_status = 'resolved' THEN RAISE EXCEPTION 'O caso já foi resolvido'; END IF;

  DELETE FROM public.arena_bets WHERE id = p_bet_id;
  UPDATE public.arena_wallets
     SET balance = balance + v_bet.amount, updated_at = now()
   WHERE user_id = v_uid;
END $$;

-- ── 5. Fechar apostas (só o criador) ────────────────────────
CREATE OR REPLACE FUNCTION public.arena_close_duel(p_duel_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.arena_duels
     SET status = 'closed', updated_at = now()
   WHERE id = p_duel_id AND created_by = auth.uid() AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível fechar o caso'; END IF;
END $$;

-- ── 6. Resolver (só o criador): grava veredito e calcula prêmios ──
CREATE OR REPLACE FUNCTION public.arena_resolve_duel(
  p_duel_id UUID, p_result TEXT, p_verdict TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duel public.arena_duels;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_result NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'Resultado inválido'; END IF;

  SELECT * INTO v_duel FROM public.arena_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'Só o criador resolve o caso';
  END IF;
  IF v_duel.status = 'resolved' THEN RAISE EXCEPTION 'O caso já foi resolvido'; END IF;

  UPDATE public.arena_duels
     SET status = 'resolved', result = p_result, verdict = p_verdict, updated_at = now()
   WHERE id = p_duel_id;

  UPDATE public.arena_bets
     SET actual_payout = CASE
       WHEN side = p_result THEN floor(amount * CASE side
         WHEN 'A' THEN v_duel.odds_a WHEN 'B' THEN v_duel.odds_b ELSE v_duel.odds_c END)::INTEGER
       ELSE 0 END
   WHERE duel_id = p_duel_id;
END $$;

-- ── 7. Resgatar prêmio (idempotente; valor vem do banco) ────
CREATE OR REPLACE FUNCTION public.arena_claim_payout(p_bet_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bet public.arena_bets;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_bet FROM public.arena_bets WHERE id = p_bet_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aposta não encontrada'; END IF;
  IF v_bet.payout_claimed THEN RAISE EXCEPTION 'Prêmio já resgatado'; END IF;
  IF COALESCE(v_bet.actual_payout, 0) <= 0 THEN RAISE EXCEPTION 'Sem prêmio a resgatar'; END IF;

  UPDATE public.arena_bets SET payout_claimed = true WHERE id = p_bet_id;
  UPDATE public.arena_wallets
     SET balance = balance + v_bet.actual_payout, updated_at = now()
   WHERE user_id = v_uid;
  RETURN v_bet.actual_payout;
END $$;

-- ── 8. Permissões: só usuários logados executam ─────────────
REVOKE ALL ON FUNCTION public.arena_ensure_wallet()                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arena_place_bet(UUID, TEXT, INTEGER)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arena_delete_bet(UUID)                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arena_close_duel(UUID)                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arena_resolve_duel(UUID, TEXT, TEXT)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arena_claim_payout(UUID)                    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arena_ensure_wallet()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_place_bet(UUID, TEXT, INTEGER)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_delete_bet(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_close_duel(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_resolve_duel(UUID, TEXT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_claim_payout(UUID)                 TO authenticated;
