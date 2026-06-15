-- ═══════════════════════════════════════════════════════════════
-- Copa do Mundo 2026 — Correção de horários (jun/2026)
-- Fonte: ESPN scoreboard API (UTC autoritativo)
--
-- 6 partidas foram remarcadas pela FIFA desde a importação inicial
-- (wc2026_fixture.sql, 06/jun). Nenhuma está FINISHED, então o
-- update não afeta pontuação — apenas corrige horário e lock do palpite.
-- Execute no Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

UPDATE public.bolao_matches SET utc_date = '2026-06-15T16:00:00Z', updated_at = now() WHERE fd_match_id = 9900013; -- Spain x Cape Verde (era 17:00Z)
UPDATE public.bolao_matches SET utc_date = '2026-06-15T19:00:00Z', updated_at = now() WHERE fd_match_id = 9900014; -- Belgium x Egypt (era 22:00Z)
UPDATE public.bolao_matches SET utc_date = '2026-06-16T01:00:00Z', updated_at = now() WHERE fd_match_id = 9900016; -- Iran x New Zealand (era 04:00Z)
UPDATE public.bolao_matches SET utc_date = '2026-06-19T01:00:00Z', updated_at = now() WHERE fd_match_id = 9900028; -- Mexico x South Korea (era 03:00Z)
UPDATE public.bolao_matches SET utc_date = '2026-06-20T00:30:00Z', updated_at = now() WHERE fd_match_id = 9900031; -- Brazil x Haiti (era 01:00Z)
UPDATE public.bolao_matches SET utc_date = '2026-06-20T03:00:00Z', updated_at = now() WHERE fd_match_id = 9900032; -- Türkiye x Paraguay (era 04:00Z)

-- Verificação: deve retornar as 6 linhas com os novos horários
-- SELECT fd_match_id, home_team, away_team, utc_date FROM public.bolao_matches
-- WHERE fd_match_id IN (9900013,9900014,9900016,9900028,9900031,9900032)
-- ORDER BY fd_match_id;
