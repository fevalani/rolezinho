-- Estatísticas do chat (/estatisticas). Rodar no SQL Editor do Supabase.
-- O pipeline local (scripts/chat-insights) gera o JSON e grava em chat_stats_snapshots (com a chave de serviço,
-- que ignora RLS). O app LÊ: só quem o admin marcou em chat_stats_viewers (e o próprio admin). Só o admin escreve.
-- ATENÇÃO: depois de rodar, ninguém além do admin vê nada até escolher quem em /admin/estatisticas.
-- Depende de public.is_app_admin() (admin_roles_migration.sql).
-- PENDENTE: rodar esta migration.

create table if not exists public.chat_stats_snapshots (
  slug        text primary key check (slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.chat_stats_snapshots enable row level security;

create table if not exists public.chat_stats_viewers (
  slug        text not null references public.chat_stats_snapshots(slug) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (slug, user_id)
);

alter table public.chat_stats_viewers enable row level security;

drop policy if exists "chat_stats_viewers_select" on public.chat_stats_viewers;
create policy "chat_stats_viewers_select"
  on public.chat_stats_viewers
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

drop policy if exists "chat_stats_viewers_admin_write" on public.chat_stats_viewers;
create policy "chat_stats_viewers_admin_write"
  on public.chat_stats_viewers
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "chat_stats_snapshots_select" on public.chat_stats_snapshots;
create policy "chat_stats_snapshots_select"
  on public.chat_stats_snapshots
  for select to authenticated
  using (
    (
      is_active
      and exists (
        select 1 from public.chat_stats_viewers v
        where v.slug = chat_stats_snapshots.slug and v.user_id = auth.uid()
      )
    )
    or public.is_app_admin()
  );

drop policy if exists "chat_stats_snapshots_admin_write" on public.chat_stats_snapshots;
create policy "chat_stats_snapshots_admin_write"
  on public.chat_stats_snapshots
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());
