-- ══════════════════════════════════════════════════════════════
-- DUELOS — Rankings por comparações par a par, abertos a todos do app
-- Execute este SQL no Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.duel_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⚔️',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- position = ordem original de inserção (o motor depende dela para ser determinístico)
CREATE TABLE IF NOT EXISTS public.duel_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id UUID NOT NULL REFERENCES public.duel_rankings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.duel_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id UUID NOT NULL REFERENCES public.duel_rankings(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES public.duel_items(id) ON DELETE CASCADE,
  loser_id UUID NOT NULL REFERENCES public.duel_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ranking_id, user_id, winner_id, loser_id),
  CHECK (winner_id <> loser_id)
);

CREATE INDEX IF NOT EXISTS idx_duel_items_ranking ON public.duel_items(ranking_id);
CREATE INDEX IF NOT EXISTS idx_duel_comparisons_ranking ON public.duel_comparisons(ranking_id, user_id, created_at);

-- ─── RLS ────────────────────────────────────────────────────
-- Duelo aberto: todos leem; só o dono cria/apaga o duelo e os itens.
-- Cada usuário só grava/apaga as próprias comparações; todos leem
-- (necessário para o ranking final agregado e para ver o ranking de cada pessoa).

ALTER TABLE public.duel_rankings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Duel Rankings: autenticados veem"
  ON public.duel_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Rankings: dono cria"
  ON public.duel_rankings FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Duel Rankings: dono apaga"
  ON public.duel_rankings FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Duel Items: autenticados veem"
  ON public.duel_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Items: dono cria"
  ON public.duel_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.duel_rankings r WHERE r.id = ranking_id AND r.owner_id = auth.uid()));

CREATE POLICY "Duel Comparisons: autenticados veem"
  ON public.duel_comparisons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Comparisons: usuario cria as suas"
  ON public.duel_comparisons FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Duel Comparisons: usuario apaga as suas"
  ON public.duel_comparisons FOR DELETE TO authenticated USING (auth.uid() = user_id);
