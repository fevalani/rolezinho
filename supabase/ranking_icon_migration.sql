-- ══════════════════════════════════════════════════════════════
-- RANKING DE CAMPEÕES — Emoji por tabela
-- Execute SÓ se você já rodou ranking_migration.sql ANTES desta
-- atualização (ranking_tables ainda não tem a coluna "icon").
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ranking_tables
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🏆';
