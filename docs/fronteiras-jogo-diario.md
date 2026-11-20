# Fronteiras — Jogo diário de fronteiras (estilo Travle)

Quinta modalidade de **Jogos Diários**, ao lado de Letreco, Letroso, Sudoku e
Word500. Inspirado no travle.earth: todo dia o jogo sorteia **dois países** (origem
e destino) e o jogador tenta descobrir **a cadeia de países vizinhos** que liga um
ao outro, no menor número de palpites possível.

> Status: **implementado (nov/2026), em teste, só no modo desenvolvedor** (Perfil → "Modo desenvolvedor").
> `supabase/fronteiras_migration.sql` já foi rodada no Supabase (nov/2026); em produção desde a v0.0.86.
> As decisões da seção 9 foram tomadas (ver "Decisões tomadas" no fim); o resto do texto é o planejamento original.

---

## 1. Resumo

- Origem e destino iguais para todos no dia (mesmo esquema determinístico por data do Letreco/Sudoku).
- O jogador digita o nome de um país (autocomplete) a cada palpite.
- Cada palpite aparece no mapa e na lista com uma cor de **proximidade ao caminho mais curto**:
  - **verde**: o país está em algum caminho mais curto entre origem e destino;
  - **laranja/vermelho**: não está, e a cor indica a distância (em fronteiras) até o caminho mais curto mais próximo.
- Vence quando os palpites verdes **formam uma cadeia contínua** origem → destino.
- Limite de palpites = (países intermediários do caminho mais curto) + **5**. Estourou, perdeu.
- Uma partida por jogador por dia (`unique(user_id, game_date)`), igual aos outros jogos.
- Ranking diário + geral **separado por jogo**, como nos demais.

---

## 2. Dados

Toda a regra roda no cliente a partir de dados estáticos bundlados (sem backend gerando nada).

### 2.1 Grafo de fronteiras
- `src/features/letreco/travle/countries.json`: `{ iso: "BR", borders: ["AR","BO",...] }` para ~190 países.
- Fonte: dataset aberto (ex.: `mledoze/countries`, campo `borders`) conferido contra o mapa.
- **Ilhas e travessias marítimas** (OBSOLETO — ver decisão "só por terra" no fim): país sem fronteira terrestre (Japão, Reino Unido, Austrália...) ficaria isolado. Solução: lista manual de **ligações marítimas** curtas (UK–França, Espanha–Marrocos, Itália–Tunísia/Malta, Dinamarca–Suécia/Alemanha, Coreia–Japão etc.) versionada no mesmo JSON, marcada como `sea: true`.
- Ilhas remotas (Nova Zelândia, Madagascar, Islândia...) ficam **fora do pool de sorteio**, mas podem ser palpite (aparecem como "fora do caminho").

### 2.2 Geometria do mapa
- `world-atlas` (TopoJSON 110m, ~100 KB) + `topojson-client` + `d3-geo` (projeção Natural Earth), renderizado em **SVG**. Sem tiles, sem API, sem chave.
- Países destacados com a cor do palpite; origem e destino sempre visíveis; zoom/pan opcional (fase 4).
- Alternativa se pesar: SVG pré-gerado offline por script, só com `path` por ISO.

### 2.3 Nomes em pt-BR
- `Intl.DisplayNames(['pt-BR'], { type: 'region' })` gera o nome a partir do código ISO — sem tabela de tradução para manter.
- Autocomplete **sem acento e sem caixa** (reaproveitar o normalizador do Letreco). Aliases manuais para casos comuns (EUA, Tchéquia, Costa do Marfim...).

---

## 3. Sorteio do par do dia

Mesmo princípio dos outros jogos: **pool pré-gerado + seleção determinística pela data**.

