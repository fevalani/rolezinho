# Letreco — Jogo da palavra do dia

Um jogo de adivinhação de palavras no estilo **Termo / Letreco / Wordle**,
integrado ao Rolezinho como mais um feature da turma. Todo dia uma nova palavra
secreta é liberada e fica igual para todos os jogadores. Cada um tem **5
tentativas** para acertar e pontua mais quanto **menos tentativas** usar.

---

## 1. Resumo (a ideia central)

- **Uma palavra por dia**, sorteada (pseudo-aleatória) e **igual para todos** —
  assim dá para comparar desempenho no ranking.
- **5 chances** por jogador por dia.
- A cada palpite o jogo dá feedback letra a letra (verde / amarelo / cinza).
- Quanto **menos tentativas** o jogador usar para acertar, **mais pontos** ganha.
- Cada jogador só joga **uma vez por dia** naquela palavra (não dá pra recomeçar).
- Ranking/placar da turma para fomentar a competição diária.

---

## 2. Regras detalhadas

### 2.1 A palavra do dia
- Palavra de **5 letras** (padrão do gênero; configurável no futuro).
- Em **português**, sem acentos na digitação (acento é normalizado/ignorado na
  comparação, como no Termo).
- **A mesma palavra para todos os jogadores naquele dia.**
- A palavra muda **à meia-noite** (fuso de Brasília, `America/Sao_Paulo`).
- A palavra do dia não pode se repetir antes de esgotar a lista (controle de
  histórico de palavras já usadas).

### 2.2 Tentativas e feedback
- Cada jogador tem **5 tentativas** por dia.
- Só são aceitas palavras válidas (existentes na lista de palavras permitidas).
  Palpite inválido **não** consome tentativa.
- Após cada palpite, cada letra recebe um status:
  | Cor | Significado |
  |-----|-------------|
  | 🟩 Verde | Letra certa na posição certa |
  | 🟨 Amarelo | Letra existe na palavra, mas em outra posição |
  | ⬛ Cinza | Letra não existe na palavra |
- Tratamento de **letras repetidas**: o número de amarelos/verdes de uma mesma
  letra respeita a quantidade real dela na palavra secreta (regra clássica do
  Wordle — não pinta amarelo a mais).
- O teclado virtual reflete o melhor status já descoberto de cada letra.

### 2.3 Fim de jogo
- **Vitória:** acertou a palavra dentro das 5 tentativas.
- **Derrota:** usou as 5 tentativas sem acertar → revela a palavra do dia.
- Depois de terminar (vitória ou derrota), o jogador vê o **resultado** e o
  **placar do dia**, mas não pode jogar de novo até o dia seguinte.

### 2.4 Pontuação
Pontua mais quem acerta com menos tentativas:

| Tentativa do acerto | Pontos |
|---------------------|--------|
| 1ª (de primeira) | 100 |
| 2ª | 70 |
| 3ª | 50 |
| 4ª | 30 |
| 5ª | 15 |
| Não acertou | 0 |

> Valores são uma sugestão inicial — ficam num único lugar no código
> (`SCORE_BY_ATTEMPT`) para ajuste fácil.

### 2.5 Regras extras sugeridas (ideias a mais)
Coloquei aqui o que pesquisei do gênero e que pode enriquecer o feature:

- **Streak (ofensiva):** dias seguidos jogando/acertando. Quebra se faltar um dia.
  Pode dar bônus de pontos (ex.: +5 por dia de streak).
- **Bônus de velocidade (opcional):** pequeno bônus para quem termina cedo no dia
  (primeiros a acertar). Desligado por padrão para não punir quem joga à noite.
- **Compartilhamento sem spoiler:** gerar o resultado em emojis
  (🟩🟨⬛ por linha) para colar no chat/WhatsApp sem revelar a palavra — marca
  registrada do Termo/Wordle.
- **Modo difícil (opcional):** letras já reveladas (verdes/amarelas) são
  obrigatórias nos palpites seguintes.
- **Estatísticas pessoais:** % de vitórias, distribuição de acertos por tentativa,
  maior streak, total de pontos.
- **Ranking semanal e mensal**, além do diário, somando pontos.
- **Anti-trapaça:** validação e cálculo do resultado no backend; o cliente nunca
  recebe a palavra do dia antes de terminar (ver seção 5).
- **Notificação diária** (já existe `@capacitor/local-notifications` no projeto):
  lembrete de que a palavra do dia saiu.
- **Empate no ranking:** desempate por menor número de tentativas e, depois, por
  horário do acerto.

---

## 3. Onde encaixa no projeto

O app já organiza cada recurso em `src/features/<feature>/`. Seguindo o padrão
(ex.: `bolao`, `arena`, `cultura`), o novo feature fica em:

```
src/features/letreco/
  LetrecoPage.tsx        # tela principal do jogo (grade + teclado)
  letrecoService.ts      # acesso ao Supabase (palpites, resultados, ranking)
  letrecoLogic.ts        # regras puras: cálculo de cores, pontuação (testável)
  letrecoTypes.ts        # tipos TS do feature
```

- Rota nova em `src/App.tsx` (ex.: `/letreco`) e card de entrada na
  `src/pages/HomePage.tsx`, respeitando `hidden_features` do `Profile`.
