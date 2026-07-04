-- ══════════════════════════════════════════════════════════════
-- RANKING DE CAMPEÕES — Vincular pessoas a usuários do app
-- Execute SÓ se você já rodou ranking_migration.sql ANTES desta
-- atualização (ranking_entries ainda tem a coluna "name" antiga).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ranking_entries
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_name TEXT;

-- Migra os nomes já cadastrados (todos eram texto livre até agora)
UPDATE public.ranking_entries
SET external_name = name
WHERE external_name IS NULL;

ALTER TABLE public.ranking_entries
  DROP COLUMN name;

ALTER TABLE public.ranking_entries
  ADD CONSTRAINT ranking_entries_profile_or_name
  CHECK (profile_id IS NOT NULL OR external_name IS NOT NULL);

-- Evita adicionar o mesmo usuário do app duas vezes na mesma tabela
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ranking_entry_table_profile
  ON public.ranking_entries(table_id, profile_id)
  WHERE profile_id IS NOT NULL;
