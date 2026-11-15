-- Ocasiões: temas criados pelo admin em /temas (dia, título, emoji principal e demais
-- emojis); o visual se monta sozinho e entra no ar no período. Rodar no SQL Editor do
-- Supabase. Todo mundo (logado) LÊ; só o admin ESCREVE.
--
-- Substitui as colunas custom_occasion / custom_emoji / occasion_md de
-- seasonal_themes_custom_migration.sql, que deixaram de ser usadas (podem ficar, não fazem mal).

create table if not exists public.seasonal_occasions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 60),
  emoji        text not null check (char_length(emoji) between 1 and 12),
  extras       text[] not null default '{}' check (cardinality(extras) <= 8),
  day_md       text not null check (day_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  days_before  int  not null default 0 check (days_before between 0 and 30),
  jumble       boolean not null default false,
  enabled      boolean not null default true,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.seasonal_occasions enable row level security;

drop policy if exists "seasonal_occasions_select" on public.seasonal_occasions;
create policy "seasonal_occasions_select"
  on public.seasonal_occasions
  for select to authenticated
  using (true);

drop policy if exists "seasonal_occasions_admin_write" on public.seasonal_occasions;
create policy "seasonal_occasions_admin_write"
  on public.seasonal_occasions
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'valanife@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'valanife@gmail.com');

-- Primeira ocasião: Dia Nacional de Atenção à Dislexia (16/11), com letras fora do lugar.
insert into public.seasonal_occasions (title, emoji, extras, day_md, days_before, jumble, enabled)
select 'Atenção à Dislexia', '🔤', array['b','d','p','q','m','w'], '11-16', 0, true, true
where not exists (select 1 from public.seasonal_occasions where title = 'Atenção à Dislexia');