- Migration em `supabase/letreco_migration.sql` (mesmo padrão das outras).
- Estilos via Tailwind + `src/styles/global.css` (animações de flip das letras).

---

## 4. Modelo de dados (Supabase)

Seguindo o estilo das migrations existentes (`arena_migration.sql`,
`bolao_migration.sql`): tabelas em `public`, RLS ligado, índices e FKs para
`profiles`.

```sql
-- Palavra liberada por dia (igual para todos)
CREATE TABLE public.letreco_daily (
  game_date   DATE PRIMARY KEY,             -- "2026-06-17"
  word        TEXT NOT NULL,                -- palavra secreta (5 letras, normalizada)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partida de um jogador num dia (uma por jogador por dia)
CREATE TABLE public.letreco_games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_date   DATE NOT NULL REFERENCES public.letreco_daily(game_date),
  guesses     TEXT[] NOT NULL DEFAULT '{}', -- palpites na ordem
  status      TEXT NOT NULL DEFAULT 'playing'
              CHECK (status IN ('playing', 'won', 'lost')),
  attempts    INTEGER NOT NULL DEFAULT 0,   -- nº de palpites usados
  score       INTEGER NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_date)               -- garante "uma vez por dia"
);

CREATE INDEX idx_letreco_games_date  ON public.letreco_games(game_date);
CREATE INDEX idx_letreco_games_user  ON public.letreco_games(user_id);
```

**RLS (resumo):**
- `letreco_daily`: o cliente **não** lê a coluna `word` enquanto joga (palavra só
  pelo backend). Na prática, validação e correção de palpites passam por uma
  **função/Edge Function** (ou RPC) que tem acesso à palavra, e o cliente só
  recebe as cores. Alternativa mais simples (menos segura): liberar leitura só
  da palavra do dia anterior.
- `letreco_games`: cada usuário só insere/atualiza a **própria** partida; todos
  podem **ler** as partidas do dia para montar o ranking (sem expor a palavra
  antes de terminar).

---

## 5. Como o código vai funcionar (visão superficial)

### 5.1 Lógica pura — `letrecoLogic.ts`
Funções sem dependência de rede, fáceis de testar (o projeto já tem testes em
`src/test/`):

- `normalize(word)`: maiúsculas + remove acentos (`"AÇÃO" → "ACAO"`).
- `scoreGuess(guess, answer)`: retorna um array de 5 status
  (`"correct" | "present" | "absent"`), já tratando letras repetidas em duas
  passadas (primeiro marca os verdes, depois distribui amarelos pelo que sobrou).
- `pointsFor(attempt)`: tabela `SCORE_BY_ATTEMPT` → pontos pelo nº da tentativa.
- `isValidWord(word, dictionary)`: valida contra a lista de palavras.

### 5.2 Service — `letrecoService.ts`
Espelha os outros services (`import { supabase } from "@/lib/supabase"`):

- `getTodayGame(userId)`: busca/cria a partida do dia do jogador.
- `submitGuess(userId, guess)`: **caminho seguro** — envia o palpite ao backend
  (RPC/Edge Function), que compara com a palavra do dia, devolve as cores,
  atualiza `guesses/attempts/status/score` e persiste. O cliente nunca vê a
  palavra antes de terminar.
- `getDailyLeaderboard(date)`: ranking do dia (pontos, depois tentativas, depois
  horário).
- `getUserStats(userId)`: estatísticas pessoais (vitórias, streak, distribuição).

### 5.3 Tela — `LetrecoPage.tsx`
Componente React (mesma stack: React 19 + Tailwind):

- **Grade 5×5** (5 tentativas × 5 letras) com animação de *flip* ao revelar.
- **Teclado virtual** que colore as teclas conforme o que já foi descoberto;
  também aceita teclado físico no web.
- Estado local da linha sendo digitada; ao dar Enter, valida e chama
  `submitGuess`, anima o resultado e avança a linha.
- Ao terminar: tela de resultado com pontos, botão de **compartilhar em emojis**
  e o **placar do dia** da turma.
- Bloqueia novas jogadas se `status !== 'playing'` (já jogou hoje).

### 5.4 Geração da palavra do dia
- Um job diário (cron do Supabase, ou a primeira requisição do dia que insere se
  não existir) escolhe a próxima palavra de uma lista curada, evitando repetição
  via histórico, e grava em `letreco_daily`.
- A lista de palavras válidas (dicionário) pode ficar num arquivo estático
  empacotado no app para validar palpites sem ida ao servidor.

### 5.5 Fuso e "virada do dia"
- `game_date` sempre calculado no fuso `America/Sao_Paulo` para todos verem a
  mesma palavra no mesmo dia, independente do dispositivo.

---

## 6. Pendências antes de implementar

- [ ] Definir a **lista de palavras** (secretas) e o **dicionário** de validação.
- [ ] Decidir entre **RPC/Edge Function** (mais seguro) x leitura direta da
      palavra (mais simples) — recomendado o caminho seguro.
- [ ] Confirmar a **tabela de pontos** (`SCORE_BY_ATTEMPT`).
- [ ] Rodar a **migration** `supabase/letreco_migration.sql` no Supabase.
- [ ] Adicionar rota em `App.tsx`, card na `HomePage.tsx` e suporte a
      `hidden_features`.
- [ ] (Opcional) Notificação diária via `@capacitor/local-notifications`.
```
