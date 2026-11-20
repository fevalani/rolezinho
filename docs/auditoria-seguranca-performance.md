# Auditoria de segurança e performance — Rolezinho

Levantamento feito em 20/11/2026 (v0.0.98), lendo o código, as migrations em `supabase/`, as funções em `api/` e a config de build/deploy. Nada foi alterado no código.

**Como usar:** cada tarefa tem ID, prioridade, esforço (P = ≤ 2h, M = meio dia, G = 1+ dia), onde mexer, o que fazer e como saber que acabou. Pelo `CLAUDE.md`, toda tarefa precisa de teste em `src/test/`, e mudança de schema vira `.sql` em `supabase/` (registrar como pendente até rodar).

**Limite da auditoria:** só vejo o que está versionado. O que foi criado direto no painel do Supabase (tabelas `cultura_*`, `agenda`, `aniversarios`, `music_*`, bucket `public-assets`, triggers/webhooks) não tem SQL no repo, então **não pude auditar as policies dessas tabelas**. Ver S-12.

---

## Resumo

| ID | Prioridade | Esforço | Tema |
|----|-----------|---------|------|
| S-01 | 🔴 Crítica | M | Arena: qualquer usuário edita o próprio saldo e pagamentos |
| S-02 | 🔴 Crítica | P | Bolão: qualquer usuário reescreve campeonatos e partidas |
| S-03 | 🔴 Crítica | P | `create_bolao_pool` aceita `user_id` do cliente (SECURITY DEFINER) |
| S-04 | 🟠 Alta | M | Chaves de API (Gemini, TMDB, RapidAPI, Football-Data, Books) embutidas no bundle |
| S-05 | 🟠 Alta | P | Proxies `api/` abertos: sem auth, sem whitelist, sem limite |
| S-06 | 🟠 Alta | P | Edge function `notify-cultura-post` sem verificação de origem |
| S-07 | 🟠 Alta | P | Trava de palpite do bolão só existe no cliente |
| S-08 | 🟠 Alta | P | Dependências com vulnerabilidades (1 crítica, 9 altas) |
| S-09 | 🟡 Média | P | Sem headers de segurança (CSP, HSTS, etc.) |
| S-10 | 🟡 Média | P | Cache local não é limpo no logout |
| S-11 | 🟡 Média | P | Links do Notion sem checar esquema (`javascript:`) |
| S-12 | 🟡 Média | M | Schema/policies fora do repo (cultura, agenda, aniversários, músicas, storage) |
| S-13 | 🟢 Baixa | P | `search_path` ausente em funções SECURITY DEFINER antigas |
| S-14 | 🟢 Baixa | P | Cadastro aberto, senha mínima de 6, e-mail visível a todos |
| S-15 | 🟢 Baixa | P | Android: `allowBackup="true"` |
| S-16 | 🟢 Baixa | P | Token do Notion em texto puro no banco |
| P-01 | 🔴 Alta | M | Sem code-splitting: bundle principal de ~1,4 MB |
| P-02 | 🟠 Alta | M | Fontes do Google bloqueando render + 4 famílias |
| P-03 | 🟠 Média | P | Imagens grandes sem otimização/lazy |
| P-04 | 🟠 Média | M | `select("*")` e consultas em cascata |
| P-05 | 🟡 Média | M | Service worker: cache sem estratégia por tipo de arquivo |
| P-06 | 🟡 Média | G | Telas gigantes (2.000+ linhas) sem memoização |
| P-07 | 🟡 Média | P | Realtime: canais sem limpeza/filtro garantidos |
| P-08 | 🟢 Baixa | P | Proxies sem cache HTTP |
| P-09 | 🟢 Baixa | P | Higiene do repo/build |

**Ordem sugerida:** S-01 → S-03 (mesma migration, mesmo dia) → S-02 → S-07 → S-05/S-06 → S-04 → P-01 → resto.

---

# Segurança

## S-01 🔴 Arena: saldo e pagamentos editáveis pelo próprio usuário
**Onde:** `supabase/arena_migration.sql` (policies de `arena_wallets`, `arena_bets`, `arena_duels`) e `src/features/arena/arenaService.ts`.

