-- ══════════════════════════════════════════════════════════════
-- RACHA CONTA — Migration 002
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════

-- ─── 1. split_groups ────────────────────────────────────────
-- Cada "espaço" de divisão de contas

CREATE TABLE IF NOT EXISTS public.split_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  emoji       TEXT        NOT NULL DEFAULT '🎉',
  created_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_groups_created_by
  ON public.split_groups(created_by);

-- ─── 2. split_group_members ─────────────────────────────────
-- Membros de cada grupo (usuários do app OU externos)
--
-- Para usuários do app:  profile_id IS NOT NULL, external_name IS NULL
-- Para externos:         profile_id IS NULL,     external_name IS NOT NULL

CREATE TABLE IF NOT EXISTS public.split_group_members (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID        NOT NULL REFERENCES public.split_groups(id) ON DELETE CASCADE,
  -- Usuário do app (opcional — NULL para externos)
  profile_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Pessoa externa (opcional — NULL para usuários do app)
  external_name  TEXT,
  avatar_letter  TEXT        NOT NULL DEFAULT '?',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cada profile pode aparecer no máximo uma vez por grupo
  CONSTRAINT uq_group_member_profile
    UNIQUE (group_id, profile_id),

  -- Pelo menos um dos dois deve ser preenchido
  CONSTRAINT chk_member_identity
    CHECK (
      (profile_id IS NOT NULL AND external_name IS NULL)
      OR
      (profile_id IS NULL AND external_name IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_split_group_members_group
  ON public.split_group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_split_group_members_profile
  ON public.split_group_members(profile_id)
  WHERE profile_id IS NOT NULL;

-- ─── 3. split_expenses ──────────────────────────────────────
-- Cada gasto adicionado a um grupo

CREATE TABLE IF NOT EXISTS public.split_expenses (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID           NOT NULL REFERENCES public.split_groups(id) ON DELETE CASCADE,
  name            TEXT           NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  -- split_group_members.id de quem pagou
  paid_by_member  UUID           NOT NULL REFERENCES public.split_group_members(id) ON DELETE CASCADE,
  split_type      TEXT           NOT NULL CHECK (split_type IN ('equal', 'custom', 'percent')),
  -- JSONB: { "<member_id>": <value> }
  -- equal   → {}
  -- custom  → valores em reais que somam amount
  -- percent → porcentagens que somam 100
  splits          JSONB          NOT NULL DEFAULT '{}',
  category        TEXT           NOT NULL DEFAULT 'outros'
                  CHECK (category IN ('alimentação','bebidas','hospedagem','transporte','lazer','moradia','compras','outros')),
  date            DATE           NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_expenses_group
  ON public.split_expenses(group_id);

CREATE INDEX IF NOT EXISTS idx_split_expenses_date
  ON public.split_expenses(group_id, date DESC);

-- ─── 4. split_expense_participants ──────────────────────────
-- Membros que participam de cada gasto (N:N)

CREATE TABLE IF NOT EXISTS public.split_expense_participants (
  expense_id  UUID NOT NULL REFERENCES public.split_expenses(id)       ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.split_group_members(id)  ON DELETE CASCADE,
  PRIMARY KEY (expense_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_split_participants_expense
  ON public.split_expense_participants(expense_id);

CREATE INDEX IF NOT EXISTS idx_split_participants_member
  ON public.split_expense_participants(member_id);

-- ─── 5. split_payments ──────────────────────────────────────
-- Pagamentos registrados entre membros ("marcar como pago")

CREATE TABLE IF NOT EXISTS public.split_payments (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID           NOT NULL REFERENCES public.split_groups(id) ON DELETE CASCADE,
  from_member_id  UUID           NOT NULL REFERENCES public.split_group_members(id) ON DELETE CASCADE,
  to_member_id    UUID           NOT NULL REFERENCES public.split_group_members(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date            DATE           NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT chk_payment_different_members
    CHECK (from_member_id <> to_member_id)
);

CREATE INDEX IF NOT EXISTS idx_split_payments_group
  ON public.split_payments(group_id);

CREATE INDEX IF NOT EXISTS idx_split_payments_from
  ON public.split_payments(from_member_id);

CREATE INDEX IF NOT EXISTS idx_split_payments_to
  ON public.split_payments(to_member_id);

-- ─── 6. Auto-update timestamps ──────────────────────────────
-- Reutiliza a função handle_updated_at() já criada na migration 001

CREATE TRIGGER on_split_groups_updated
  BEFORE UPDATE ON public.split_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_split_expenses_updated
  BEFORE UPDATE ON public.split_expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 7. Row Level Security (RLS) ────────────────────────────

ALTER TABLE public.split_groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_payments            ENABLE ROW LEVEL SECURITY;

-- Helper: retorna TRUE se o usuário autenticado é membro do grupo
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.split_group_members
    WHERE group_id = p_group_id
      AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── split_groups ──
-- Qualquer membro pode ler o grupo
CREATE POLICY "split_groups: membros lêem"
  ON public.split_groups FOR SELECT
  TO authenticated
  USING (public.is_group_member(id));

-- Qualquer autenticado pode criar um grupo
CREATE POLICY "split_groups: autenticados criam"
  ON public.split_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Apenas o criador pode editar ou excluir
CREATE POLICY "split_groups: criador edita"
  ON public.split_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "split_groups: criador exclui"
  ON public.split_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ── split_group_members ──
CREATE POLICY "split_group_members: membros lêem"
  ON public.split_group_members FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "split_group_members: membros inserem"
  ON public.split_group_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id) OR
    -- permite o criador inserir o próprio registro antes de ser membro
    EXISTS (SELECT 1 FROM public.split_groups WHERE id = group_id AND created_by = auth.uid())
  );

CREATE POLICY "split_group_members: membros excluem"
  ON public.split_group_members FOR DELETE
  TO authenticated
  USING (public.is_group_member(group_id));

-- ── split_expenses ──
CREATE POLICY "split_expenses: membros lêem"
  ON public.split_expenses FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "split_expenses: membros criam"
  ON public.split_expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id) AND auth.uid() = created_by);

CREATE POLICY "split_expenses: criador edita"
  ON public.split_expenses FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "split_expenses: criador exclui"
  ON public.split_expenses FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ── split_expense_participants ──
CREATE POLICY "split_expense_participants: membros lêem"
  ON public.split_expense_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.split_expenses e
      WHERE e.id = expense_id AND public.is_group_member(e.group_id)
    )
  );

CREATE POLICY "split_expense_participants: membros inserem"
  ON public.split_expense_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.split_expenses e
      WHERE e.id = expense_id AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "split_expense_participants: criador exclui"
  ON public.split_expense_participants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.split_expenses e
      WHERE e.id = expense_id AND e.created_by = auth.uid()
    )
  );

-- ── split_payments ──
CREATE POLICY "split_payments: membros lêem"
  ON public.split_payments FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

-- Qualquer membro pode registrar pagamento (requisito: "qualquer pessoa pode marcar")
CREATE POLICY "split_payments: membros criam"
  ON public.split_payments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id) AND auth.uid() = created_by);

CREATE POLICY "split_payments: criador exclui"
  ON public.split_payments FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ══════════════════════════════════════════════════════════════
-- PRONTO! Tabelas do Racha Conta criadas com RLS configurado.
-- Próximo passo: registrar a rota /racha-conta no App.tsx.
-- ══════════════════════════════════════════════════════════════