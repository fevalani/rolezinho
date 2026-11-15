# Rolezinho — estrutura detalhada

Referência de estrutura do projeto (v0.0.84, nov/2026), conferida no código. Itens marcados como **(não confirmado)** não puderam ser verificados só pelo repositório.

## 1. Visão geral

App social privado de um grupo de amigos, em pt-BR. Roda como PWA na Vercel e como APK Android via Capacitor (`appId` `com.taverna.amigos`, nome "Rolezinho Roots").

- Produção: https://rolezinho-amigos.vercel.app
- Repositório local: `~/projetos/rolezinho`

## 2. Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind 4, react-router-dom 7, Recharts 3 |
| Backend | Supabase (auth, Postgres, RLS, RPCs `SECURITY DEFINER`, edge function) |
| Mobile | Capacitor 8: app, core, filesystem, haptics, local-notifications, push-notifications, share, splash-screen, status-bar |
| Testes | Vitest + Testing Library (jsdom), em `src/test/` |
| Serverless | Vercel Functions em `api/` |
| IA | Gemini, chamado **direto do navegador** em `src/features/arena/arenaService.ts` com `VITE_GEMINI_KEY` (ver seção 11) |

Alias de import: `@` → `src/`. Dev server na porta 3000, com proxies `/fd-api`, `/sportsdb-api` e `/lance-api` (ver `vite.config.ts`).

## 3. Estrutura de pastas

```
api/                  funções serverless da Vercel
android/              projeto nativo Capacitor
assets/               ícone e splash de origem
docs/                 documentação por feature + gtm/
public/               manifest, sw.js (network-first), ícones, .well-known/assetlinks.json
scripts/              bump-version.js, build-android.sh, geradores de sudoku/dicionário do Letroso
supabase/             migrations *.sql (36 arquivos) + functions/notify-cultura-post
src/
  App.tsx             rotas, ProtectedRoute, App Links, trackPageView
  components/         AppShell, Avatar, SeasonalPreviewBanner
  pages/              HomePage, LoginPage, ProfilePage, ThemesAdminPage
  lib/                AuthContext, supabase, admin, types, analytics, haptics, localCache,
                      notificationService, pushTokenService, usePullToRefresh, useBetaMode, seasonal/
  features/<módulo>/  página(s) + <módulo>Service.ts + tipos/lógica
  styles/             global.css + seasons/ (natal, republica, anonovo, pascoa)
  test/               testes unitários
```

## 4. Módulos, rotas e dados

Registro dos módulos exibidos na Home: `APP_FEATURES` em [src/lib/types.ts](../src/lib/types.ts). Rotas em [src/App.tsx](../src/App.tsx).

