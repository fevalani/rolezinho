-- Período de aplicação editável dos temas sazonais (por tema, "MM-DD", vale todo ano).
-- NULL = usa a janela padrão definida no código (src/lib/seasonal/themes.ts).
-- Rodar no SQL Editor do Supabase (depois de seasonal_themes_migration.sql).

alter table public.seasonal_theme_approvals
  add column if not exists start_md text,
  add column if not exists end_md   text;

alter table public.seasonal_theme_approvals
  drop constraint if exists seasonal_theme_window_format;
alter table public.seasonal_theme_approvals
  add constraint seasonal_theme_window_format check (
    (start_md is null or start_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
    and
    (end_md is null or end_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  );
