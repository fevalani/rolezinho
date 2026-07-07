-- Migration: sudoku_games
-- Mesmo padrão de letreco_games/letroso_games. Ver docs/letreco-sudoku-jogo-diario.md §5.

create table if not exists public.sudoku_games (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  game_date        date not null,
  difficulty       text not null default 'medio' check (difficulty in ('facil', 'medio', 'dificil')),
  board            text not null default '',
  mistakes         int not null default 0,
  elapsed_seconds  int not null default 0,
  status           text not null default 'playing' check (status in ('playing', 'won')),
  score            int not null default 0,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, game_date)
);

-- Índices
create index if not exists sudoku_games_game_date_idx on public.sudoku_games (game_date);
create index if not exists sudoku_games_user_id_idx   on public.sudoku_games (user_id);

-- RLS
alter table public.sudoku_games enable row level security;

-- Leitura: todos os usuários autenticados podem ver todos os jogos (leaderboard)
create policy "sudoku_games_select"
  on public.sudoku_games for select
  to authenticated
  using (true);

-- Insert: apenas o próprio usuário
create policy "sudoku_games_insert"
  on public.sudoku_games for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Update: apenas o próprio usuário
create policy "sudoku_games_update"
  on public.sudoku_games for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
