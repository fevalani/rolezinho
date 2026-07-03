-- Migration incremental: adiciona dificuldade ao sudoku_games
-- Rodar SÓ SE `sudoku_migration.sql` já foi executado antes (tabela sudoku_games já existe).
-- Se ainda não rodou nenhuma, use a versão já atualizada de sudoku_migration.sql — não precisa desta aqui.

alter table public.sudoku_games
  add column if not exists difficulty text not null default 'medio'
    check (difficulty in ('facil', 'medio', 'dificil'));
