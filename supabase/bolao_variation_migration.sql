-- ═══════════════════════════════════════════════════════════════
-- Bolão – Variação de posição na classificação
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona coluna variation_mode na tabela bolao_pools
--    'off'   = desativado (sem setas)
--    'round' = compara com a classificação antes da última rodada
--    'match' = compara com a classificação antes da última partida
ALTER TABLE public.bolao_pools
ADD COLUMN IF NOT EXISTS variation_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (variation_mode IN ('off', 'round', 'match'));

-- 2. Função para atualizar variation_mode
--    (bypassa RLS – não há UPDATE policy em bolao_pools)
CREATE OR REPLACE FUNCTION public.update_pool_variation_mode(
  p_pool_id        UUID,
  p_variation_mode TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE public.bolao_pools
  SET variation_mode = p_variation_mode,
      updated_at     = now()
  WHERE id = p_pool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
