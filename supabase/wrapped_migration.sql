-- Wrapped (retrospectiva anual em stories). Rodar no SQL Editor do Supabase.
-- Edições configuradas pelo admin em /wrapped-admin (JSON em `config`).
-- Usuário logado LÊ só edições ativas e dentro da janela starts_at..ends_at; só o admin lê rascunhos e ESCREVE.
-- PENDENTE: rodar esta migration.

create table if not exists public.wrapped_editions (
  slug        text primary key check (slug ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Janela de exibição (datas no fuso de São Paulo, inclusive). Seguro rodar de novo.
alter table public.wrapped_editions add column if not exists starts_at date;
alter table public.wrapped_editions add column if not exists ends_at   date;

alter table public.wrapped_editions enable row level security;

drop policy if exists "wrapped_editions_select" on public.wrapped_editions;
create policy "wrapped_editions_select"
  on public.wrapped_editions
  for select to authenticated
  using (
    (
      is_active
      and (starts_at is null or starts_at <= (now() at time zone 'America/Sao_Paulo')::date)
      and (ends_at   is null or ends_at   >= (now() at time zone 'America/Sao_Paulo')::date)
    )
    or (auth.jwt() ->> 'email') = 'valanife@gmail.com'
  );

drop policy if exists "wrapped_editions_admin_write" on public.wrapped_editions;
create policy "wrapped_editions_admin_write"
  on public.wrapped_editions
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'valanife@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'valanife@gmail.com');