**Problema:**
- `arena_wallets` tem `UPDATE` para o dono sem restrição de coluna: qualquer usuário logado faz `supabase.from("arena_wallets").update({ balance: 999999 })` pelo console e fica com saldo infinito.
- `arena_bets`: o dono pode dar `UPDATE` em `actual_payout`, `payout_claimed`, `side` e `amount` da própria aposta; o criador do duelo pode alterar qualquer aposta do duelo (a policy "atualizar" é `USING` sem `WITH CHECK`).
- `INSERT` em `arena_bets` não valida valor, saldo, nem se o duelo ainda está aberto.
- Hoje a regra de pagamento mora no cliente; o banco só confia.

**O que fazer:**
1. Remover as policies de `UPDATE` em `arena_wallets` e de `UPDATE` em `arena_bets`; remover `INSERT` direto em ambas.
2. Criar RPCs `SECURITY DEFINER` com `set search_path = public` e `auth.uid()` (nunca receber `user_id` por parâmetro):
   - `arena_place_bet(duel_id, side, amount)` — valida duelo aberto, `amount > 0`, saldo suficiente, desconta do saldo e grava a aposta na mesma transação.
   - `arena_resolve_duel(duel_id, winning_side)` — só o criador, só se aberto; calcula e credita pagamentos.
   - `arena_claim_payout(bet_id)` — idempotente (`payout_claimed`).
3. `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated`.
4. Adicionar `CHECK (balance >= 0)` na carteira.
5. Trocar as escritas em `arenaService.ts` pelas RPCs.

**Pronto quando:** teste de que `update` direto em carteira/aposta falha (via `mockDb.errors`), e testes das RPCs no `arenaService` (aposta com saldo insuficiente, duelo fechado, pagamento duplicado). Rodar no banco real e tentar o ataque pelo console.

## S-02 🔴 Bolão: campeonatos e partidas graváveis por qualquer usuário
**Onde:** `supabase/bolao_migration.sql` linhas ~131–136.

**Problema:** `bolao_championships_write` e `bolao_matches_write` são `FOR ALL ... USING (true) WITH CHECK (true)`. O comentário diz "sync da API", mas na prática qualquer usuário logado pode apagar partidas ou mudar placar/data, e o ranking de todos os bolões muda.

**O que fazer:**
- Escrita de `bolao_matches`/`bolao_championships` só por quem pode gerenciar (`is_app_admin()` ou o dono do bolão que usa aquele campeonato) **ou** mover o sync para uma RPC `SECURITY DEFINER` (ex.: `bolao_sync_matches(...)`) que valida o chamador.
- Se o sync precisa rodar para qualquer membro (hoje roda ao abrir o bolão, ver `bolaoService.ts` ~linha 880), mantê-lo em RPC que só aceita atualizar placar/status de partidas existentes e **nunca** alterar `utc_date`/times de partidas já iniciadas.
- Deixar `SELECT` como está.

**Pronto quando:** `update` direto em `bolao_matches` por usuário comum falha; o sync de resultados continua funcionando (teste no `bolaoService`).

## S-03 🔴 `create_bolao_pool` confia no `p_user_id` do cliente
**Onde:** `supabase/bolao_migration.sql` (função `create_bolao_pool`).

**Problema:** `SECURITY DEFINER` sem `search_path` e com `p_user_id` vindo do cliente: qualquer um cria bolão e coloca *outra pessoa* como criador/membro, ignorando as policies (`created_by = auth.uid()`).

**O que fazer:** nova migration com `create or replace function`, removendo `p_user_id` e usando `auth.uid()`; adicionar `set search_path = public`; `revoke`/`grant` para `authenticated`. Ajustar a chamada em `bolaoService.ts`. Como o PostgREST não permite sobrecarga ambígua, **dropar a assinatura antiga** (`drop function public.create_bolao_pool(text, uuid, uuid)`).

**Pronto quando:** chamar a RPC passando outro id não tem efeito; criação normal funciona.

