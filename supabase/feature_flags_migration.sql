-- Features ligadas/desligadas pelo admin (painel /admin/features), sem precisar de deploy.
-- Rodar no SQL Editor do Supabase DEPOIS de admin_roles_migration.sql (usa is_app_admin()).
-- Sem linha = vale o padrão do código (APP_FEATURES.enabled). É só VISIBILIDADE (Home/menu mostram
-- "Em breve"); não bloqueia o acesso às tabelas da feature.

create table if not exists public.feature_flags (
  feature_id  text primary key check (char_length(feature_id) between 1 and 60),
  enabled     boolean not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

drop policy if exists "feature_flags_select" on public.feature_flags;
create policy "feature_flags_select"
  on public.feature_flags
  for select to authenticated
  using (true);

drop policy if exists "feature_flags_admin_write" on public.feature_flags;
create policy "feature_flags_admin_write"
  on public.feature_flags
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());
