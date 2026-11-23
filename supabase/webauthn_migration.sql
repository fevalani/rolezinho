-- Passkey credentials + Supabase Auth users
CREATE TABLE IF NOT EXISTS public.user_passkeys (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT[] DEFAULT '{}',
    device_type TEXT,
    backed_up BOOLEAN DEFAULT false,
    friendly_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
    ON public.user_passkeys(user_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own passkeys" ON public.user_passkeys;
CREATE POLICY "User can view own passkeys"
    ON public.user_passkeys FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own passkeys" ON public.user_passkeys;
CREATE POLICY "Users can delete own passkeys"
    ON public.user_passkeys FOR DELETE
    USING (auth.uid() = user_id);

-- Webauthn Challenges (lado-servidor)
    CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge TEXT NOT NULL,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
    );

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Email -> user_id (lado-servidor)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;