## S-04 🟠 Chaves de API no bundle do cliente
**Onde:** `src/features/arena/arenaService.ts:56` (Gemini), `bolao/footballApi.ts:80-84` (Football-Data, RapidAPI), `cultura/culturaApi.ts:23,67` (TMDB, Google Books). Qualquer variável `VITE_*` vai em texto claro no JS público e no APK.

**Risco:** quem abrir o DevTools copia a chave e gasta a cota (Gemini e RapidAPI são pagas/limitadas) ou derruba o app por rate limit.

**O que fazer (regra 6 do CLAUDE.md):**
1. Criar proxies em `api/` (`gemini-proxy`, `rapidapi-proxy`, `tmdb-proxy`, `books-proxy`), cada um:
   - exige JWT do Supabase (mesmo padrão do `notion-proxy.ts`: `supabase.auth.getUser(jwt)`);
   - usa variável **sem** prefixo `VITE_` (`GEMINI_KEY`, etc.) no Vercel;
   - valida entrada (ver S-05).
2. Cliente passa a chamar `/api/...` mandando `Authorization: Bearer <access_token>`.
3. **Rotacionar todas as chaves atuais** (já estão expostas em builds publicados) e remover os `VITE_*` do Vercel e do `.env.local` depois.
4. Chaves de TMDB/Books podem ser restritas por referrer no console do Google/TMDB como quebra-galho imediato (feito em 10 min, sem código).
5. Gemini: o prompt da Arena inclui texto livre do usuário (`scenario`, `creatorContext`) → além de proxy, limitar tamanho (ex.: 500 chars) e tratar como dado, não instrução.

**Pronto quando:** `grep -r "VITE_GEMINI\|VITE_RAPIDAPI\|VITE_FOOTBALL\|VITE_TMDB\|VITE_GOOGLE_BOOKS" src` retorna vazio e o bundle em `dist/` não contém nenhuma das chaves.

## S-05 🟠 Proxies `api/` abertos
**Onde:** `api/fd-proxy.ts`, `api/sportsdb-proxy.ts`, `api/lance-proxy.ts`.

**Problema:**
- Sem autenticação: qualquer um na internet usa a chave do Football-Data (hoje lida de `VITE_FOOTBALL_DATA_KEY`) e seus limites.
- `req.query.path` é concatenado direto na URL de destino: dá pra consultar **qualquer endpoint** da API com a sua chave. Entradas como `/../` ou `?` extra também passam.
- Sem tratamento de erro/timeout: se a API externa cair, a function lança 500 e fica pendurada.
- `fd-proxy` e `sportsdb-proxy` não setam `Cache-Control` (ver P-08).

**O que fazer:**
1. Exigir JWT (helper compartilhado `api/_auth.ts` que valida o token — reaproveita o código do notion-proxy).
2. Whitelist por regex do `path` (ex.: `^/competitions/[A-Z0-9]+/(matches|standings)$`) e rejeitar o resto com 400.
3. `try/catch` + `AbortSignal.timeout(8000)` no `fetch`; devolver 502 com mensagem curta.
4. Renomear a env do Football-Data para `FOOTBALL_DATA_KEY` (sem `VITE_`).
5. `notion-proxy.ts`: limitar tamanho do corpo e validar que `tableId` é UUID.

**Pronto quando:** teste unitário do handler (mock de `fetch`) cobrindo: sem token → 401; path fora da whitelist → 400; path válido → repassa.

## S-06 🟠 Edge function `notify-cultura-post` sem verificação de origem
**Onde:** `supabase/functions/notify-cultura-post/index.ts`.

**Problema:** a function aceita qualquer `POST` com `{record: {...}}`, usa a **service role** e dispara push para todos os tokens. Se o deploy estiver com `verify_jwt` desligado (comum para webhooks de banco), qualquer um pode enviar notificação falsa a todos os usuários. Também faz `.single()` sem tratar erro e envia `Promise.all` sem limite/erro por token (um token inválido não é removido).