| Rota | Módulo (`src/features/…`) | Tabelas / RPCs | Dependências externas |
| --- | --- | --- | --- |
| `/` | `pages/HomePage` | `profiles` | — |
| `/profile` | `pages/ProfilePage` | `profiles`, bucket `avatars` | — |
| `/temas` | `pages/ThemesAdminPage` + `lib/seasonal` | `seasonal_theme_approvals` | só admin |
| `/dados` | `taverna` — rolador de dados (d4 a d100) | `dice_rolls` | — |
| `/racha-conta` | `racha-conta` — divisão de despesas | `split_groups`, `split_group_members`, `split_expenses`, `split_expense_participants`, `split_payments`; RPC `create_split_group` | — |
| `/aniversarios` | `aniversarios` — próximos aniversários | `profiles.birthday` | — |
| `/musicas` | `musicas` — uma indicação musical por pessoa por dia | `music_picks`, `music_pick_likes`, `profiles` | oEmbed (preview do link); lembrete local diário (`scheduleMusicReminder`) |
| `/cultura` | `cultura` — filmes, séries, livros e álbuns do grupo; um post por pessoa por semana, com nota e comentário | `cultura_items`, `cultura_posts`, `cultura_interactions`, `profiles` | TMDB (`VITE_TMDB_KEY`), Google Books (`VITE_GOOGLE_BOOKS_KEY`); edge function `notify-cultura-post` (push) |
| `/agenda` | `agenda` — eventos, RSVP, links de calendário | `agenda_events`, `agenda_rsvps`, `profiles` | `api/og-agenda`, `api/og-agenda-image` (preview OG) |
| `/rpg`, `/rpg/mesa/:tableId`, `/rpg/ficha/:sheetId` | `rpg` — mesas, fichas, feed, rolagens, biblioteca | `rpg_tables`, `rpg_table_members`, `rpg_sheets`, `rpg_sheet_table_link`, `rpg_sessions`, `rpg_table_rolls`, `rpg_feed_posts`, `rpg_library_entries`, `rpg_notion_connections`, `rpg_notion_pages`; RPCs `increment_member_stats`, `increment_table_session_count` | Notion via `api/notion-proxy` |
| `/bolao`, `/bolao/:poolId` | `bolao` — bolão esportivo | `bolao_championships`, `bolao_matches`, `bolao_pools`, `bolao_pool_members`, `bolao_predictions`; RPCs `create_bolao_pool`, `score_match_predictions`, `reset_pool_scores`, `update_pool_*` | football-data (`api/fd-proxy`), TheSportsDB (`api/sportsdb-proxy`), Lance (`api/lance-proxy`), RapidAPI; lembretes locais 1h antes |
| `/arena`, `/arena/:duelId` | `arena` — "Briga de Bar", apostas hipotéticas | `arena_duels`, `arena_bets`, `arena_wallets` | Gemini |
| `/letreco` | `letreco` — Letreco, Letroso, Sudoku, Word500 (card "Jogos Diários") | `letreco_games`, `letreco_suggested_words`, `letroso_games`, `letroso_dictionary`, `sudoku_games`, `word500_games`; RPC `validate_letroso_word` | listas locais `.txt` (palavras, sudokus) |
| `/ranking`, `/ranking/:tableId` | `ranking` — tabelas de classificação com edição colaborativa e aprovação | `ranking_tables`, `ranking_categories`, `ranking_entries`, `ranking_entry_values`, `ranking_pending_edits`; RPCs `submit_ranking_value`, `approve_ranking_edit`, `reject_ranking_edit` | — |
| `/duelos`, `/duelos/:id` | `duelos` — comparação par a par (`pairwiseEngine`) | `duel_items`, `duel_comparisons`, `duel_rankings` | — |

Outras tabelas transversais: `profiles` (inclui `app_version`, `app_last_seen_at`, `hidden_features`, `theme`, `home_layout`), `push_tokens`.

Temas sazonais (`src/lib/seasonal/themes.ts`): `natal`, `republica`, `anonovo`, `pascoa`. Só ligam sozinhos se aprovados no banco e dentro da janela de datas.

## 5. Autenticação e papéis

- Login por e-mail e senha via Supabase Auth, em [AuthContext.tsx](../src/lib/AuthContext.tsx). Ele expõe `user`, `profile`, `signIn`, `signUp`, `signOut`, `updateProfile` e `changePassword`.
- Todas as rotas passam por `ProtectedRoute`, que mostra `LoginPage` quando não há usuário.
- Ao logar, o app grava `profiles.app_version` e `app_last_seen_at`. Formato: `web 0.0.x` no site, ou `<nativa> (<build>) · web <versão>` no APK.
- Papéis: só **admin** e **usuário comum**. Admin é uma lista fixa de e-mails em [src/lib/admin.ts](../src/lib/admin.ts) (`ADMIN_EMAILS`) e vale só no cliente.
- O acesso a `/temas` não tem link no menu: 7 toques no rodapé de versão do menu lateral, ou `?tema=<id>` na web.
- Autorização real vem do RLS e das RPCs do Supabase. **(não confirmado)** o que as policies permitem em cada tabela; o repositório não tem SQL de `agenda_*`, `cultura_*` e `music_*`.

## 6. Mobile (Capacitor)

