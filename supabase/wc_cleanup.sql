-- ═══════════════════════════════════════════════════════════════
-- Limpeza de dados da Copa do Mundo
-- Execute no Supabase SQL Editor (não afeta o Brasileirão / BSA)
--
-- O DELETE na tabela bolao_championships dispara cascatas automáticas:
--   → bolao_matches (championship_id FK CASCADE)
--   → bolao_pools   (championship_id FK CASCADE)
--     → bolao_pool_members (pool_id FK CASCADE)
--     → bolao_predictions  (pool_id FK CASCADE)
-- ═══════════════════════════════════════════════════════════════

DELETE FROM public.bolao_championships
WHERE code = 'WC';