- Script offline `scripts/generate_travle_pairs.mjs`: para cada par (A, B) do pool, BFS no grafo e guarda `{ from, to, shortest: n }`.
- Filtros de qualidade: **3 a 7 intermediários**; descartar vizinhos diretos e pares com muitos caminhos equivalentes (confuso); balancear continentes.
- Resultado versionado em `travle_pairs.json`, já embaralhado com `mulberry32`/`seededShuffle` (igual ao Letreco).
- `getTravleOfDay(date)` → `{ from, to, maxGuesses }`, usando `getDayNumber` (fuso `America/Sao_Paulo`).

---

## 4. Mecânica e cores (`travleLogic.ts`, lógica pura)

- `shortestPaths(from, to)`: BFS guardando predecessores; `onPath` = união dos países de todos os caminhos mínimos.
- `distanceToPath(country)`: BFS multi-fonte a partir de `onPath`.
- Cor: distância `0` → verde; `1` → laranja; `2` → vermelho-claro; `3+` → vermelho-escuro (ajustável).
- **Vitória**: os palpites (de qualquer cor) + origem/destino formam uma cadeia contínua de vizinhos. Qualquer rota vale; a cor só dá pista.
- Palpite repetido, país inexistente ou a própria origem/destino: rejeitar sem gastar tentativa.
- Dica opcional (custa pontos): revelar a primeira letra de um país do caminho.

---

## 5. Pontuação

- Por **eficiência**: `max(0, base − (palpites − ótimo) × penalidade)`, com bônus por acertar no mínimo.
- Derrota: 0 pontos; a partida conta como jogada.
- Ranking diário + geral acumulado, **separado por jogo**. Conferir antes o FK de `profiles` em `game_leaderboard_fk_fix_migration.sql` (migration ainda pendente).

---

## 6. Banco

`supabase/travle_migration.sql`, copiando `word500_migration.sql`:

```sql
create table if not exists public.travle_games (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  game_date   date not null,
  guesses     text[] not null default '{}',   -- códigos ISO, em ordem
  status      text not null default 'playing' check (status in ('playing','won','lost')),
  attempts    int  not null default 0,
  score       int  not null default 0,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, game_date)
);
```

- Índices em `game_date` e `user_id`; RLS: select para autenticados, insert/update só do próprio usuário (idêntico ao Word500).
- As cores **não** são persistidas: recalculadas no cliente a partir de `guesses` + par do dia.
- O gabarito está no cliente, como no Word500 — aceitável entre amigos; pontuação à prova de fraude exigiria RPC `SECURITY DEFINER`.
- Migration rodada em nov/2026.

---

## 7. Arquivos

Em `src/features/letreco/` (onde vivem os jogos diários), mesmo padrão dos outros:

| Arquivo | Papel |
|---|---|
| `TravleGame.tsx` | Tela: mapa SVG, campo com autocomplete, palpites coloridos, fim de jogo/compartilhar |
| `travleService.ts` | Único que fala com o Supabase |
| `travleTypes.ts` | Tipos |
| `travleLogic.ts` | BFS, cores, vitória, pontuação, par do dia — pura, sem rede |
| `travle/countries.json`, `travle_pairs.json` | Dados estáticos |
| `scripts/generate_travle_pairs.mjs` | Gera/valida o pool offline |
| `supabase/travle_migration.sql` | Tabela + RLS |

Integração em `LetrecoPage.tsx`: `"travle"` no `GameMode`, no seletor, no ranking geral e no render. O arquivo já é grande — **quebrar em componentes/hooks ao mexer** (regra 8 do CLAUDE.md).

---

## 8. Testes (regra 1 do CLAUDE.md)

- `travleLogic` (puro): caminhos mínimos em grafo pequeno fixo; cores por distância; vitória com e sem cadeia contínua; limite de palpites; repetido/inválido; ligação marítima; par do dia determinístico (mesma data → mesmo par; datas seguidas → pares diferentes).
- **Integridade dos dados**: grafo simétrico, todo ISO do mapa existe no JSON, todo par do pool tem caminho e `shortest` entre 3 e 7.
- `travleService`: com `mockDb` (`mockDb.writes`, `mockDb.errors.travle_games`).
- Tela: entra em `pages.smoke.test.tsx` + comportamento (palpite certo/errado, autocomplete, vitória, derrota, partida já concluída, erro).
- Sem relógio real (data injetada) e sem depender de ordem entre arquivos.