- [capacitor.config.ts](../capacitor.config.ts): por padrão o APK carrega o site publicado (`server.url`, OTA). Variáveis só do build do APK: `CAP_BUNDLED=1` (APK autônomo com `dist/` embutido) e `CAP_SERVER_URL` (outro endereço, ex.: dev na rede local).
- App Links: `https://rolezinho-amigos.vercel.app/agenda?evento=…` abre no app (listener `appUrlOpen` em `App.tsx`).
- Push: `pushTokenService.registerPushToken` grava em `push_tokens`; a edge function `notify-cultura-post` envia via FCM.
- Notificações locais: `notificationService.ts` (lembrete de música e lembretes do bolão); controle de ids em `localStorage`.
- Se o código web chamar um plugin que o APK instalado não tem, essa parte quebra até instalar APK novo.

## 7. Deploy e build

- **Web:** `npm run deploy:web` roda `scripts/bump-version.js` (atualiza `package.json`, `android/app/build.gradle` e `.env.production`) e depois `vercel --prod`. Em seguida: commit e push na `main`.
- **Build:** `npm run build` = `tsc -b && vite build`. `vercel.json` reescreve `/agenda?evento=…` para `api/og-agenda` e o resto para `index.html`; `og-agenda-image` inclui `harfbuzzjs/hb.wasm`.
- **APK:** só para mudança nativa. `npm run build:android` (sem bump) ou `npm run deploy:android` (com bump); `build:android:bundled` gera APK sem OTA. O APK é assinado com a chave debug da máquina do usuário, e o SHA-256 dela está em `public/.well-known/assetlinks.json`. APK gerado em outra máquina não instala por cima.
- A versão do código web aparece no rodapé do menu (`VITE_APP_VERSION`).

## 8. Variáveis de ambiente (sem valores)

| Variável | Onde é usada | Obrigatória |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | cliente (`lib/supabase.ts`) e `api/notion-proxy` | sim, o app não sobe sem elas |
| `VITE_APP_VERSION` | cliente; gerada pelo `bump-version.js` em `.env.production` | sim em produção |
| `VITE_FOOTBALL_DATA_KEY` | cliente (APK) e `api/fd-proxy` | para o Bolão |
| `VITE_RAPIDAPI_KEY` | `bolao/footballApi.ts` | opcional |
| `VITE_GEMINI_KEY` | `arena/arenaService.ts` | para a Briga de Bar |
| `VITE_TMDB_KEY`, `VITE_GOOGLE_BOOKS_KEY` | `cultura/culturaApi.ts` | para a busca em Cultura (Google Books tem limite sem chave) |
| `VITE_PUBLIC_URL` | `agenda/calendarLinks.ts` | opcional, sobrescreve o domínio dos links |
| `CAP_BUNDLED`, `CAP_SERVER_URL` | build do APK | opcionais |
| `FCM_SERVICE_ACCOUNT_JSON`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | edge function `notify-cultura-post` (secrets do Supabase) | para push |

Arquivos locais: `.env.local` (dev) e `.env.production`.

## 9. Convenções e padrões repetidos

- Cada módulo é `<Nome>Page.tsx` + `<nome>Service.ts` (só o service fala com o Supabase) + `*Types.ts` e `*Logic.ts` quando há regra pura (ex.: `letrecoLogic`, `rankingLogic`, `pairwiseEngine`). Testes cobrem sobretudo essa lógica.
- Lógica sensível a permissões fica em RPC `SECURITY DEFINER` (ranking, bolão, racha-conta), não em policies de UPDATE.
- Perfis são lidos por join em `profiles` e FKs apontam para `profiles`; houve bug de FK nos leaderboards dos jogos (`game_leaderboard_fk_fix_migration.sql`).
- Jogos diários usam seed por data (fuso de São Paulo) e uma linha por usuário/dia.
- Chamadas a APIs de futebol: dev usa proxy do Vite, web em produção usa `/api/*-proxy`, APK usa fetch nativo com a chave.
- Estilo: Tailwind + `global.css` com variáveis CSS (`--bg-abyss` etc.); temas sazonais por `data-decor` e CSS em `styles/seasons`.
- Mensagens e UI em pt-BR; commits em português com prefixo (`feat:`, `docs:`).

