-- ══════════════════════════════════════════════════════════════════
-- fix_duplicate_matches.sql  (gerado a partir do diagnóstico)
--
-- Causa: primeiro import via SofaScore (IDs 9900xxx) e depois via
-- football-data.org (IDs 537xxx). Mesma partida, dois registros.
--
-- Estratégia:
--   1. DELETE nos registros FD (537xxx) — sem palpites, são os novos.
--   2. UPDATE nos originais SofaScore: troca fd_match_id pelo valor FD
--      correto para que futuros syncs não gerem duplicatas.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── PASSO 1: deleta as 60 cópias FD (537xxx) ────────────────────
DELETE FROM public.bolao_matches WHERE id IN (
  '9e4038c1-dbf6-4430-9ba8-20aad9a505ad',  -- Algeria x Austria
  'e1de0a79-64fb-44cc-9a20-0e532603d761',  -- Argentina x Algeria
  '1a5be851-f78e-419c-850b-f0635b92eb61',  -- Argentina x Austria
  '017d7fad-bd07-4c3a-b260-c34275f075de',  -- Austria x Jordan
  'fffcaef7-8282-4124-a894-4ec58d4ace92',  -- Belgium x Egypt
  '5617c5d2-1334-4c0b-99cf-36467cd642de',  -- Belgium x Iran
  '3a12fc16-013a-438d-8ff5-5e733a013095',  -- Brazil x Haiti
  'f0fd0671-ba65-4c72-9a61-607d2221d857',  -- Brazil x Morocco
  '871e57cd-1a42-4818-a82a-dd7bd7db7b45',  -- Canada x Qatar
  '10051f9b-4818-45f1-b1a7-29980a3920aa',  -- Colombia x Portugal
  '8811cf28-23b6-4245-a15e-f3e91059297e',  -- Croatia x Ghana
  'ccdd9acb-6218-4e28-873f-f25bfebe302f',  -- Curaçao x Ivory Coast
  '21c6425d-243d-44e7-8c3a-fc1c71ee0395',  -- Czechia x Mexico
  '00c92e0a-b521-4875-aa08-0737e68aa67f',  -- Czechia x South Africa
  'a00a4896-2fb6-4b6c-8cfb-53164fee899b',  -- Ecuador x Curaçao
  'd763dab1-9345-4112-8533-20e2540b5ce2',  -- Ecuador x Germany
  '9634406d-5072-4a6e-bc0d-28bde2557938',  -- Egypt x Iran
  'a3f1ec6c-1149-416e-985b-f8dd43b7a346',  -- England x Croatia
  '68eafa75-3d80-4571-bca3-e79a78576f07',  -- England x Ghana
  '1285ff60-db48-4adc-bac0-d5a419e68ecf',  -- France x Iraq
  '60916b43-20bd-4557-ad96-9d1ed630c8bb',  -- France x Senegal
  'b0299aa1-1a31-44b4-bf81-40c5ac568c80',  -- Germany x Curaçao
  '983d9815-44c1-4fee-8209-38cc21e4a1ac',  -- Germany x Ivory Coast
  '36ae04d1-1ca3-4c2b-9058-8f3d04b4c2a7',  -- Ghana x Panama
  'af6c3030-b73c-45be-afb0-d5e73c86016e',  -- Haiti x Scotland
  '1d1760dc-f5a1-42d6-8e98-906050ff87d4',  -- Iran x New Zealand
  '1b153452-279f-419b-ba1f-595fb8894db0',  -- Iraq x Norway
  'a34bc03e-33ba-4fa8-b0af-23bc7585fee1',  -- Ivory Coast x Ecuador
  'c1001957-9aba-4b0e-b3d4-cafe1623ea65',  -- Japan x Sweden
  '6beb7b50-3093-4439-97a5-ab729003d779',  -- Jordan x Algeria
  'efcb5e22-72c6-4531-b909-2683cc11e344',  -- Jordan x Argentina
  'eb8f3964-374f-4706-b122-2327c315eff8',  -- Mexico x South Africa
  '3c15bb9e-b1b8-478c-b6de-3c45da2e8377',  -- Mexico x South Korea
  'ede2a9b1-4f01-49ba-bec8-1e3b0a680b6a',  -- Morocco x Haiti
  '68c0c149-9318-431d-96e1-118065b6bee0',  -- Netherlands x Japan
  '10f410f3-8391-4074-8244-23298a7fc8e7',  -- Netherlands x Sweden
  'f7d62db8-0d29-429f-bcb4-921c28a41d09',  -- New Zealand x Belgium
  '934b05f7-c91f-4c61-98a9-ef33d41e779a',  -- New Zealand x Egypt
  '5cea0eff-46d0-4d6a-b96a-d83b4b9a492a',  -- Norway x France
  '5c26fcfd-65bc-4c40-bfc9-e19c3a45ad5e',  -- Norway x Senegal
  'd44a61ea-4319-46b4-950f-6245166bf698',  -- Panama x Croatia
  '5614b192-132a-460a-948f-13dadadabf9e',  -- Panama x England
  'bf8f52a2-7365-4a1b-bfa0-1064a2e1c9e4',  -- Paraguay x Australia
  '9dbee9b4-eb34-45df-8d83-59eed0e1a996',  -- Portugal x Uzbekistan
  'c9ced218-4a05-4942-8228-619fe5388ee0',  -- Qatar x Switzerland
  '48e8c3d7-bd36-4b31-a745-3033ca7f36ae',  -- Saudi Arabia x Uruguay
  '1555a48a-fb83-4be9-a783-c41f0e4f2597',  -- Scotland x Brazil
  '00ed2405-ec8d-4846-9e32-acc57fc905d1',  -- Scotland x Morocco
  '0833f67e-8d53-4a67-9110-7b734d50d0aa',  -- Senegal x Iraq
  'b399101d-2511-47f4-a60f-cf9e07a3c1be',  -- South Africa x South Korea
  '42550ba9-1696-4b64-a402-0053383ebbfd',  -- South Korea x Czechia
  '7725b079-8dc9-4a3e-94dc-1fe3ee24f64b',  -- Spain x Saudi Arabia
  '78598fe9-9938-43a1-be12-f9fb8b82f6f4',  -- Sweden x Tunisia
  'e7690e30-08bc-4801-9276-6f94a398cd5a',  -- Switzerland x Canada
  '9421bfab-a34e-4d3f-91f1-5d2a403d51d9',  -- Tunisia x Japan
  '311757cd-fa98-493e-94de-b62993e354ef',  -- Tunisia x Netherlands
  '98650e34-cd90-4a2d-aae9-aa11974eddea',  -- United States x Australia
  '29062dbe-3a31-4ced-aa4b-8ef3a464eb1e',  -- United States x Paraguay
  'ced5ccfb-2222-43fa-a9a9-d80fa6380f2a',  -- Uruguay x Spain
  '955e7f19-dab4-4263-9247-8537ff76eb43'   -- Uzbekistan x Colombia
);

