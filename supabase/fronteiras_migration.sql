-- Migration: fronteiras_games
-- Jogo diário "Fronteiras" (estilo Travle). Mesmo esquema de word500_games.
-- guesses guarda os códigos ISO dos países chutados, em ordem; as cores e a
-- vitória são recalculadas no cliente a partir do par do dia, não persistem.
-- Disponível só no modo desenvolvedor (a regra é de visibilidade, não de permissão).

create table if not exists public.fronteiras_games (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  game_date    date not null,
  guesses      text[] not null default '{}',
  status       text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  attempts     int not null default 0,
  score        int not null default 0,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, game_date)
);

create index if not exists fronteiras_games_game_date_idx on public.fronteiras_games (game_date);
create index if not exists fronteiras_games_user_id_idx   on public.fronteiras_games (user_id);

alter table public.fronteiras_games enable row level security;

-- Leitura: autenticados veem todos (ranking)
create policy "fronteiras_games_select"
  on public.fronteiras_games for select
  to authenticated
  using (true);

-- Insert / update: só o próprio usuário
create policy "fronteiras_games_insert"
  on public.fronteiras_games for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "fronteiras_games_update"
  on public.fronteiras_games for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
