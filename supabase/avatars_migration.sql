-- ══════════════════════════════════════════════════════════════
-- AVATARS STORAGE BUCKET
-- Execute no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════

-- Criar bucket para avatares
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer autenticado pode fazer upload do próprio avatar
CREATE POLICY "Usuários fazem upload do próprio avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Qualquer autenticado pode atualizar seu próprio avatar
CREATE POLICY "Usuários atualizam próprio avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Qualquer pessoa pode ver avatares (bucket é público)
CREATE POLICY "Avatares são públicos para leitura"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
