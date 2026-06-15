-- ═══════════════════════════════════════════════════════════════
-- Copa do Mundo 2026 — Fase de Grupos (72 partidas)
-- Fonte: ESPN schedule (ET → UTC)
-- Execute no Supabase SQL Editor APÓS wc_cleanup.sql
--
-- fd_match_id 9900001–9900072: IDs artificiais, não conflitam
-- com football-data.org. Sync de resultados usa SofaScore por
-- nome do time + data (fetchMatchResultSofa).
-- ═══════════════════════════════════════════════════════════════

-- 1. Cria/atualiza campeonato
INSERT INTO public.bolao_championships (code, name, season, fd_id, status)
VALUES ('WC', 'Copa do Mundo 2026', '2026', 2000, 'SCHEDULED')
ON CONFLICT (code) DO UPDATE SET
  name       = EXCLUDED.name,
  season     = EXCLUDED.season,
  fd_id      = EXCLUDED.fd_id,
  status     = EXCLUDED.status,
  updated_at = now();

-- 2. Insere as 72 partidas da fase de grupos
INSERT INTO public.bolao_matches
  (championship_id, fd_match_id, home_team, away_team, round_label, round_number, stage, utc_date, status)
VALUES

-- ────────────────────────────────────────────────────────────────
-- RODADA 1
-- ────────────────────────────────────────────────────────────────
-- Jun 11
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900001, 'Mexico',                 'South Africa',            'Rodada 1', 1, 'GROUP_STAGE', '2026-06-11T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900002, 'South Korea',            'Czechia',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-12T02:00:00Z', 'TIMED'),
-- Jun 12
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900003, 'Canada',                 'Bosnia and Herzegovina',  'Rodada 1', 1, 'GROUP_STAGE', '2026-06-12T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900004, 'United States',          'Paraguay',                'Rodada 1', 1, 'GROUP_STAGE', '2026-06-13T01:00:00Z', 'TIMED'),
-- Jun 13
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900005, 'Qatar',                  'Switzerland',             'Rodada 1', 1, 'GROUP_STAGE', '2026-06-13T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900006, 'Brazil',                 'Morocco',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-13T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900007, 'Haiti',                  'Scotland',                'Rodada 1', 1, 'GROUP_STAGE', '2026-06-14T01:00:00Z', 'TIMED'),
-- Jun 14
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900008, 'Australia',              'Türkiye',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-14T04:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900009, 'Germany',                'Curaçao',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-14T17:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900010, 'Netherlands',            'Japan',                   'Rodada 1', 1, 'GROUP_STAGE', '2026-06-14T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900011, 'Ivory Coast',            'Ecuador',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-14T23:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900012, 'Sweden',                 'Tunisia',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-15T02:00:00Z', 'TIMED'),
-- Jun 15
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900013, 'Spain',                  'Cape Verde',              'Rodada 1', 1, 'GROUP_STAGE', '2026-06-15T16:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900014, 'Belgium',                'Egypt',                   'Rodada 1', 1, 'GROUP_STAGE', '2026-06-15T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900015, 'Saudi Arabia',           'Uruguay',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-15T22:00:00Z', 'TIMED'),
-- Jun 16
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900016, 'Iran',                   'New Zealand',             'Rodada 1', 1, 'GROUP_STAGE', '2026-06-16T01:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900017, 'France',                 'Senegal',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-16T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900018, 'Iraq',                   'Norway',                  'Rodada 1', 1, 'GROUP_STAGE', '2026-06-16T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900019, 'Argentina',              'Algeria',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-17T01:00:00Z', 'TIMED'),
-- Jun 17
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900020, 'Austria',                'Jordan',                  'Rodada 1', 1, 'GROUP_STAGE', '2026-06-17T04:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900021, 'Portugal',               'DR Congo',                'Rodada 1', 1, 'GROUP_STAGE', '2026-06-17T17:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900022, 'England',                'Croatia',                 'Rodada 1', 1, 'GROUP_STAGE', '2026-06-17T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900023, 'Ghana',                  'Panama',                  'Rodada 1', 1, 'GROUP_STAGE', '2026-06-17T23:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900024, 'Uzbekistan',             'Colombia',                'Rodada 1', 1, 'GROUP_STAGE', '2026-06-18T02:00:00Z', 'TIMED'),

