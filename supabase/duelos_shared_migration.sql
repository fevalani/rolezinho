-- ══════════════════════════════════════════════════════════════
-- DUELOS — migração da versão pessoal para duelos compartilhados
-- Rode no Supabase SQL Editor SE você já tinha rodado a primeira
-- duelos_migration.sql (tabelas duel_* já existem).
-- É idempotente: pode rodar mais de uma vez.
-- ══════════════════════════════════════════════════════════════

-- 1) user_id nas comparações (dados antigos pertencem ao dono do duelo)
ALTER TABLE public.duel_comparisons
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.duel_comparisons c
   SET user_id = r.owner_id
  FROM public.duel_rankings r
 WHERE c.ranking_id = r.id AND c.user_id IS NULL;

ALTER TABLE public.duel_comparisons ALTER COLUMN user_id SET NOT NULL;

-- 2) unique passa a ser por usuário
ALTER TABLE public.duel_comparisons
  DROP CONSTRAINT IF EXISTS duel_comparisons_ranking_id_winner_id_loser_id_key;
ALTER TABLE public.duel_comparisons
  DROP CONSTRAINT IF EXISTS duel_comparisons_ranking_id_user_id_winner_id_loser_id_key;
ALTER TABLE public.duel_comparisons
  ADD CONSTRAINT duel_comparisons_ranking_id_user_id_winner_id_loser_id_key
  UNIQUE (ranking_id, user_id, winner_id, loser_id);

DROP INDEX IF EXISTS public.idx_duel_comparisons_ranking;
CREATE INDEX IF NOT EXISTS idx_duel_comparisons_ranking
  ON public.duel_comparisons(ranking_id, user_id, created_at);

-- 3) políticas: remove as antigas (só dono) e cria as abertas
DROP POLICY IF EXISTS "Duel Rankings: dono tudo" ON public.duel_rankings;
DROP POLICY IF EXISTS "Duel Items: dono tudo" ON public.duel_items;
DROP POLICY IF EXISTS "Duel Comparisons: dono tudo" ON public.duel_comparisons;

DROP POLICY IF EXISTS "Duel Rankings: autenticados veem" ON public.duel_rankings;
DROP POLICY IF EXISTS "Duel Rankings: dono cria" ON public.duel_rankings;
DROP POLICY IF EXISTS "Duel Rankings: dono apaga" ON public.duel_rankings;
CREATE POLICY "Duel Rankings: autenticados veem"
  ON public.duel_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Rankings: dono cria"
  ON public.duel_rankings FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Duel Rankings: dono apaga"
  ON public.duel_rankings FOR DELETE TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Duel Items: autenticados veem" ON public.duel_items;
DROP POLICY IF EXISTS "Duel Items: dono cria" ON public.duel_items;
CREATE POLICY "Duel Items: autenticados veem"
  ON public.duel_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Items: dono cria"
  ON public.duel_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.duel_rankings r WHERE r.id = ranking_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Duel Comparisons: autenticados veem" ON public.duel_comparisons;
DROP POLICY IF EXISTS "Duel Comparisons: usuario cria as suas" ON public.duel_comparisons;
DROP POLICY IF EXISTS "Duel Comparisons: usuario apaga as suas" ON public.duel_comparisons;
CREATE POLICY "Duel Comparisons: autenticados veem"
  ON public.duel_comparisons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Duel Comparisons: usuario cria as suas"
  ON public.duel_comparisons FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Duel Comparisons: usuario apaga as suas"
  ON public.duel_comparisons FOR DELETE TO authenticated USING (auth.uid() = user_id);