**O que fazer:**
1. Validar um segredo compartilhado: o webhook do Database envia header `Authorization: Bearer <WEBHOOK_SECRET>`; a function compara com `Deno.env.get("WEBHOOK_SECRET")` e devolve 401 se não bater.
2. Conferir no painel se `verify_jwt` está ligado para essa function.
3. Tratar resposta do FCM: em `UNREGISTERED`/`404`, apagar o token de `push_tokens`.
4. Enviar em lotes (ex.: 20 por vez) e logar falhas.
5. Registrar o webhook/trigger em SQL no repo (ver S-12).

## S-07 🟠 Trava de palpite do bolão é só do cliente
**Onde:** `src/features/bolao/bolaoService.ts:825-855` (a checagem está no cliente) e `supabase/bolao_migration.sql` (`bolao_predictions_write`: `FOR ALL` só por `user_id = auth.uid()`).

**Problema:** o comentário do código fala em "guard autoritativo", mas a checagem roda no navegador. Chamando `supabase.from("bolao_predictions").upsert(...)` direto, o usuário altera palpite depois do apito (inclusive depois de ver o placar).

**O que fazer:** trigger `BEFORE INSERT OR UPDATE` em `bolao_predictions` que consulta `bolao_matches.utc_date/status` e levanta exceção se a partida já começou (usar `now()` do banco). Manter o guard no cliente só para dar mensagem amigável. Considerar também travar `DELETE` pelo mesmo motivo.

**Pronto quando:** teste (SQL ou de service com erro simulado) de palpite após o início → erro; antes → ok. Hoje `src/test` mocka o Supabase, então registre o caso de SQL como roteiro manual no PR.

## S-08 🟠 Dependências vulneráveis
`npm audit --omit=dev` aponta **16 vulnerabilidades (1 crítica, 9 altas)**. Diretas: `@capacitor/android` (crítica), `react-router-dom`, `vite`. Transitivas: `ws`, `postcss`, `nanoid`, `picomatch`, `browserslist`, `source-map-js`.

**O que fazer:** `npm audit fix` (sem `--force`) primeiro; rodar a suíte; depois tratar as diretas com upgrade de minor/patch (`react-router-dom`, `vite`, `@capacitor/*`). Para o Capacitor Android, ler o advisory: só afeta o APK, então pode exigir novo build nativo — registrar na regra 9. Adicionar `npm audit --omit=dev --audit-level=high` como passo manual antes de cada `deploy:web`.

## S-09 🟡 Sem headers de segurança
**Onde:** `vercel.json` (não tem bloco `headers`).

**O que fazer:** adicionar em `headers` para `/(.*)`:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (ajustar se algo usar)
- `X-Frame-Options: DENY` (ou `frame-ancestors 'none'` na CSP)
- **CSP** começando em modo `Content-Security-Policy-Report-Only`, liberando: `self`, Supabase (`https://*.supabase.co` + `wss://`), GTM/GA, Google Fonts, TMDB/Spotify/YouTube (imagens), e `'unsafe-inline'` para estilos se necessário. Observar o console por 1 semana e só então virar para `Content-Security-Policy`.

Cuidado: o app roda dentro do WebView do APK via `server.url`; testar o APK depois do deploy.

## S-10 🟡 Cache local não é limpo no logout
**Onde:** `src/lib/localCache.ts` e `src/lib/AuthContext.tsx:229` (`signOut`).

**Problema:** `rolezinho:cache:*` (snapshots do bolão etc.) continua no `localStorage` depois do logout. Em aparelho compartilhado, o próximo usuário vê dados do anterior por alguns instantes (stale-while-revalidate), e o cache nunca expira por idade.

**O que fazer:** criar `clearAllCache()` em `localCache.ts` (remove chaves com o prefixo) e chamá-la em `signOut`; opcionalmente guardar o `user.id` dentro do envelope e descartar quando diferir do usuário atual. Teste: gravar cache → `signOut` → `readCache` retorna `null`.

## S-11 🟡 Links do Notion sem checar esquema
**Onde:** `src/features/rpg/NotionPanel.tsx` (~linhas 380–400 e 550–562: `href={t.href}` e `href={b.url}`) e `api/notion-proxy.ts` (`rich()` e blocos `bookmark`/`embed`/imagem externa).

