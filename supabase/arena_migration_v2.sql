-- ══════════════════════════════════════════════════════════════
-- BRIGA DE BAR — Migração v1 → v2
-- Execute no Supabase SQL Editor se já tiver as tabelas da v1
-- ══════════════════════════════════════════════════════════════
-- ATENÇÃO: apaga todos os casos e apostas existentes da v1.
-- As wallets são mantidas e resetadas para 1000 pts.
-- ══════════════════════════════════════════════════════════════

-- 1. Remover tabelas antigas (apostas primeiro por FK)
DROP TABLE IF EXISTS public.arena_bets CASCADE;
DROP TABLE IF EXISTS public.arena_duels CASCADE;

-- 2. Recriar arena_duels com schema v2
CREATE TABLE public.arena_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scenario TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  category TEXT NOT NULL,
  creator_context TEXT,
  odds_a NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  odds_b NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  odds_c NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  odds_justification TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  result TEXT CHECK (result IN ('A', 'B', 'C')),
  verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Recriar arena_bets com schema v2
CREATE TABLE public.arena_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id UUID NOT NULL REFERENCES public.arena_duels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('A', 'B', 'C')),
  amount INTEGER NOT NULL CHECK (amount >= 1),
  potential_payout INTEGER,
  actual_payout INTEGER,
  payout_claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(duel_id, user_id)
);

-- 4. Índices
CREATE INDEX idx_arena_duels_created ON public.arena_duels(created_at DESC);
CREATE INDEX idx_arena_duels_status  ON public.arena_duels(status);
CREATE INDEX idx_arena_bets_duel     ON public.arena_bets(duel_id);
CREATE INDEX idx_arena_bets_user     ON public.arena_bets(user_id);

-- 5. RLS
ALTER TABLE public.arena_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_bets  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Arena Duels: autenticados veem"
  ON public.arena_duels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Arena Duels: autenticados criam"
  ON public.arena_duels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Arena Duels: criador atualiza"
  ON public.arena_duels FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Arena Bets: autenticados veem"
  ON public.arena_bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Arena Bets: usuário insere própria"
  ON public.arena_bets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Arena Bets: atualizar"
  ON public.arena_bets FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.arena_duels
      WHERE id = arena_bets.duel_id AND created_by = auth.uid()
    )
  );
CREATE POLICY "Arena Bets: usuário exclui própria"
  ON public.arena_bets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6. Realtime (ignora erro se já registrado)
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_bets;

-- 7. Trigger de updated_at
CREATE TRIGGER arena_duels_updated_at
  BEFORE UPDATE ON public.arena_duels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 8. Resetar todos os saldos para 1000 pts
UPDATE public.arena_wallets
SET balance = 1000, updated_at = now();