---

## 9. Decisões em aberto ❓

1. **Nome** (Travle é de terceiros — melhor um nome próprio, ex.: "Fronteiras", "Rolê Mundi").
2. **Escopo do mapa**: só mundo na v1, ou também por região (América do Sul, Europa)?
3. **Limite de palpites**: intermediários + 5 como no original, ou mais folgado?
4. **Fórmula de pontos** e peso frente aos outros jogos.
5. **Dica** com custo entra na v1?
6. **Compartilhar** resultado em emojis (🟩🟧🟥) — formato.
7. **Zoom/pan** na v1 (no celular, países pequenos ficam difíceis de tocar/ver).

---

## 10. Fases

1. Dados + `travleLogic.ts` + testes + script de pool (sem UI).
2. Migration + `travleService.ts` + testes.
3. `TravleGame.tsx` integrado ao `LetrecoPage` + smoke e testes de comportamento.
4. Ranking, compartilhar, dica, zoom.
5. Rodar a migration, `deploy:web` (OTA basta, sem mudança nativa), commit e push.


---

## 11. Decisões tomadas na implementação

- **Nome:** "Fronteiras" (aba "🗺️ Fronteiras" em Jogos Diários, liberada para todos desde nov/2026).
- **Acesso:** só com o **modo desenvolvedor** ligado (`src/lib/useDevMode.ts`, localStorage por aparelho, switch no Perfil via `DevModeCard`). É só visibilidade, não permissão: a tabela `fronteiras_games` aceita qualquer usuário autenticado.
- **Escopo:** mapa-múndi inteiro; zoom (botões, roda do mouse, pinça e arrastar) na v1; sem dica.
- **Limite:** intermediários + 5 palpites. **Pontos:** 100 no mínimo, −15 por palpite a mais (piso 10), derrota 0.
- **Dados:** `world.json` (170 países, paths já projetados, nomes pt-BR, fronteiras) e `pairs.json` (~470 pares, 3–7 intermediários, só pares cujo caminho mínimo existe por terra) são gerados por `node scripts/generate_fronteiras_data.mjs` a partir de `world-atlas` (devDependencies, fora do bundle). O mapa 110m não tem microestados nem ilhas pequenas, então eles não existem no jogo. Ligações marítimas e exceções ficam na constante `SEA` do script.
- **Carregamento:** `FronteirasGame` é `lazy` (~137 kB) e só baixa no modo desenvolvedor.
- **Ranking geral** entra no modal do Letreco (extraído para `LetrecoOverallModal.tsx`).
- **Fora da v1:** modo treino, dica, nome de país em outros idiomas.
- Para abrir o jogo a todos: remover a checagem `devMode` em `LetrecoPage.tsx` (aba e render) e tirar o "· beta".

- **Rota mais longa vale** (corrigido): terminar por um caminho que não é o mais curto conta como vitória; custa mais palpites e, portanto, menos pontos (−15 por palpite acima do mínimo). A tela tem um painel "Como funciona" com essas regras.

- **Só fronteira por terra** (decisão do usuário, nov/2026): removidas as ligações marítimas. Ilhas (Japão, Austrália, Cuba, Nova Zelândia, Madagascar, Islândia...) continuam no mapa e podem ser chutadas, mas ficam sem vizinhos (sempre "longe do caminho") e não entram no sorteio. O pool exige países com 2+ vizinhos por terra; antártida, Malvinas, Porto Rico, Nova Caledônia e terras austrais francesas foram retirados. França–Brasil/Suriname (Guiana Francesa) vale no jogo, mas nenhum dia depende só dela. A constante `SEA` do script deixou de existir.