-- ────────────────────────────────────────────────────────────────
-- RODADA 2
-- ────────────────────────────────────────────────────────────────
-- Jun 18
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900025, 'Czechia',                'South Africa',            'Rodada 2', 2, 'GROUP_STAGE', '2026-06-18T16:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900026, 'Switzerland',            'Bosnia and Herzegovina',  'Rodada 2', 2, 'GROUP_STAGE', '2026-06-18T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900027, 'Canada',                 'Qatar',                   'Rodada 2', 2, 'GROUP_STAGE', '2026-06-18T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900028, 'Mexico',                 'South Korea',             'Rodada 2', 2, 'GROUP_STAGE', '2026-06-19T01:00:00Z', 'TIMED'),
-- Jun 19
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900029, 'United States',          'Australia',               'Rodada 2', 2, 'GROUP_STAGE', '2026-06-19T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900030, 'Scotland',               'Morocco',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-19T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900031, 'Brazil',                 'Haiti',                   'Rodada 2', 2, 'GROUP_STAGE', '2026-06-20T00:30:00Z', 'TIMED'),
-- Jun 20
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900032, 'Türkiye',                'Paraguay',                'Rodada 2', 2, 'GROUP_STAGE', '2026-06-20T03:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900033, 'Netherlands',            'Sweden',                  'Rodada 2', 2, 'GROUP_STAGE', '2026-06-20T17:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900034, 'Germany',                'Ivory Coast',             'Rodada 2', 2, 'GROUP_STAGE', '2026-06-20T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900035, 'Ecuador',                'Curaçao',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-21T00:00:00Z', 'TIMED'),
-- Jun 21
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900036, 'Tunisia',                'Japan',                   'Rodada 2', 2, 'GROUP_STAGE', '2026-06-21T04:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900037, 'Spain',                  'Saudi Arabia',            'Rodada 2', 2, 'GROUP_STAGE', '2026-06-21T16:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900038, 'Belgium',                'Iran',                    'Rodada 2', 2, 'GROUP_STAGE', '2026-06-21T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900039, 'Uruguay',                'Cape Verde',              'Rodada 2', 2, 'GROUP_STAGE', '2026-06-21T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900040, 'New Zealand',            'Egypt',                   'Rodada 2', 2, 'GROUP_STAGE', '2026-06-22T01:00:00Z', 'TIMED'),
-- Jun 22
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900041, 'Argentina',              'Austria',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-22T17:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900042, 'France',                 'Iraq',                    'Rodada 2', 2, 'GROUP_STAGE', '2026-06-22T21:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900043, 'Norway',                 'Senegal',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-23T00:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900044, 'Jordan',                 'Algeria',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-23T03:00:00Z', 'TIMED'),
-- Jun 23
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900045, 'Portugal',               'Uzbekistan',              'Rodada 2', 2, 'GROUP_STAGE', '2026-06-23T17:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900046, 'England',                'Ghana',                   'Rodada 2', 2, 'GROUP_STAGE', '2026-06-23T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900047, 'Panama',                 'Croatia',                 'Rodada 2', 2, 'GROUP_STAGE', '2026-06-23T23:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900048, 'Colombia',               'DR Congo',                'Rodada 2', 2, 'GROUP_STAGE', '2026-06-24T02:00:00Z', 'TIMED'),

-- ────────────────────────────────────────────────────────────────
-- RODADA 3 (jogos simultâneos por grupo)
-- ────────────────────────────────────────────────────────────────
-- Jun 24 — Grupos B e C
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900049, 'Switzerland',            'Canada',                  'Rodada 3', 3, 'GROUP_STAGE', '2026-06-24T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900050, 'Bosnia and Herzegovina', 'Qatar',                   'Rodada 3', 3, 'GROUP_STAGE', '2026-06-24T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900051, 'Scotland',               'Brazil',                  'Rodada 3', 3, 'GROUP_STAGE', '2026-06-24T22:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900052, 'Morocco',                'Haiti',                   'Rodada 3', 3, 'GROUP_STAGE', '2026-06-24T22:00:00Z', 'TIMED'),
-- Jun 24/25 — Grupo A
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900053, 'Czechia',                'Mexico',                  'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T01:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900054, 'South Africa',           'South Korea',             'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T01:00:00Z', 'TIMED'),
-- Jun 25 — Grupos E e F
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900055, 'Ecuador',                'Germany',                 'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900056, 'Curaçao',                'Ivory Coast',             'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T20:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900057, 'Japan',                  'Sweden',                  'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T23:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900058, 'Tunisia',                'Netherlands',             'Rodada 3', 3, 'GROUP_STAGE', '2026-06-25T23:00:00Z', 'TIMED'),
-- Jun 25/26 — Grupo D
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900059, 'Türkiye',                'United States',           'Rodada 3', 3, 'GROUP_STAGE', '2026-06-26T02:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900060, 'Paraguay',               'Australia',               'Rodada 3', 3, 'GROUP_STAGE', '2026-06-26T02:00:00Z', 'TIMED'),
-- Jun 26 — Grupo I
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900061, 'Norway',                 'France',                  'Rodada 3', 3, 'GROUP_STAGE', '2026-06-26T19:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900062, 'Senegal',                'Iraq',                    'Rodada 3', 3, 'GROUP_STAGE', '2026-06-26T19:00:00Z', 'TIMED'),
-- Jun 26/27 — Grupos H e G
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900063, 'Cape Verde',             'Saudi Arabia',            'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T00:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900064, 'Uruguay',                'Spain',                   'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T00:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900065, 'Egypt',                  'Iran',                    'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T03:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900066, 'New Zealand',            'Belgium',                 'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T03:00:00Z', 'TIMED'),
-- Jun 27 — Grupos L, K e J
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900067, 'Panama',                 'England',                 'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T21:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900068, 'Croatia',                'Ghana',                   'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T21:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900069, 'Colombia',               'Portugal',                'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T23:30:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900070, 'DR Congo',               'Uzbekistan',              'Rodada 3', 3, 'GROUP_STAGE', '2026-06-27T23:30:00Z', 'TIMED'),
-- Jun 27/28 — Grupo J
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900071, 'Algeria',                'Austria',                 'Rodada 3', 3, 'GROUP_STAGE', '2026-06-28T02:00:00Z', 'TIMED'),
((SELECT id FROM public.bolao_championships WHERE code='WC'), 9900072, 'Jordan',                 'Argentina',               'Rodada 3', 3, 'GROUP_STAGE', '2026-06-28T02:00:00Z', 'TIMED')

ON CONFLICT (fd_match_id) DO NOTHING;

-- Verificação: deve retornar 72
-- SELECT COUNT(*) FROM public.bolao_matches
-- WHERE championship_id = (SELECT id FROM public.bolao_championships WHERE code = 'WC');
