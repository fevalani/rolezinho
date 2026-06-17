-- ══════════════════════════════════════════════════════════════
-- LETRECO — Jogo da palavra do dia
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════
--
-- A palavra do dia é calculada de forma DETERMINÍSTICA no cliente
-- (a partir da data + lista local `words.txt`), igual para todos.
-- Por isso não há tabela de palavra do dia: o banco só guarda as
-- partidas dos jogadores para montar ranking e estatísticas.

-- ─── letreco_games ──────────────────────────────────────────
-- Uma partida por jogador por dia.

CREATE TABLE IF NOT EXISTS public.letreco_games (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_date    DATE        NOT NULL,                 -- "YYYY-MM-DD" (America/Sao_Paulo)
  guesses      TEXT[]      NOT NULL DEFAULT '{}',    -- palpites na ordem
  status       TEXT        NOT NULL DEFAULT 'playing'
               CHECK (status IN ('playing', 'won', 'lost')),
  attempts     INTEGER     NOT NULL DEFAULT 0,       -- nº de palpites usados
  score        INTEGER     NOT NULL DEFAULT 0,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- garante "uma vez por dia"
  CONSTRAINT uq_letreco_user_date UNIQUE (user_id, game_date)
);

CREATE INDEX IF NOT EXISTS idx_letreco_games_date
  ON public.letreco_games(game_date);

CREATE INDEX IF NOT EXISTS idx_letreco_games_user
  ON public.letreco_games(user_id);

-- ─── Auto-update timestamp ──────────────────────────────────
-- Reutiliza a função handle_updated_at() já criada na migration 001.

DROP TRIGGER IF EXISTS on_letreco_games_updated ON public.letreco_games;
CREATE TRIGGER on_letreco_games_updated
  BEFORE UPDATE ON public.letreco_games
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE public.letreco_games ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados podem LER as partidas (ranking da turma).
-- Não expõe a palavra do dia: as partidas só guardam os palpites.
DROP POLICY IF EXISTS "letreco_games: autenticados lêem" ON public.letreco_games;
CREATE POLICY "letreco_games: autenticados lêem"
  ON public.letreco_games FOR SELECT
  TO authenticated
  USING (true);

-- Cada jogador só insere a própria partida.
DROP POLICY IF EXISTS "letreco_games: dono insere" ON public.letreco_games;
CREATE POLICY "letreco_games: dono insere"
  ON public.letreco_games FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Cada jogador só atualiza a própria partida.
DROP POLICY IF EXISTS "letreco_games: dono atualiza" ON public.letreco_games;
CREATE POLICY "letreco_games: dono atualiza"
  ON public.letreco_games FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- PRONTO! Tabela do Letreco criada com RLS configurado.
-- Próximo passo: a rota /letreco já está registrada no App.tsx.
-- ══════════════════════════════════════════════════════════════
