-- Cargo de admin no banco (substitui o e-mail fixo nas políticas de RLS).
-- Rodar no SQL Editor do Supabase. Seguro rodar de novo.
-- ORDEM DE DEPLOY: rode esta migration ANTES de subir o app novo (o app pergunta ao banco quem é admin).
--
-- Quem é admin: linhas em public.app_admins. O 1º admin é a conta valanife@gmail.com (seed abaixo).
-- O painel (/admin/admins) adiciona/remove admins; o gatilho impede ficar sem nenhum.

create table if not exists public.app_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- "Eu sou admin?" — usada pelas políticas e pelo app. SECURITY DEFINER para não depender da RLS de app_admins.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Cada um enxerga a própria linha (para saber se é admin); admin enxerga e gerencia todas.
drop policy if exists "app_admins_select" on public.app_admins;
create policy "app_admins_select"
  on public.app_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

drop policy if exists "app_admins_write" on public.app_admins;
create policy "app_admins_write"
  on public.app_admins
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Nunca ficar sem admin (nem apagando o último usuário admin: o ON DELETE CASCADE cai aqui também).
create or replace function public.app_admins_keep_one()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.app_admins) <= 1 then
    raise exception 'Não é possível remover o último administrador';
  end if;
  return old;
end;
$$;

drop trigger if exists app_admins_keep_one on public.app_admins;
create trigger app_admins_keep_one
  before delete on public.app_admins
  for each row execute function public.app_admins_keep_one();

-- Seed: o admin atual.
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'valanife@gmail.com'
on conflict (user_id) do nothing;

-- ── Troca o e-mail fixo por is_app_admin() nas políticas existentes ──
-- (cada bloco só roda se a tabela já existir, para a ordem das migrations não importar)

do $$
begin
  if to_regclass('public.seasonal_theme_approvals') is not null then
    drop policy if exists "seasonal_approvals_admin_write" on public.seasonal_theme_approvals;
    create policy "seasonal_approvals_admin_write" on public.seasonal_theme_approvals
      for all to authenticated
      using (public.is_app_admin()) with check (public.is_app_admin());
  end if;

  if to_regclass('public.seasonal_occasions') is not null then
    drop policy if exists "seasonal_occasions_admin_write" on public.seasonal_occasions;
    create policy "seasonal_occasions_admin_write" on public.seasonal_occasions
      for all to authenticated
      using (public.is_app_admin()) with check (public.is_app_admin());
  end if;

  if to_regclass('public.wrapped_viewers') is not null then
    drop policy if exists "wrapped_viewers_select" on public.wrapped_viewers;
    create policy "wrapped_viewers_select" on public.wrapped_viewers
      for select to authenticated
      using (user_id = auth.uid() or public.is_app_admin());

    drop policy if exists "wrapped_viewers_admin_write" on public.wrapped_viewers;
    create policy "wrapped_viewers_admin_write" on public.wrapped_viewers
      for all to authenticated
      using (public.is_app_admin()) with check (public.is_app_admin());
  end if;

  if to_regclass('public.wrapped_editions') is not null then
    drop policy if exists "wrapped_editions_select" on public.wrapped_editions;
    create policy "wrapped_editions_select" on public.wrapped_editions
      for select to authenticated
      using (
        (
          is_active
          and (starts_at is null or starts_at <= (now() at time zone 'America/Sao_Paulo')::date)
          and (ends_at   is null or ends_at   >= (now() at time zone 'America/Sao_Paulo')::date)
          and exists (
            select 1 from public.wrapped_viewers v
            where v.slug = wrapped_editions.slug and v.user_id = auth.uid()
          )
        )
        or public.is_app_admin()
      );

    drop policy if exists "wrapped_editions_admin_write" on public.wrapped_editions;
    create policy "wrapped_editions_admin_write" on public.wrapped_editions
      for all to authenticated
      using (public.is_app_admin()) with check (public.is_app_admin());
  end if;
end $$;
