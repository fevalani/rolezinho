-- Aprovação dos temas sazonais (Natal, Ano Novo, Páscoa...).
-- Todo mundo (logado) LÊ quais temas estão aprovados; só o admin ESCREVE.
-- Rodar no SQL Editor do Supabase.

create table if not exists public.seasonal_theme_approvals (
  theme_id    text primary key,
  approved    boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.seasonal_theme_approvals enable row level security;

drop policy if exists "seasonal_approvals_select" on public.seasonal_theme_approvals;
create policy "seasonal_approvals_select"
  on public.seasonal_theme_approvals
  for select to authenticated
  using (true);

drop policy if exists "seasonal_approvals_admin_write" on public.seasonal_theme_approvals;
create policy "seasonal_approvals_admin_write"
  on public.seasonal_theme_approvals
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'valanife@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'valanife@gmail.com');
