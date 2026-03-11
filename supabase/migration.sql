-- ══════════════════════════════════════════════════════════════
-- TAVERNA DOS AMIGOS — Supabase Database Setup
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════

-- ─── 1. Profiles table ─────────────────────────────────────
-- Armazena dados do usuário sincronizados do auth

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ─── 2. Dice Rolls table ───────────────────────────────────
-- Armazena cada rolagem de dado com referência ao jogador

CREATE TABLE IF NOT EXISTS public.dice_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dice_type TEXT NOT NULL CHECK (dice_type IN ('d4','d6','d8','d10','d12','d20','d100')),
  result INTEGER NOT NULL CHECK (result >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_dice_rolls_created ON public.dice_rolls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dice_rolls_user ON public.dice_rolls(user_id);

-- ─── 3. Row Level Security (RLS) ───────────────────────────
-- Garante que apenas usuários autenticados acessam os dados

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dice_rolls ENABLE ROW LEVEL SECURITY;

-- Profiles: qualquer usuário autenticado pode VER todos os profiles
CREATE POLICY "Profiles: autenticados podem ver todos"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Profiles: usuário pode inserir apenas seu próprio profile
CREATE POLICY "Profiles: usuário insere próprio"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Profiles: usuário pode atualizar apenas seu próprio profile
CREATE POLICY "Profiles: usuário atualiza próprio"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Dice Rolls: qualquer usuário autenticado pode VER todas as rolagens
CREATE POLICY "Dice Rolls: autenticados podem ver todos"
  ON public.dice_rolls FOR SELECT
  TO authenticated
  USING (true);

-- Dice Rolls: usuário autenticado pode inserir suas próprias rolagens
CREATE POLICY "Dice Rolls: usuário insere próprio"
  ON public.dice_rolls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── 4. Realtime ────────────────────────────────────────────
-- Habilita realtime para a tabela de rolagens

ALTER PUBLICATION supabase_realtime ADD TABLE public.dice_rolls;

-- ─── 5. Auto-update timestamp ───────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 6. Auto-create profile on signup ───────────────────────
-- Quando um novo usuário se registra, cria o profile automaticamente

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- PRONTO! O auth usa email/senha nativo do Supabase.
-- Nenhum provider externo precisa ser configurado.
--
-- DICA: No Supabase Dashboard > Authentication > Settings,
-- você pode desativar "Confirm email" para facilitar testes,
-- ou deixar ativo para exigir confirmação por email.
-- ══════════════════════════════════════════════════════════════
