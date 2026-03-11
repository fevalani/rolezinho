-- ══════════════════════════════════════════════════════════════
-- BATCH ID — Agrupar rolagens multi-dados
-- Execute no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.dice_rolls
  ADD COLUMN IF NOT EXISTS batch_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_dice_rolls_batch ON public.dice_rolls(batch_id)
  WHERE batch_id IS NOT NULL;