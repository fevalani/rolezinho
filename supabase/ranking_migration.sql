-- ══════════════════════════════════════════════════════════════
-- RANKING DE CAMPEÕES — Tabelas de classificação genéricas
-- Execute este SQL no Supabase SQL Editor (instalação limpa).
-- Se você já rodou uma versão anterior (ranking_entries só com "name"),
-- rode em vez disso supabase/ranking_profile_link_migration.sql.
-- Se você já rodou qualquer versão anterior (ranking_tables sem "icon"),
-- rode também supabase/ranking_icon_migration.sql.
-- ══════════════════════════════════════════════════════════════

-- Tabelas de classificação (ex.: "Tênis", "Truco da sexta")
CREATE TABLE IF NOT EXISTS public.ranking_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias de pontuação, nome e peso livres (ex.: Vitória=3, Empate=1, Acertos=1)
CREATE TABLE IF NOT EXISTS public.ranking_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.ranking_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points_per_unit NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pessoas da tabela — pode ser um usuário do app (profile_id) ou alguém de
-- fora (external_name), mesmo padrão de split_group_members do Racha Conta.
CREATE TABLE IF NOT EXISTS public.ranking_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.ranking_tables(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (profile_id IS NOT NULL OR external_name IS NOT NULL)
);

-- Evita adicionar o mesmo usuário do app duas vezes na mesma tabela
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ranking_entry_table_profile
  ON public.ranking_entries(table_id, profile_id)
  WHERE profile_id IS NOT NULL;

-- Valor de cada categoria por pessoa
CREATE TABLE IF NOT EXISTS public.ranking_entry_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.ranking_entries(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.ranking_categories(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, category_id)
);

-- Propostas de edição de quem não é admin da tabela — precisam de aprovação de outro usuário
CREATE TABLE IF NOT EXISTS public.ranking_pending_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.ranking_entries(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.ranking_categories(id) ON DELETE CASCADE,
  previous_value NUMERIC NOT NULL,
  new_value NUMERIC NOT NULL,
  proposed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Só uma proposta pendente por célula (entry + categoria) por vez
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ranking_pending_per_cell
  ON public.ranking_pending_edits(entry_id, category_id)
  WHERE status = 'pending';

-- Índices
CREATE INDEX IF NOT EXISTS idx_ranking_categories_table   ON public.ranking_categories(table_id);
CREATE INDEX IF NOT EXISTS idx_ranking_entries_table      ON public.ranking_entries(table_id);
CREATE INDEX IF NOT EXISTS idx_ranking_entry_values_entry ON public.ranking_entry_values(entry_id);
CREATE INDEX IF NOT EXISTS idx_ranking_pending_entry      ON public.ranking_pending_edits(entry_id);
CREATE INDEX IF NOT EXISTS idx_ranking_pending_status     ON public.ranking_pending_edits(status);

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE public.ranking_tables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_entry_values  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_pending_edits ENABLE ROW LEVEL SECURITY;

-- Tables: todos veem; só o criador cria/edita/apaga
CREATE POLICY "Ranking Tables: autenticados veem"
  ON public.ranking_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ranking Tables: autenticados criam"
  ON public.ranking_tables FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Ranking Tables: criador atualiza"
  ON public.ranking_tables FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Ranking Tables: criador apaga"
  ON public.ranking_tables FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Categories: todos veem; só o admin da tabela mexe
CREATE POLICY "Ranking Categories: autenticados veem"
  ON public.ranking_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ranking Categories: admin gerencia"
  ON public.ranking_categories FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ranking_tables
    WHERE id = ranking_categories.table_id AND created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ranking_tables
    WHERE id = ranking_categories.table_id AND created_by = auth.uid()
  ));

-- Entries: todos veem; só o admin da tabela adiciona/remove/renomeia pessoas
CREATE POLICY "Ranking Entries: autenticados veem"
  ON public.ranking_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ranking Entries: admin gerencia"
  ON public.ranking_entries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ranking_tables
    WHERE id = ranking_entries.table_id AND created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ranking_tables
    WHERE id = ranking_entries.table_id AND created_by = auth.uid()
  ));

-- Entry values: leitura livre; só o admin insere/apaga direto (inicialização de
-- linhas ao criar pessoa/categoria). A ATUALIZAÇÃO de valor (edição de placar)
-- NÃO tem policy direta — só acontece via a função submit_ranking_value()
-- abaixo, que decide se aplica na hora (admin) ou vira proposta pendente.
CREATE POLICY "Ranking Values: autenticados veem"
  ON public.ranking_entry_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ranking Values: admin insere"
  ON public.ranking_entry_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ranking_entries e
    JOIN public.ranking_tables t ON t.id = e.table_id
    WHERE e.id = ranking_entry_values.entry_id AND t.created_by = auth.uid()
  ));
