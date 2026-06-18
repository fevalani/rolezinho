-- ══════════════════════════════════════════════════════════════
-- LETRECO — Palavras da comunidade
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════
--
-- O dicionário base do jogo é o `words.txt` empacotado no app (estático).
-- Esta tabela guarda palavras SUGERIDAS pelos jogadores ao errar um palpite
-- que o jogo não conhecia — depois de validadas numa API pública de
-- dicionário. Elas AMPLIAM apenas o dicionário de VALIDAÇÃO de palpites.
--
-- ⚠️ IMPORTANTE: estas palavras NUNCA entram no sorteio da palavra do dia.
-- A palavra do dia é determinística a partir do `words.txt` local e precisa
-- ser igual em todos os dispositivos — se dependesse de palavras do banco,
-- celulares com conjuntos diferentes calculariam palavras do dia diferentes.

-- ─── letreco_suggested_words ────────────────────────────────
-- Uma palavra por linha (UNIQUE), já normalizada (5 letras A-Z, sem acento).

CREATE TABLE IF NOT EXISTS public.letreco_suggested_words (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  word        TEXT        NOT NULL,                    -- normalizada: 5 letras A-Z
  status      TEXT        NOT NULL DEFAULT 'approved'
              CHECK (status IN ('approved', 'pending', 'rejected')),
  source      TEXT,                                    -- ex.: 'dicionario-aberto'
  added_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_letreco_word UNIQUE (word)
);

CREATE INDEX IF NOT EXISTS idx_letreco_words_status
  ON public.letreco_suggested_words(status);

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE public.letreco_suggested_words ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados LÊEM (para montar o dicionário de validação).
DROP POLICY IF EXISTS "letreco_words: autenticados lêem" ON public.letreco_suggested_words;
CREATE POLICY "letreco_words: autenticados lêem"
  ON public.letreco_suggested_words FOR SELECT
  TO authenticated
  USING (true);

-- Qualquer autenticado pode SUGERIR uma palavra (gravada já validada pela API).
DROP POLICY IF EXISTS "letreco_words: autenticados sugerem" ON public.letreco_suggested_words;
CREATE POLICY "letreco_words: autenticados sugerem"
  ON public.letreco_suggested_words FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = added_by);

-- ══════════════════════════════════════════════════════════════
-- PRONTO! As palavras aprovadas são carregadas no boot do Letreco
-- e mescladas ao dicionário de validação (isValidWord).
-- ══════════════════════════════════════════════════════════════
