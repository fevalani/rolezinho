# Ranking de Campeões — Tabelas de Classificação

Novo recurso: o usuário cria **tabelas de classificação genéricas** (ex.:
"Tênis", "Xadrez", "Truco da sexta") com um título, define **categorias de
pontuação com nome livre** (ex. Vitória, Empate, Derrota, Tempo Máximo,
Acertos) e insere pessoas na tabela, lançando os valores de cada categoria
por pessoa. O app calcula a pontuação total e ordena o ranking
automaticamente. Qualquer usuário pode editar valores de qualquer pessoa —
mas edições de quem não é o admin só valem depois que outro participante
aprovar.

---

## 1. Resumo

- Qualquer usuário autenticado pode **criar uma tabela** (título livre, ex.
  "Tênis").
- O **criador é o admin** daquela tabela.
- **Categorias de pontuação com nome livre**, definidas pelo admin (ex.:
  Vitória=3, Empate=1, Derrota=0, mas também algo como Acertos=1 ou Tempo
  Máximo=0.1) — não é mais fixo em Vitória/Empate/Derrota.
- Todo mundo autenticado pode **ver** todas as tabelas (mesmo padrão de
  Bolão/Arena — grupo fechado de amigos, sem necessidade de convite).
- Pontuação de cada pessoa: **soma, por categoria, de `valor × pontos_por_unidade_da_categoria`**.
- Ordenação do ranking: **pontos total (desc) → valor da 1ª categoria (desc)
  → valor da 2ª categoria (desc) → ...**, seguindo a ordem das categorias
  definida pelo admin (mantém o "pontos → vencedor → empate" do pedido
  original quando as categorias são as padrão Vitória/Empate/Derrota).
- **Edição colaborativa com aprovação:**
  - O **admin** edita qualquer valor e a mudança **vale na hora**.
  - **Qualquer outro usuário autenticado** também pode propor uma edição em
    qualquer valor de qualquer pessoa — mas ela fica **pendente** até que
    **outro usuário** (que não o proponente) clique em **"Aprovar"**. Só
    então o valor realmente muda na tabela.

---

## 2. Modelo de dados

### `ranking_tables`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| title | text | ex. "Tênis" |
| created_by | uuid | fk profiles — dono/admin da tabela |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `ranking_categories`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| table_id | uuid | fk ranking_tables, on delete cascade |
| name | text | ex. "Vitória", "Tempo Máximo", "Acertos" |
| points_per_unit | numeric | peso multiplicador (ex. 3, 1, 0, 0.1...) |
| display_order | int | ordem das colunas na tabela — também define a ordem de desempate |
| created_at | timestamptz | |

Ao criar uma tabela nova, semeamos 3 categorias padrão (Vitória=3,
Empate=1, Derrota=0) que o admin pode renomear, reordenar, apagar ou
adicionar outras — cobrindo o caso clássico de tabela esportiva sem
obrigar a digitar tudo do zero.

### `ranking_entries`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| table_id | uuid | fk ranking_tables, on delete cascade |
| name | text | nome da pessoa (texto livre, ver §6.1) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `ranking_entry_values`
| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| entry_id | uuid | fk ranking_entries, on delete cascade |
| category_id | uuid | fk ranking_categories, on delete cascade |
| value | numeric | default 0 — quantidade daquela categoria pra essa pessoa |
| updated_at | timestamptz | |

`unique(entry_id, category_id)`. `total_points` de uma pessoa **não é
coluna** — calculado no cliente: soma de `value × points_per_unit` de cada
`ranking_entry_values` dela (mesmo princípio de `calculateCustomPoints` do
Bolão).

### `ranking_pending_edits` (fluxo de aprovação, ver §4)
| coluna | tipo | obs |
|---|---|---|
| id | uuid | pk |
| entry_id | uuid | fk ranking_entries |
| category_id | uuid | fk ranking_categories |
| previous_value | numeric | snapshot do valor antes da proposta (pra exibir "de X para Y") |
| new_value | numeric | valor proposto |
| proposed_by | uuid | fk profiles |
| status | text | `pending` \| `approved` \| `rejected` |
| approved_by | uuid | fk profiles, nulo até resolver |
| created_at | timestamptz | |
| resolved_at | timestamptz | nulo até resolver |

### RLS
- `SELECT` em todas as tabelas acima: liberado para qualquer usuário
  autenticado (ranking é público dentro do grupo, mesmo padrão de
  `bolao_pools`/`arena_duels`).
- `ranking_tables` / `ranking_categories`: `INSERT`/`UPDATE`/`DELETE` só
  `created_by = auth.uid()` (config de pontuação é coisa de admin, sem
  fluxo de aprovação).
- `ranking_entries`: `INSERT`/`DELETE` (adicionar/remover pessoa) só admin.
  `UPDATE` do `name` também só admin (aprovação só cobre os *valores* das
  categorias, não a existência da pessoa).
- `ranking_entry_values`:
  - Se `auth.uid() = ranking_tables.created_by` → `UPDATE` direto liberado.
  - Senão, `UPDATE` **bloqueado** — todo mundo que não é admin muda valor
    só através de `ranking_pending_edits` (linha abaixo).
- `ranking_pending_edits`:
  - `INSERT`: qualquer autenticado, com `proposed_by = auth.uid()`.
  - `UPDATE` (aprovar/rejeitar): qualquer autenticado **onde
    `auth.uid() <> proposed_by`** (ninguém aprova a própria proposta), OU
    o admin da tabela (pode aprovar/rejeitar qualquer proposta a qualquer
    momento).
  - Ao aprovar, a função/trigger grava o `new_value` em
    `ranking_entry_values` e marca `status='approved'`.

