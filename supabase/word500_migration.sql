-- Migration: word500_games
-- Mesmo esquema de letroso_games/sudoku_games. Word500 é a variante
-- Mastermind do Wordle: guesses guarda as tentativas normalizadas; o
-- feedback (verdes/amarelos/vermelhos) é recalculado no cliente a partir
-- da palavra do dia, não precisa ser persistido.

create table if not exists public.word500_games (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  game_date    date not null,
  guesses      text[] not null default '{}',
  status       text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  attempts     int not null default 0,
  score        int not null default 0,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, game_date)
);

-- Índices
create index if not exists word500_games_game_date_idx on public.word500_games (game_date);
create index if not exists word500_games_user_id_idx   on public.word500_games (user_id);

-- RLS
alter table public.word500_games enable row level security;

-- Leitura: todos os usuários autenticados podem ver todos os jogos (leaderboard)
create policy "word500_games_select"
  on public.word500_games for select
  to authenticated
  using (true);

-- Insert: apenas o próprio usuário
create policy "word500_games_insert"
  on public.word500_games for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Update: apenas o próprio usuário
create policy "word500_games_update"
  on public.word500_games for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