CREATE POLICY "Ranking Values: admin apaga"
  ON public.ranking_entry_values FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ranking_entries e
    JOIN public.ranking_tables t ON t.id = e.table_id
    WHERE e.id = ranking_entry_values.entry_id AND t.created_by = auth.uid()
  ));

-- Pending edits: leitura livre (pra mostrar o badge de pendência pra todo
-- mundo). Toda escrita (propor/aprovar/rejeitar) passa pelas funções abaixo.
CREATE POLICY "Ranking Pending: autenticados veem"
  ON public.ranking_pending_edits FOR SELECT TO authenticated USING (true);

-- ─── Funções (SECURITY DEFINER — centralizam a regra de aprovação) ──────

-- Envia um novo valor para entry+categoria. Se quem chama é o admin da
-- tabela, aplica na hora. Senão, cria uma proposta pendente que precisa
-- ser aprovada por outro usuário (ver approve_ranking_edit).
CREATE OR REPLACE FUNCTION public.submit_ranking_value(
  p_entry_id UUID,
  p_category_id UUID,
  p_new_value NUMERIC
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
  v_prev NUMERIC;
BEGIN
  SELECT t.created_by INTO v_created_by
  FROM public.ranking_entries e
  JOIN public.ranking_tables t ON t.id = e.table_id
  WHERE e.id = p_entry_id;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Pessoa não encontrada';
  END IF;

  SELECT value INTO v_prev
  FROM public.ranking_entry_values
  WHERE entry_id = p_entry_id AND category_id = p_category_id;

  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'Categoria não encontrada para essa pessoa';
  END IF;

  IF auth.uid() = v_created_by THEN
    UPDATE public.ranking_entry_values
    SET value = p_new_value, updated_at = now()
    WHERE entry_id = p_entry_id AND category_id = p_category_id;
    RETURN 'applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ranking_pending_edits
    WHERE entry_id = p_entry_id AND category_id = p_category_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Já existe uma proposta pendente para este valor';
  END IF;

  INSERT INTO public.ranking_pending_edits
    (entry_id, category_id, previous_value, new_value, proposed_by)
  VALUES (p_entry_id, p_category_id, v_prev, p_new_value, auth.uid());

  RETURN 'pending';
END;
$$;

-- Aprova uma proposta pendente: aplica o valor e fecha a proposta.
-- Quem propôs não pode aprovar a própria proposta, a não ser que seja
-- o admin da tabela (que sempre pode destravar).
CREATE OR REPLACE FUNCTION public.approve_ranking_edit(p_pending_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending RECORD;
  v_is_admin BOOLEAN;
BEGIN
  SELECT * INTO v_pending
  FROM public.ranking_pending_edits
  WHERE id = p_pending_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada ou já resolvida';
  END IF;

  SELECT (t.created_by = auth.uid()) INTO v_is_admin
  FROM public.ranking_entries e
  JOIN public.ranking_tables t ON t.id = e.table_id
  WHERE e.id = v_pending.entry_id;

  IF auth.uid() = v_pending.proposed_by AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Você não pode aprovar a própria proposta';
  END IF;

  UPDATE public.ranking_entry_values
  SET value = v_pending.new_value, updated_at = now()
  WHERE entry_id = v_pending.entry_id AND category_id = v_pending.category_id;

  UPDATE public.ranking_pending_edits
  SET status = 'approved', approved_by = auth.uid(), resolved_at = now()
  WHERE id = p_pending_id;
END;
$$;

-- Rejeita/cancela uma proposta pendente (o próprio proponente, outro
-- usuário ou o admin da tabela podem fazer isso).
CREATE OR REPLACE FUNCTION public.reject_ranking_edit(p_pending_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ranking_pending_edits
  SET status = 'rejected', approved_by = auth.uid(), resolved_at = now()
  WHERE id = p_pending_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada ou já resolvida';
  END IF;
END;
$$;

-- ─── Realtime ────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.ranking_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ranking_entry_values;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ranking_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ranking_pending_edits;

-- ─── Auto-timestamp ──────────────────────────────────────────

CREATE TRIGGER ranking_tables_updated_at
  BEFORE UPDATE ON public.ranking_tables
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER ranking_entries_updated_at
  BEFORE UPDATE ON public.ranking_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
