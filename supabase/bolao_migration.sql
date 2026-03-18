-- ═══════════════════════════════════════════════════════════════
-- Bolão Feature Migration
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Campeonatos (referência, populados via API) ──────────────────
CREATE TABLE IF NOT EXISTS public.bolao_championships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE, -- 'BSA', 'WC'
  name       TEXT        NOT NULL,
  season     TEXT        NOT NULL,
  emblem_url TEXT,
  fd_id      INTEGER,   -- football-data.org competition ID
  status     TEXT        NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Partidas (cache da API, atualizadas com resultados) ──────────
CREATE TABLE IF NOT EXISTS public.bolao_matches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID        NOT NULL REFERENCES public.bolao_championships(id) ON DELETE CASCADE,
  fd_match_id     INTEGER     NOT NULL UNIQUE,
  home_team       TEXT        NOT NULL,
  home_crest      TEXT,
  away_team       TEXT        NOT NULL,
  away_crest      TEXT,
  round_label     TEXT        NOT NULL, -- "Rodada 1", "Quartas de Final"
  round_number    INTEGER,
  stage           TEXT        NOT NULL DEFAULT 'REGULAR_SEASON',
  utc_date        TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'TIMED',
  score_home      INTEGER,
  score_away      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bolao_matches_championship ON public.bolao_matches(championship_id);
CREATE INDEX IF NOT EXISTS idx_bolao_matches_date         ON public.bolao_matches(utc_date);
CREATE INDEX IF NOT EXISTS idx_bolao_matches_status       ON public.bolao_matches(status);

-- ── Bolões (criados pelos usuários) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.bolao_pools (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  championship_id UUID        NOT NULL REFERENCES public.bolao_championships(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bolao_pools_created_by     ON public.bolao_pools(created_by);
CREATE INDEX IF NOT EXISTS idx_bolao_pools_championship   ON public.bolao_pools(championship_id);

-- ── Membros dos bolões ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bolao_pool_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id   UUID        NOT NULL REFERENCES public.bolao_pools(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_bolao_pool_member UNIQUE (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bolao_pool_members_pool ON public.bolao_pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_bolao_pool_members_user ON public.bolao_pool_members(user_id);

-- ── Palpites ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bolao_predictions (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id       UUID    NOT NULL REFERENCES public.bolao_pools(id) ON DELETE CASCADE,
  match_id      UUID    NOT NULL REFERENCES public.bolao_matches(id) ON DELETE CASCADE,
  user_id       UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  home_goals    INTEGER NOT NULL CHECK (home_goals >= 0),
  away_goals    INTEGER NOT NULL CHECK (away_goals >= 0),
  points_earned INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_bolao_prediction UNIQUE (pool_id, match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bolao_predictions_pool      ON public.bolao_predictions(pool_id);
CREATE INDEX IF NOT EXISTS idx_bolao_predictions_match     ON public.bolao_predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_bolao_predictions_pool_user ON public.bolao_predictions(pool_id, user_id);

-- ═══════════════════════════════════════════════════════════════
-- Funções auxiliares
-- ═══════════════════════════════════════════════════════════════

-- Verifica se o usuário atual é membro de um bolão
CREATE OR REPLACE FUNCTION public.is_bolao_pool_member(p_pool_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bolao_pool_members
    WHERE pool_id = p_pool_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Cria bolão e adiciona criador como membro atomicamente
CREATE OR REPLACE FUNCTION public.create_bolao_pool(
  p_name            TEXT,
  p_championship_id UUID,
  p_user_id         UUID
)
RETURNS UUID AS $$
DECLARE
  v_pool_id UUID;
BEGIN
  INSERT INTO public.bolao_pools (name, championship_id, created_by)
  VALUES (p_name, p_championship_id, p_user_id)
  RETURNING id INTO v_pool_id;

  INSERT INTO public.bolao_pool_members (pool_id, user_id)
  VALUES (v_pool_id, p_user_id);

  RETURN v_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.bolao_championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_pools          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_pool_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_predictions    ENABLE ROW LEVEL SECURITY;

-- Championships: leitura livre, escrita por qualquer auth (sync da API)
CREATE POLICY "bolao_championships_read"   ON public.bolao_championships FOR SELECT TO authenticated USING (true);
CREATE POLICY "bolao_championships_write"  ON public.bolao_championships FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Matches: leitura livre, escrita por qualquer auth (sync da API)
CREATE POLICY "bolao_matches_read"  ON public.bolao_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "bolao_matches_write" ON public.bolao_matches FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Pools: leitura livre, criação/exclusão pelo criador
CREATE POLICY "bolao_pools_read"   ON public.bolao_pools FOR SELECT TO authenticated USING (true);
CREATE POLICY "bolao_pools_insert" ON public.bolao_pools FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "bolao_pools_delete" ON public.bolao_pools FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Members: leitura livre, inserção própria, remoção própria
CREATE POLICY "bolao_members_read"   ON public.bolao_pool_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "bolao_members_insert" ON public.bolao_pool_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bolao_members_delete" ON public.bolao_pool_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Predictions: leitura por membros, escrita pelo próprio usuário
CREATE POLICY "bolao_predictions_read"   ON public.bolao_predictions FOR SELECT TO authenticated USING (is_bolao_pool_member(pool_id));
CREATE POLICY "bolao_predictions_write"  ON public.bolao_predictions FOR ALL    TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
