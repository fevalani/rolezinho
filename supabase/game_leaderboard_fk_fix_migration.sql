-- Migration incremental: corrige o FK de user_id em letroso_games, sudoku_games
-- e word500_games pra apontar pra public.profiles(id) em vez de auth.users(id).
--
-- Por quê: o PostgREST só monta o JOIN embutido `profiles(display_name, avatar_url)`
-- (usado nos leaderboards do dia) quando existe uma foreign key DIRETA entre a
-- tabela consultada e `profiles`. Como essas 3 tabelas foram criadas apontando
-- pra auth.users(id) (e não pra public.profiles(id), como letreco_games já fazia),
-- toda query de leaderboard/ranking geral desses jogos falhava com
-- "PGRST200 - Could not find a relationship" — silenciosamente engolido pelo
-- try/catch do service, aparecendo como "Ninguém terminou ainda hoje" mesmo
-- com gente jogando e ganhando normalmente.
--
-- Rodar SÓ SE as tabelas já existem em produção (criadas antes desta correção).
-- Instalações novas já saem certas com as versões atualizadas de
-- letroso_migration.sql / sudoku_migration.sql / word500_migration.sql.

alter table public.letroso_games
  drop constraint if exists letroso_games_user_id_fkey;
alter table public.letroso_games
  add constraint letroso_games_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.sudoku_games
  drop constraint if exists sudoku_games_user_id_fkey;
alter table public.sudoku_games
  add constraint sudoku_games_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.word500_games
  drop constraint if exists word500_games_user_id_fkey;
alter table public.word500_games
  add constraint word500_games_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;