**Problema:** o conteúdo vem do Notion do mestre; se tiver `javascript:`/`data:` como href, vira link clicável dentro do app (XSS por clique). Risco baixo (mestre é de confiança), mas barato de fechar.

**O que fazer:** helper `safeUrl(u)` em `rpgLogic.ts` que só aceita `http:`/`https:`/`mailto:` (via `new URL`), usado no proxy (descartar) e na renderização (fallback para `#`/texto puro). Testar `javascript:alert(1)`.

## S-12 🟡 Banco fora do versionamento
**Problema:** a regra 7 do CLAUDE.md diz que todo schema vira `.sql`, mas não existem migrations para `cultura_items`/posts de cultura, agenda, aniversários, músicas (`music_*`), `push_tokens` (existe) com o webhook, o bucket `public-assets` e as policies de storage dessas pastas. Isso impede auditar RLS e recriar o ambiente.

**O que fazer:**
1. Exportar o schema atual (`supabase db dump --schema public -f supabase/baseline_schema.sql` ou `pg_dump --schema-only`) e commitar como baseline.
2. Revisar, com o dump na mão, cada tabela sem migration: RLS ligado? Existe policy `FOR ALL USING (true)`? Escrita só pelo dono?
3. Revisar o bucket `public-assets`: quem pode `INSERT`/`UPDATE`/`DELETE`? Limite de tamanho e de MIME? (o `notion-proxy` grava lá com `upsert`).
4. Confirmar no painel: **"Confirm email" ligado**, política de senha, rate limit de Auth, e que a `service_role` não está em nenhuma env `VITE_*`.

## S-13 🟢 `search_path` ausente em SECURITY DEFINER antigas
**Onde:** `migration.sql`, `bolao_migration.sql`, `bolao_score_fix.sql`, `bolao_*_migration.sql` (várias), `rpg_schema.sql`, `racha_conta_migration.sql`, `letroso_dictionary_migration.sql`.

**O que fazer:** uma migration `security_definer_hardening.sql` com `alter function ... set search_path = public;` para cada função listada por:
`grep -il "security definer" supabase/*.sql | xargs grep -L search_path`. Aproveitar para conferir que cada função começa checando `auth.uid()` ou `can_manage_bolao_pool` (as de `bolao_permissions_migration.sql` já fazem). Funções sem checagem de autor são o mesmo bug do S-03.

## S-14 🟢 Cadastro, senha e exposição de e-mail
- `LoginPage.tsx` permite `signUp` e exige só 6 caracteres. Para um app de amigos, considerar: cadastro por convite/allowlist (hook de Auth no Supabase ou checagem no `handle_new_user`), senha mínima 8 e ativar proteção de senha vazada no painel.
- `profiles` guarda `email` e a policy de `SELECT` é `USING (true)` para todo autenticado: qualquer conta nova enxerga o e-mail de todos. Se o app não usa o e-mail dos outros, mover o e-mail para outra tabela (ou ocultar a coluna com uma view) — porém, como o cadastro é aberto, hoje basta criar conta para raspar todos os e-mails.
- `ADMIN_EMAILS` só esconde UI (correto, regra 5); confirmar que toda tela `/admin` tem RLS equivalente (as de `admin_roles_migration.sql` têm).

## S-15 🟢 Android: backup habilitado
`android/app/src/main/AndroidManifest.xml:4` tem `allowBackup="true"`: o `localStorage` do WebView (incluindo o token de sessão do Supabase) pode ir para backup do Google/adb. Trocar para `false` (ou definir `dataExtractionRules`). Exige novo APK. `webContentsDebuggingEnabled: false` e `allowMixedContent: false` já estão corretos.

## S-16 🟢 Token do Notion em texto puro
`rpg_notion_connections.access_token`. A RLS limita ao mestre (ok), mas um dump/backup expõe o token. Opcional: criptografar com `pgsodium`/Vault do Supabase, ou ao menos documentar a rotação. A policy é `FOR ALL`, então o mestre consegue dar `select access_token` pelo console — tudo bem, o token é dele; só garantir que nenhuma tela o logue.

