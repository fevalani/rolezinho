# Sudoku — Jogo diário dentro de "Jogos Diários"

Terceira modalidade da categoria (ex-"LetraFolia", agora **Jogos Diários**),
ao lado de Letreco e Letroso. Todo dia libera um **tabuleiro de Sudoku 9x9
igual para todos os jogadores que escolherem a mesma dificuldade**, cada um
resolve na sua velocidade e pontua por **tempo + erros**, multiplicado pela
dificuldade escolhida.

---

## 1. Resumo

- **Escolha de dificuldade no começo do dia** (Fácil / Médio / Difícil) —
  vale pro dia inteiro, só muda amanhã.
- **Um tabuleiro por dia por dificuldade**, determinístico (mesma seed pra
  todo mundo que jogar aquela dificuldade — sem backend gerando nada).
- **Sem limite de tempo nem de erros** — o jogador termina quando quiser,
  mas cada erro e cada minuto corrido custam pontos, antes de aplicar o
  multiplicador da dificuldade.
- **Uma partida por jogador por dia** (mesmo padrão de `unique(user_id,
  game_date)` das outras tabelas — a dificuldade fica gravada na própria
  linha, não multiplica partidas por dia).
- Ranking diário (quem resolveu hoje) + ranking geral (pontuação acumulada),
  **separado por jogo** (não combinado com Letreco/Letroso). O multiplicador
  existe justamente pra que jogadores de dificuldades diferentes possam
  aparecer no mesmo placar de forma razoável — ainda que o ranking em si
  esteja desligado por enquanto (fase de testes).

---

## 2. Geração do tabuleiro do dia

Gerar e verificar unicidade de solução em tempo real no cliente é caro e
desnecessário — seguimos o mesmo princípio já usado em Letreco/Letroso:
**pool local bundlado + seleção determinística pela data**.

### 2.1 Pools bundlados (um por dificuldade)
- Três arquivos, um por dificuldade: `sudoku_puzzles_facil.txt`,
  `sudoku_puzzles_medio.txt`, `sudoku_puzzles_dificil.txt` (todos em
  `src/features/letreco/`). Mesmo formato: uma linha por puzzle
  `<puzzle81>:<solucao81>` (dígitos 1-9, `0` = célula vazia no puzzle), 50
  puzzles cada, **pré-verificados com solução única** por um script offline
  (não roda no cliente nem no Supabase).
- Script gerador: `scripts/generate_sudoku_puzzles.py <clues> <seed>
  [pool_size]` — gera um grid válido completo por backtracking randômico,
  depois remove células testando unicidade (conta soluções até achar 2, para
  cedo) até atingir a contagem alvo de pistas. Roda uma vez por dificuldade,
  offline; o resultado fica versionado nos arquivos `.txt`.

### 2.2 Seleção + variação por dia
Mesmo esquema de `mulberry32` + `seededShuffle` do Letreco/Letroso, aplicado
**dentro do pool da dificuldade escolhida**:
- `getDayNumber(date)` → dia absoluto (fuso `America/Sao_Paulo`).
- `SUDOKU_DAILY_ORDERS[dificuldade] = seededShuffle(pool.length, seed)` →
  escolhe o puzzle base do dia sem repetir antes de esgotar aquele pool
  (cada dificuldade tem sua própria seed/ordem, independentes entre si).
- **Scramble determinístico** (seed do dia combinada com a seed da
  dificuldade) aplica transformações que preservam validade e unicidade de
  um Sudoku (grupo de simetrias clássico):
  - permutar os 3 "bands" (grupos de 3 linhas) entre si;
  - permutar as 3 linhas dentro de cada band;
  - permutar as 3 "stacks" (grupos de 3 colunas) entre si;
  - permutar as 3 colunas dentro de cada stack;
  - opcionalmente transpor o tabuleiro (linha ↔ coluna);
  - reetiquetar os dígitos 1-9 com uma permutação aleatória.

  Isso multiplica a variedade efetiva de cada pool (50 puzzles) por um fator
  gigantesco, sem precisar resolver/validar nada em runtime — todas as
  operações são bijeções que mantêm a solução única.
- Resultado: `getSudokuOfDay(dificuldade, date)` retorna `{ puzzle,
  solution }` (strings de 81 chars) **iguais para qualquer jogador que
  escolher a mesma dificuldade, no mesmo dia**.

---

## 3. Mecânica de jogo

- Células com pista (`puzzle[i] !== '0'`) vêm travadas, não editáveis.
- Jogador seleciona uma célula vazia e digita um número (1-9) ou apaga.
- **Verificação imediata contra o gabarito** (não contra as regras do
  Sudoku): ao preencher uma célula,
  - se bate com `solution[i]` → fica marcada como certa;
  - se não bate → pisca vermelho, **conta como 1 erro** e a célula volta a
    ficar vazia (jogador tenta de novo). Sem limite de erros.
- Progresso é salvo a cada preenchimento (autosave), então dá pra fechar o
  app e continuar depois — status fica `playing` até completar.
- **Vitória:** todas as 81 células preenchidas corretamente. Não existe
  estado de derrota/tempo esgotado.
- Uma vez preenchida corretamente, a célula fica travada (não dá pra
  reabrir e digitar de novo) — evita contar erro num número que já era
  certo.

### 3.1 Modo Rascunho (lápis)
- Botão ✏️ acima do teclado numérico alterna entre modo **normal** e
  **rascunho**.
