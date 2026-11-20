-- Migration incremental: nível de dificuldade do Fronteiras (fácil / difícil)
-- Rodar depois de `fronteiras_migration.sql`. Partidas antigas ficam como 'easy'.
-- O nível é escolhido uma vez por dia; o difícil multiplica a pontuação no cliente.

alter table public.fronteiras_games
  add column if not exists difficulty text not null default 'easy'
    check (difficulty in ('easy', 'hard'));
