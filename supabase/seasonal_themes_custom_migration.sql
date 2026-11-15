-- Título, emoji e dia comemorativo editáveis dos temas sazonais (reaproveitar um visual
-- para outra data sem mexer no código). Tudo opcional: NULL = usa o que está no código
-- (src/lib/seasonal/themes.ts). Rodar no SQL Editor do Supabase, depois de
-- seasonal_themes_migration.sql e seasonal_themes_window_migration.sql.
--
-- Sem rodar esta migration o app continua funcionando com os valores do código; só a
-- edição de título/emoji/dia em /temas avisa que as colunas não existem.

alter table public.seasonal_theme_approvals
  add column if not exists custom_occasion text,
  add column if not exists custom_emoji    text,
  add column if not exists occasion_md     text;

alter table public.seasonal_theme_approvals
  drop constraint if exists seasonal_theme_custom_format;
alter table public.seasonal_theme_approvals
  add constraint seasonal_theme_custom_format check (
    (custom_occasion is null or char_length(custom_occasion) between 1 and 60)
    and
    (custom_emoji is null or char_length(custom_emoji) between 1 and 12)
    and
    (occasion_md is null or occasion_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  );
