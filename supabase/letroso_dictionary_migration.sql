-- letroso_dictionary: validação server-side de palpites
CREATE TABLE IF NOT EXISTS letroso_dictionary (
  word TEXT PRIMARY KEY
);

ALTER TABLE letroso_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "letroso_dictionary_public_read"
  ON letroso_dictionary FOR SELECT
  USING (true);

-- RPC chamada pelo cliente para validar cada palpite
CREATE OR REPLACE FUNCTION validate_letroso_word(p_word TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM letroso_dictionary WHERE word = p_word);
$$;

-- RPC de seed (usar apenas uma vez, depois rodar: DROP FUNCTION seed_letroso_dictionary(text[]))
CREATE OR REPLACE FUNCTION seed_letroso_dictionary(p_words TEXT[])
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO letroso_dictionary (word)
  SELECT unnest(p_words)
  ON CONFLICT DO NOTHING;
$$;
