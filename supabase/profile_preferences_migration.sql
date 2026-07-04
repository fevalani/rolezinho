-- ══════════════════════════════════════════════════════════════
-- PREFERÊNCIAS DE PERFIL — tema (claro/escuro) e layout da home (beta)
-- Execute este SQL no Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark'
    CHECK (theme IN ('dark', 'light')),
  ADD COLUMN IF NOT EXISTS home_layout TEXT NOT NULL DEFAULT 'list'
    CHECK (home_layout IN ('list', 'grid'));