---

# Performance

## P-01 🔴 Sem code-splitting (bundle principal ~1,4 MB)
**Onde:** `src/App.tsx` importa todas as telas de forma estática (há só 1 uso de `lazy` no projeto). O último build tem `index-*.js` com **1,43 MB** (~400 KB gzip estimado) mais um chunk de 141 KB do Fronteiras. Tudo isso baixa e é parseado antes da home aparecer, principalmente pesado em celular com rede ruim e no APK (OTA).

**O que fazer:**
1. Em `App.tsx`, trocar os imports de páginas por `React.lazy(() => import(...))` — como os componentes são exports nomeados, usar `lazy(() => import("...").then(m => ({ default: m.BolaoPage })))`. Manter estático só: `HomePage`, `AppShell`, `LoginPage`, `ProtectedRoute`.
2. Envolver `<Routes>` em `<Suspense fallback={<spinner existente/>}>`.
3. Pesadas que devem sair do bundle inicial: `recharts` (BolaoStatsTab/Wrapped), `harfbuzzjs`, `d3-geo`/`topojson`/`world-atlas` (Fronteiras), dicionário do Letroso/Word500, `RachaConta`, `Rpg*`, `Bolao*`, `Cultura`, `Admin`.
4. `vite.config.ts`: `build.rollupOptions.output.manualChunks` separando `react`/`react-router`, `supabase`, `recharts`.
5. (Opcional) prefetch ao tocar no card da home (`onPointerEnter` chama o `import()`).
6. Medir antes/depois com `npx vite-bundle-visualizer` e anotar o resultado no PR.

**Pronto quando:** `index-*.js` abaixo de ~400 KB (sem gzip) e as telas continuam montando — o `pages.smoke.test.tsx` já cobre isso; adicionar um teste com `Suspense` de que a rota renderiza após o carregamento.

## P-02 🟠 Fontes do Google bloqueando renderização
**Onde:** `index.html` carrega 4 famílias (Cinzel Decorative em 3 pesos, Crimson Pro em 5 estilos, JetBrains Mono, Space Grotesk) via CSS externo, que bloqueia o primeiro render.

**O que fazer:** (a) cortar pesos/estilos não usados (verificar o que o CSS realmente usa: `grep -rn "font-family\|font-weight"`); (b) autohospedar os `.woff2` em `public/fonts` com `font-display: swap` e `<link rel="preload" as="font" crossorigin>` só para a fonte do corpo — também elimina a dependência de rede do Google no APK; (c) se mantiver o Google, usar `media="print" onload="this.media='all'"` ou mover o `@import` para não bloquear.
Também: o GTM carrega no `<head>` já no início; avaliar adiar para depois do `load` (a cada visita ele baixa ~100 KB de terceiros).

## P-03 🟠 Imagens sem otimização
**Onde:** `public/icons/icon-512.png` tem **700 KB**; `public/images` tem 816 KB; `public/crests` 920 KB. Só **1** `loading="lazy"` em 27 `<img>`.

**O que fazer:** converter ícones/brasões para WebP/AVIF ou PNG reduzido (squoosh/`sharp`); `icon-512` precisa ser ≤ 100 KB; `loading="lazy"` e `decoding="async"` em listas (brasões de times, avatares, capas de cultura/músicas, thumbs); definir `width`/`height` para evitar salto de layout; avatares em `profiles.avatar_url` — redimensionar no upload (ex.: 256 px, WebP) em vez de salvar o original. Ver `src/lib/utils.ts` e `ProfilePage.tsx` para o ponto de upload.

## P-04 🟠 `select("*")` e consultas em cascata
**Onde:** 55 usos de `select("*")` em `src/**` (maior concentração em `bolaoService.ts`, `rpgService.ts`, `musicService.ts`), e 22 consultas a `profiles` espalhadas.

