-- ══════════════════════════════════════════════════════════════
-- BRIGA DE BAR — Arena de Apostas Hipotéticas
-- Execute este SQL no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Carteiras virtuais (1000 pts de boas-vindas)
CREATE TABLE IF NOT EXISTS public.arena_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embates
CREATE TABLE IF NOT EXISTS public.arena_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  side_a TEXT NOT NULL,
  side_b TEXT NOT NULL,
  category TEXT NOT NULL,
  creator_context TEXT,
  odds_a NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  odds_draw NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  odds_b NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  odds_justification TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  result TEXT CHECK (result IN ('A', 'draw', 'B')),
  verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apostas
CREATE TABLE IF NOT EXISTS public.arena_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id UUID NOT NULL REFERENCES public.arena_duels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('A', 'draw', 'B')),
  amount INTEGER NOT NULL CHECK (amount >= 1),
  potential_payout INTEGER,
  actual_payout INTEGER,
  payout_claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(duel_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_arena_duels_created ON public.arena_duels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_duels_status  ON public.arena_duels(status);
CREATE INDEX IF NOT EXISTS idx_arena_bets_duel     ON public.arena_bets(duel_id);
CREATE INDEX IF NOT EXISTS idx_arena_bets_user     ON public.arena_bets(user_id);

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE public.arena_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_duels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_bets    ENABLE ROW LEVEL SECURITY;

-- Wallets: usuário vê todas, mas só mexe na própria
CREATE POLICY "Arena Wallets: autenticados veem"
  ON public.arena_wallets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Arena Wallets: usuário insere própria"
  ON public.arena_wallets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Arena Wallets: usuário atualiza própria"
  ON public.arena_wallets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Duels: todos veem; criador atualiza
CREATE POLICY "Arena Duels: autenticados veem"
  ON public.arena_duels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Arena Duels: autenticados criam"
  ON public.arena_duels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Arena Duels: criador atualiza"
  ON public.arena_duels FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

-- Bets: todos veem; usuário insere própria;
--       dono da aposta ou criador do duelo pode atualizar (payout)
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

-- ─── Realtime ────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arena_bets;

-- ─── Auto-timestamp ──────────────────────────────────────────

CREATE TRIGGER arena_duels_updated_at
  BEFORE UPDATE ON public.arena_duels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