-- ── PASSO 2: atualiza fd_match_id dos originais para o valor FD correto ──
-- Agora que os duplicados (537xxx) foram deletados, a constraint UNIQUE
-- não bloqueia mais a atualização.
UPDATE public.bolao_matches AS bm
SET fd_match_id = m.new_fd_id, updated_at = now()
FROM (VALUES
  ('3e74d67f-584e-4308-933e-c2857a184926'::uuid, 537402),  -- Algeria x Austria
  ('f03a0678-b7a9-4c55-bb21-7a963b61ec8b'::uuid, 537397),  -- Argentina x Algeria
  ('4279a559-4df3-4785-a315-42f66812ecd5'::uuid, 537399),  -- Argentina x Austria
  ('504dadf0-2ffe-4a25-90a0-4d6f98d6f57a'::uuid, 537398),  -- Austria x Jordan
  ('167dfd19-3242-4859-a650-bd85ef1b72fb'::uuid, 537363),  -- Belgium x Egypt
  ('4f9aecb7-90bc-4aac-b79e-0bf4f942dbc3'::uuid, 537365),  -- Belgium x Iran
  ('df4dcedc-c390-4ac2-a672-faea58d816c7'::uuid, 537341),  -- Brazil x Haiti
  ('956f274b-2cfb-4e40-9226-601ef9738a17'::uuid, 537339),  -- Brazil x Morocco
  ('9ec2dd85-21ae-444a-8ece-7d2c680fd988'::uuid, 537336),  -- Canada x Qatar
  ('9aaaffa8-aafd-4b53-8bc1-6bf08e8de346'::uuid, 537407),  -- Colombia x Portugal
  ('8ee97731-4c7a-4d52-b79a-815c6c725417'::uuid, 537414),  -- Croatia x Ghana
  ('42ab2fb3-ee84-4938-b3fa-6c4b2151b6f2'::uuid, 537356),  -- Curaçao x Ivory Coast
  ('d603a46c-8cf7-4262-96fc-b50a36e14072'::uuid, 537331),  -- Czechia x Mexico
  ('9e8df063-bf01-4f23-82c4-f1d605addf95'::uuid, 537329),  -- Czechia x South Africa
  ('ee9bd42a-c96c-4566-8572-af634d8c798c'::uuid, 537354),  -- Ecuador x Curaçao
  ('f4fef602-8981-4951-8b0d-b5761a063ead'::uuid, 537355),  -- Ecuador x Germany
  ('9c6491fd-3085-4bab-a061-cdfe7c743b21'::uuid, 537368),  -- Egypt x Iran
  ('d8583a18-01ee-4ffd-8b91-8bcc1148c167'::uuid, 537409),  -- England x Croatia
  ('2ef77c77-80ca-4220-a4c3-3791334f75c5'::uuid, 537411),  -- England x Ghana
  ('ebe5591f-8b6a-4a4b-ac61-b79a09ec00d8'::uuid, 537393),  -- France x Iraq
  ('84090310-a1f9-4248-85c5-ab41efbf46d9'::uuid, 537391),  -- France x Senegal
  ('272566d0-275f-45bc-ab91-3203ec0687cb'::uuid, 537351),  -- Germany x Curaçao
  ('fc8628c0-ae52-4ce5-94a7-78c82c5812dd'::uuid, 537353),  -- Germany x Ivory Coast
  ('3748e234-c5d1-455b-bc0f-385a59ffebfb'::uuid, 537410),  -- Ghana x Panama
  ('a1826538-30ad-4ff6-8513-6244cab05d83'::uuid, 537340),  -- Haiti x Scotland
  ('c196bbc6-1839-4bc6-8ca3-6b346af61dc2'::uuid, 537364),  -- Iran x New Zealand
  ('a56faffb-c27c-4797-8d99-37ee7fb9b88f'::uuid, 537392),  -- Iraq x Norway
  ('4bd81f8e-8b9c-4b2f-a3aa-abaa97753d9c'::uuid, 537352),  -- Ivory Coast x Ecuador
  ('cfb2256c-7c09-46fa-9a92-d391cdacf69a'::uuid, 537362),  -- Japan x Sweden
  ('52f5833e-5abc-4180-b9e2-750af2a4d327'::uuid, 537400),  -- Jordan x Algeria
  ('822fe113-8e73-4c33-ab44-eff8a0171026'::uuid, 537401),  -- Jordan x Argentina
  ('9b9c2391-bfe6-438e-b721-9667628b78cb'::uuid, 537327),  -- Mexico x South Africa
  ('d89c68c2-88df-46fb-9100-e63fcae6d46f'::uuid, 537330),  -- Mexico x South Korea
  ('703fb40c-e894-4ef4-8735-b8078b573f0d'::uuid, 537344),  -- Morocco x Haiti
  ('0063988c-8fdd-471d-87d4-3c1d905e3692'::uuid, 537357),  -- Netherlands x Japan
  ('14f84f15-7a1e-4696-b1ae-32bd068d5a10'::uuid, 537359),  -- Netherlands x Sweden
  ('62fba4e7-962f-4140-a8b7-8b0ed46b4000'::uuid, 537367),  -- New Zealand x Belgium
  ('ee0ce5ff-4904-434b-9292-a21dc9436241'::uuid, 537366),  -- New Zealand x Egypt
  ('4cf0fe08-af35-4d70-911c-4e23290f015a'::uuid, 537395),  -- Norway x France
  ('15e08bab-7dfd-4535-aebe-915026c4a6ef'::uuid, 537394),  -- Norway x Senegal
  ('dedc8451-1cbd-4c9b-afa0-49456fec29a0'::uuid, 537412),  -- Panama x Croatia
  ('8122d1eb-63ef-4186-9490-e943f755915f'::uuid, 537413),  -- Panama x England
  ('ea42f1d5-83fd-41d0-b755-d610868ae17d'::uuid, 537350),  -- Paraguay x Australia
  ('ba171fdb-a57c-44f4-9b0e-83d4c98c2a1d'::uuid, 537405),  -- Portugal x Uzbekistan
  ('7139b637-0604-4f3a-87b8-be97f43267d3'::uuid, 537334),  -- Qatar x Switzerland
  ('024aa0ca-a8fb-4e21-89b2-3c1c60bd0d2d'::uuid, 537370),  -- Saudi Arabia x Uruguay
  ('4d4ecf63-5e56-42c0-a92a-517add0e262e'::uuid, 537343),  -- Scotland x Brazil
  ('415282b6-ba08-49d2-9da0-51c13254cc74'::uuid, 537342),  -- Scotland x Morocco
  ('3d1daaed-7a32-45dc-9709-19de9c306262'::uuid, 537396),  -- Senegal x Iraq
  ('640ee695-8a5f-4a4b-a48b-49493bab5cc3'::uuid, 537332),  -- South Africa x South Korea
  ('a4ed712b-0c13-4b55-8dac-785a7e3f2726'::uuid, 537328),  -- South Korea x Czechia
  ('bd0df3e0-65d6-4a19-a9ae-482fd852b3e0'::uuid, 537371),  -- Spain x Saudi Arabia
  ('7ad7c0a8-6ed8-432e-b082-c8b549b8166d'::uuid, 537358),  -- Sweden x Tunisia
  ('c752d416-d8f1-43bf-acbd-80e9eb565442'::uuid, 537337),  -- Switzerland x Canada
  ('cebdf20c-8850-4aec-b277-d9fa3152306a'::uuid, 537360),  -- Tunisia x Japan
  ('a1d65342-0ac1-4e04-8180-48e900640405'::uuid, 537361),  -- Tunisia x Netherlands
  ('4a36a591-4bf1-4aef-8786-55bc8a2a9d77'::uuid, 537348),  -- United States x Australia
  ('edd146c8-d4b1-4449-9d20-eb810e5e1ec9'::uuid, 537345),  -- United States x Paraguay
  ('a225aa5c-ce49-45ab-bf99-f552c4cf3079'::uuid, 537373),  -- Uruguay x Spain
  ('dde0b4d2-41ff-4bb6-8bdd-adf91fa0b68c'::uuid, 537404)   -- Uzbekistan x Colombia
) AS m(id, new_fd_id)
WHERE bm.id = m.id;

COMMIT;

-- ── VERIFICAÇÃO: deve retornar 0 linhas ────────────────────────────
SELECT home_team, away_team, COUNT(*) AS total
FROM public.bolao_matches
WHERE home_team NOT IN ('A definir') AND away_team NOT IN ('A definir')
GROUP BY championship_id, home_team, away_team, DATE_TRUNC('day', utc_date)
HAVING COUNT(*) > 1;