**O que fazer:**
1. Trocar `select("*")` por lista de colunas nas telas de listagem (o ganho maior é em tabelas com JSON grande: `rpg_notion_pages.blocks`, `rpg_sheets`, `wrapped_*`, `rpg_feed_posts`).
2. Onde há "busca itens → depois busca perfis dos autores", usar embed do PostgREST (`select("*, profile:profiles(display_name, avatar_url)")`, como já feito na Arena) em vez de duas idas ao banco.
3. Loops com `await` dentro (`bolaoService.ts` ~895–1050: pontuação/sync por partida; `rpgService.ts` ~266) → trocar por `Promise.all` com limite ou por uma única RPC/`upsert` em lote.
4. Paginar listas que crescem sem fim: feed do RPG, rolagens (`dice_rolls`, `rpg_table_rolls`), `arena_bets`, músicas — `.range()` + "carregar mais", e `.limit()` nas consultas de histórico.
5. Conferir índices para os filtros mais usados (`user_id`, `pool_id`, `table_id`, `created_at desc`) — as migrations de Arena/Dice têm, as demais devem ser conferidas no dump (S-12).

## P-05 🟡 Service worker sem estratégia por tipo
**Onde:** `public/sw.js`.

**Problemas:** (a) "network first" para tudo: assets com hash (`/assets/*-abc123.js`), que são imutáveis, esperam a rede toda vez; (b) coloca no cache qualquer GET same-origin OK, incluindo `/api/*` (resposta de proxy de placar pode ficar "congelada" offline) e imagens enormes sem limite; (c) `CACHE_NAME` fixo `rolezinho-v2` — cache cresce e só limpa quando alguém muda o nome; (d) o modo dev depende de `hostname.startsWith("192.168.")`, o que desregistra o SW também para quem abrir o app numa rede interna.

**O que fazer:** `/assets/*` → cache-first (imutável); navegação (`index.html`) → network-first com fallback; `/api/*` → nunca cachear (ou stale-while-revalidate curto); imagens → stale-while-revalidate com teto de entradas; incluir a versão do app (`VITE_APP_VERSION`) no nome do cache para limpar sozinho a cada deploy. Testar offline manualmente (DevTools → Network → Offline).

## P-06 🟡 Telas gigantes sem memoização
**Onde (linhas):** `BolaoDetailPage.tsx` 2199, `RachaContaPage.tsx` 2185, `RpgSheetView.tsx` 1711, `RpgTablePage.tsx` 1312, `LetrecoPage.tsx` 1080, `CulturaPage.tsx` 999. A regra 8 do CLAUDE.md pede quebrar acima de ~600 linhas.

**Impacto no usuário:** um único `setState` (digitar num campo, timer do jogo, realtime) re-renderiza a tela inteira e todas as listas; sensível em celular fraco, principalmente no bolão (muitas partidas × palpites) e na ficha do RPG (cada tecla).

**O que fazer (por tela, em PRs separados, começando pelo Bolão e pela ficha do RPG):**
- extrair cada aba/seção em componente próprio com `React.memo` e props estáveis (`useCallback`/`useMemo` só onde o React DevTools Profiler mostrar re-render caro);
- timers (`setInterval` em `BolaoDetailPage.tsx:971`, `useSudokuTimer`) devem atualizar só o componente do relógio, não a página;
- inputs da ficha do RPG: debounce de gravação (400–800 ms) em vez de gravar a cada tecla;
- listas longas (partidas, ranking, feed): virtualização só se passarem de ~200 itens.

## P-07 🟡 Realtime
**Onde:** 11 canais (`cultura`, `agenda`, `arena_feed`, `bolao_pool_*`, `feed:*`, `rolls:*`, `ranking_table_*`, `music*`, `dice_rolls_realtime`).

**O que fazer:** conferir que **todo** `.channel()` tem `removeChannel`/`unsubscribe` no cleanup do `useEffect` (principalmente `React.StrictMode` em dev, que monta duas vezes); filtrar por `filter: "table_id=eq.X"` onde ainda não há, para o cliente não receber eventos de todas as mesas/bolões; e, ao receber evento, atualizar o item em estado em vez de refazer a consulta inteira. Fechar canais quando o app vai para segundo plano no APK (`CapApp` `appStateChange`) e reabrir ao voltar.