Migration: `supabase/ranking_migration.sql` (a ser executado manualmente
pelo usuário no Supabase SQL Editor, como todas as outras features).

---

## 3. Pontuação e ordenação

```
total(pessoa) = Σ (value_da_categoria × points_per_unit_da_categoria)
```

Ordenação da tabela (`sortEntries` em `rankingLogic.ts`):
1. `total` desc
2. valor da categoria de `display_order` mais baixo, desc
3. valor da próxima categoria, desc
4. ... segue por todas as categorias, na ordem definida pelo admin
5. (empate total em tudo → ordem alfabética do nome, só estabilidade visual)

Com as categorias padrão (Vitória, Empate, Derrota, nessa ordem), o
resultado é exatamente o pedido original: pontos → vitórias → empates.

---

## 4. Fluxo de edição colaborativa com aprovação

1. Qualquer usuário autenticado abre a tabela e clica num valor pra editar
   (ex. "Vitórias" da pessoa X).
2. **Se quem edita é o admin:** salva direto em `ranking_entry_values`,
   efeito imediato — igual ao fluxo de hoje descrito no doc original.
3. **Se quem edita não é o admin:** em vez de salvar direto, cria uma
   linha em `ranking_pending_edits` (`status=pending`). A célula passa a
   mostrar um indicador (ex. badge "🕓 3 → 5, pendente") com um botão
   **"Aprovar"**.
4. **Qualquer outro usuário autenticado** (diferente de quem propôs) que
   abrir a tabela vê o botão "Aprovar" (e um "Rejeitar") naquela célula.
   Ao aprovar, o valor proposto passa a valer de verdade e o pendente é
   arquivado (`status=approved`).
5. Enquanto uma proposta está pendente para aquela célula, não dá pra
   abrir uma segunda proposta concorrente — precisa resolver (aprovar ou
   rejeitar) a que já existe primeiro.
6. O admin pode aprovar/rejeitar/sobrescrever qualquer proposta a
   qualquer momento (ele não precisa "esperar aprovação de ninguém",
   inclusive para destravar um impasse).

Isso é bem mais estruturado que o admin-only original, então deixei um
ponto em aberto no §6 sobre exatamente **quem conta como "outro
participante"** apto a aprovar.

---

## 5. Telas

### `RankingPage.tsx` (lista)
- Grid/lista de cards, um por tabela: título, nº de participantes, líder
  atual (nome + pontos).
- Botão "Nova tabela" → modal simples (só pede o título).

### `RankingDetailPage.tsx` (detalhe)
- Cabeçalho com título da tabela.
- Tabela ordenada: posição, nome, uma coluna por categoria (na ordem
  definida), Pontos total — pódio destacado (🥇🥈🥉) nas 3 primeiras
  posições, igual ao padrão visual do Bolão/Letreco.
- **Qualquer usuário autenticado** pode clicar num valor de categoria de
  qualquer pessoa para editar:
  - Se é admin → salva na hora.
  - Se não é admin → vira proposta pendente (ver §4); célula mostra
    badge + botão Aprovar/Rejeitar pros demais.
- **Se `user.id === table.created_by` (admin):**
  - Botão "Adicionar pessoa" (input de nome) / remover pessoa.
  - Seção "Configurar categorias de pontuação": lista de categorias com
    nome + pontos por unidade editáveis, botão "+ Nova categoria",
    reordenar (drag ou setas ↑↓), remover categoria.
  - Botão "Excluir tabela".
- Aba/seção "Pendências" (opcional, ver §6) listando todas as propostas
  pendentes da tabela, pra não depender de achar a célula certa.

---

## 6. Perguntas em aberto

1. **Quem conta como "outro participante" apto a aprovar uma edição?**
   Como o app não tem conceito de membership por tabela (item 4 já
   resolvido: qualquer autenticado vê tudo), a leitura mais simples é
   **qualquer usuário autenticado do app, diferente de quem propôs**,
   pode aprovar — não precisa ser uma das "pessoas" listadas na tabela
   (que podem nem ter conta, ver item 2). Confirma esse entendimento?

2. **Pessoas na tabela continuam sendo só nome digitado (texto livre), ou
   agora que existe edição/aprovação isso precisa virar conta vinculada?**
   Recomendo **manter texto livre** — quem *edita/aprova* é sempre um
   usuário autenticado do app (tem `proposed_by`/`approved_by` reais);
   a "pessoa" na linha da tabela é só um rótulo, pode ou não ser alguém
   com conta (ex. adversário de tênis sem o app).

3. **Rejeitar uma proposta pendente:** além do admin, o próprio
   proponente pode cancelar a própria proposta (ex. "editei errado")?
   Recomendo **sim, permitir auto-cancelamento** (não é "aprovação", é só
   desistir da proposta — não fere a regra de não se autoaprovar).

4. **Notificação quando existe pendência?** Dá pra usar o
   `notificationService` existente pra avisar (push) quando alguém propõe
   uma edição, mas isso adiciona complexidade. Recomendo **deixar de fora
   do MVP** — o badge "🕓 pendente" na própria tela já resolve, quem entra
   na tabela vê e aprova.

5. **Categorias:** confirmando o entendimento — o admin pode ter **quantas
   categorias quiser**, com qualquer nome e qualquer valor de pontos
   (inclusive 0 ou negativo, ex. penalizar "Faltas"), e a ordem que ele
   define é também a ordem de desempate. Isso cobre o "tempo máximo" e
   "acertos" que você mencionou?

6. **Nome do recurso/rota:** proponho **"Ranking de Campeões"**, ícone
   🏆, path `/ranking`. Pode trocar por algo mais específico se preferir
   (ex. "Tabelas", "Classificação").

Depois de fechar essas respostas, sigo com a implementação (migration →
lógica pura + testes → service → páginas → wiring).