## 10. Pendências conhecidas

- **Migrations SQL** rodadas à mão no Supabase e não confirmadas: bolão, Briga de Bar (`arena_migration*.sql`), ranking, `letreco_*`, `letroso_*` (+ `scripts/seed_letroso_dictionary.py`), `sudoku_difficulty_migration.sql` e `game_leaderboard_fk_fix_migration.sql`. O `word500_games` também é marcado como "MIGRATION PENDENTE" no próprio service.
- **GTM/GA4:** container `GTM-W9N74BPN`, GA4 `G-DLC61NDXP1` (import em `docs/gtm/gtm-rolezinho-import.json`). Falta testar pela Agenda, publicar o container e criar as dimensões `app_platform`, `provider` e `result`. A causa de "não funciona direito" segue sem diagnóstico. A coleta automática de e-mail/telefone está ligada no container (sugerido desligar).
- **RPG + Notion:** sync é manual e de mão única; falta sync automático, mapear páginas para NPCs/locais e ocultar páginas dos jogadores.
- **Temas sazonais:** nunca conferidos visualmente no app real.

## 11. Pontos frágeis e dívidas técnicas

1. **Chave do Gemini no cliente.** `VITE_GEMINI_KEY` vai embutida no bundle, então qualquer pessoa com o site consegue extraí-la e usá-la. O mesmo vale para `VITE_FOOTBALL_DATA_KEY` e `VITE_RAPIDAPI_KEY` no APK. Ideal: proxy em `api/`, como já existe para o football-data na web.
2. **`api/fd-proxy` aberto.** Repassa qualquer `path` ao football-data com a chave do servidor e sem checar o usuário. `api/sportsdb-proxy` também. Vale validar/limitar os caminhos aceitos.
3. **Token do Notion em texto puro** em `rpg_notion_connections`, protegido só por RLS.
4. **Admin só no cliente.** `ADMIN_EMAILS` em `admin.ts` não impõe nada por si; a proteção depende do RLS de `seasonal_theme_approvals`. O e-mail do admin está no código-fonte.
5. **Migrations manuais e incompletas.** Não há SQL no repositório para `agenda_*`, `cultura_*`, `music_picks`/`music_pick_likes`, `profiles` base e RPCs de racha-conta/RPG sem arquivo próprio; o banco real não é reproduzível só com o repo. O gatilho de `notify-cultura-post` (provavelmente um webhook do banco) também não está versionado **(não confirmado)**.
6. **Arquivos grandes:** `RachaContaPage` (~2250 linhas), `BolaoDetailPage` (~2200), `RpgSheetView` (~1700), `RpgTablePage` (~1300), `LetrecoPage` (~1150), `CulturaPage` (~1000). Candidatos a quebrar em componentes.
7. **Testes e lint:** a suíte (`npm test`, ~745 testes) cobre telas, serviços, lógica pura e `api/`, com um Supabase falso em `src/test/` (ver `CLAUDE.md`). Ainda faltam testes de interação mais profundos em: Cultura (nota e filtros), Músicas (navegação por dia), ações de admin do detalhe do Bolão (sincronizar, recalcular, modelo de pontuação), Racha Conta (editar gasto, criar/editar grupo, membros) e conexão/sincronização do Notion. O `eslint` do repo inteiro ainda falha em arquivos antigos por regras do React Compiler.
8. **Lixo na raiz:** `public__favicon.svg`, `dictionary_new.txt`, `tsconfig.tsbuildinfo` e `scripts/__pycache__` aparecem no repositório; `docs/` mistura imagens soltas e um `gemini-code-*.md`.
9. **`MusciasPage.tsx`** tem nome com erro de digitação (importado assim em `App.tsx`).
10. **Duplicação de listas de palavras:** `words.txt`, `cedilha_5.txt`, `dictionary.txt`, `words_letroso.txt` em `src/features/letreco/` vão no bundle, e o `dictionary_new.txt` na raiz parece sobra.