## P-08 🟢 Proxies sem cache HTTP
`api/fd-proxy.ts` e `api/sportsdb-proxy.ts` não enviam `Cache-Control`; cada usuário refaz a mesma chamada à API externa (que tem cota). Adicionar `s-maxage=60, stale-while-revalidate=300` para endpoints de partidas/tabela (o `lance-proxy.ts` já faz isso com 180 s). Reduz custo, latência e risco de bater no rate limit do Football-Data (10 req/min no plano grátis) — um problema real em dia de jogo com vários usuários sincronizando ao mesmo tempo.

## P-09 🟢 Higiene do repo/build
- `.env.production` está **versionado** e contém só `VITE_APP_VERSION` (inofensivo), mas é um precedente ruim com `.env*` no `.gitignore` — gerar essa variável no `bump-version.js` ou no `vite.config.ts` (`define`) e tirar o arquivo do git, para ninguém commitar segredo ali por engano.
- Arquivos soltos na raiz: `public__favicon.svg`, `dictionary_new.txt`, `tsconfig.tsbuildinfo` (já ignorado, mas existe), `dist/` antigo. Mover/apagar o que não é usado.
- `vercel.json`: `buildCommand` mal indentado (cosmético) e a regra `/(.*) → /index.html` captura `/api/*` inexistentes devolvendo HTML 200; trocar por 404 para `/api/*` não encontrado.
- `package.json`: `typescript`, `vite`, `tailwindcss`, `@tailwindcss/vite`, `@vitejs/plugin-react` estão em `dependencies` (deveriam ser `devDependencies`; não afeta o bundle, mas deixa o deploy/`npm audit --omit=dev` mais barulhento).
- Adicionar `npm run test` + `npx tsc -b` + `npm run typecheck:test` como GitHub Action (não há CI hoje); evita deploy quebrado.

---

# Checklist de verificação final (para o dev)

- [ ] Nenhuma chave `VITE_*` além de `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_VERSION`, `PUBLIC_URL`; chaves antigas rotacionadas.
- [ ] Tentativas pelo console do navegador falham: editar saldo da Arena, alterar `bolao_matches`, palpitar depois do início, criar bolão em nome de outro.
- [ ] `npm audit --omit=dev --audit-level=high` sem críticos.
- [ ] Bundle inicial < 400 KB; Lighthouse mobile (perfil "Slow 4G") com LCP < 3 s na home.
- [ ] `npm test`, `npx tsc -b`, `npm run typecheck:test`, `npx eslint <arquivos>` verdes.
- [ ] Migrations novas listadas como pendentes em `docs/` até serem rodadas no Supabase.

---

# Status da implementação (20/11/2026)

| ID | Situação |
|----|----------|
| S-01 | **Feito no código; migration pendente:** `supabase/arena_security_migration.sql` |
| S-03 | **Feito no código; migration pendente:** `supabase/bolao_security_migration.sql` (cliente já não manda `p_user_id`) |
| S-07 | Feito (trigger em `bolao_security_migration.sql`, pendente de rodar) |
| S-02 | **Parcial:** trigger protege partidas iniciadas; as policies `FOR ALL` continuam, porque o sync roda no navegador. Fechar de vez = mover o sync para function server-side |
| S-05 | Feito para `fd-proxy`/`sportsdb-proxy` (JWT, whitelist, timeout, cache). `lance-proxy` é HTML público, não mexido |
| S-06 | Feito no código; **precisa** `WEBHOOK_SECRET` no Supabase e header no webhook antes do deploy da function |
| S-09 | Feito em modo **Report-Only** (observar o console 1 semana antes de virar CSP de verdade) |
| S-10, S-11, S-15 | Feito (S-15 só vale num novo APK) |
| P-01 | Feito: bundle principal 1,43 MB → ~89 kB |
| P-08 | Feito junto com S-05 |
| **Não feitos** | S-04 (proxies das chaves + rotação), S-08, S-12, S-13, S-14, S-16, P-02..P-07, P-09 |