- No modo rascunho, tocar um número numa célula vazia **não** verifica
  contra o gabarito — só liga/desliga aquele dígito como candidato
  anotado na célula (mini-grade 3x3 de números pequenos dentro da
  célula). Não conta erro, não preenche a célula.
- Ao preencher a célula corretamente (fora do modo rascunho), as
  anotações daquela célula são limpas automaticamente.
- Anotações são **só de sessão** (estado local do componente) — não são
  salvas no Supabase nem sobrevivem a um reload. Se isso incomodar,
  próximo passo natural é persistir num campo `notes` na tabela.

### 3.2 Escolha de dificuldade
- Quando o jogador abre o Sudoku e ainda não jogou hoje, vê uma tela de
  escolha (`DifficultyPicker` em `SudokuGame.tsx`) com as 3 opções, cada
  uma mostrando o nº de pistas e o multiplicador de pontuação.
- Ao escolher, a partida é criada e salva imediatamente com aquela
  dificuldade (`difficulty` na tabela) — **fica travada pro resto do dia**,
  só muda na virada pro dia seguinte (mesmo princípio de "uma partida por
  dia" das outras tabelas).
- Se o jogador já tem uma partida hoje (em andamento ou concluída), pula
  direto pro tabuleiro/resultado daquela dificuldade — a tela de escolha só
  aparece quando ainda não existe partida do dia.

---

## 4. Pontuação

```
BASE_SCORE = 1000
TIME_PENALTY_PER_MINUTE = 20   // -20 pts por minuto corrido (proporcional, não arredondado pra cima)
MISTAKE_PENALTY = 40           // -40 pts por erro
MIN_SCORE = 50                 // quem termina nunca fica com 0
```

```
raw   = BASE_SCORE - (elapsedSeconds / 60) * TIME_PENALTY_PER_MINUTE - mistakes * MISTAKE_PENALTY
score = max(MIN_SCORE, round(raw * multiplicador_da_dificuldade))
```

Só é calculado (e salvo) no momento em que o tabuleiro é completado. Valores
ficam concentrados num só bloco de constantes em `sudokuLogic.ts` — fácil de
recalibrar depois de ver os números reais da turma jogando (igual
`SCORE_BY_ATTEMPT` do Letreco).

### 4.1 Multiplicador por dificuldade

| Dificuldade | Pistas | Multiplicador | Raciocínio |
|---|---|---|---|
| Fácil | 44 | ×0.7 | Tabuleiro mais preenchido, tende a ser mais rápido e com menos erro — pontuação de base já seria mais alta, então o multiplicador puxa pra baixo pra não distorcer o placar. |
| Médio | 34 | ×1.0 | Referência (dificuldade "padrão" — era a única antes desta feature). |
| Difícil | 28 | ×1.35 | Tabuleiro mais vazio, naturalmente demora mais e induz mais erro (penalizando o `raw` sozinho) — o multiplicador compensa esse custo extra e ainda dá um empurrão a mais pra recompensar quem arrisca a dificuldade maior. |

Valores em `SUDOKU_DIFFICULTIES` (`sudokuLogic.ts`) — fácil de ajustar depois
que o ranking for ligado de verdade e der pra comparar pontuações reais
entre dificuldades.

---

## 5. Dados e ranking

Tabela `sudoku_games` (schema igual ao padrão de `letroso_games`):

| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| user_id | uuid | fk auth.users |
| game_date | date | fuso America/Sao_Paulo |
| difficulty | text | `facil` \| `medio` \| `dificil`, travada ao criar a partida |
| board | text | 81 chars, estado atual (autosave) |
| mistakes | int | contador de erros |
| elapsed_seconds | int | calculado a partir de `started_at` no fim |
| status | text | `playing` \| `won` |
| score | int | só preenchido quando `won` |
| started_at | timestamptz | marcado na primeira interação |
| finished_at | timestamptz | marcado ao vencer |

- `unique(user_id, game_date)` — uma partida por dia, upsert em cada
  autosave.
- RLS: leitura liberada pra autenticados (ranking), escrita só do próprio
  dono — mesmo padrão de `letreco_games`/`letroso_games`.
- **Ranking diário:** quem já tem `status = 'won'` hoje, ordenado por score
  desc, tempo asc, erros asc.
- **Ranking geral:** soma de `score` por usuário em todos os dias
  concluídos — **próprio do Sudoku, não combinado** com Letreco/Letroso
  (decisão: manter ranking por jogo, cada um com seu placar geral). Mistura
  dificuldades diferentes no mesmo placar de propósito — é pra isso que
  existe o multiplicador (§4.1).
- Migration: `supabase/sudoku_migration.sql` (já inclui a coluna
  `difficulty`, para instalações novas). Quem já rodou a versão anterior
  (sem a coluna) precisa rodar também `supabase/sudoku_difficulty_migration.sql`
  (só o `ALTER TABLE ADD COLUMN`).

---

## 6. Ideias não implementadas (futuro)

- Dificuldade variável por dia da semana (ex.: fim de semana = mais difícil).
- Bônus de "sem erros" (zero mistakes) na pontuação.
- Persistir as anotações do modo rascunho (hoje é só estado local, some no reload — ver §3.1).
- Destaque de conflitos em tempo real (linha/coluna/box) — hoje só valida
  contra o gabarito ao preencher, não contra as regras do Sudoku em si.
