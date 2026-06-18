# Letreco — Palavras da comunidade + teclado nativo

Documento de design de **dois recursos** para o Letreco:

1. **Sugerir palavra ao errar** — quando o jogador digita uma palavra que não
   está no dicionário do jogo, aparece (por alguns segundos) um botão ao lado do
   palpite para **adicionar a palavra ao banco**, depois de validá-la numa
   **API pública** de dicionário. O botão só aparece para palpites que
   **parecem ser palavras de verdade**, nunca para sequências aleatórias de
   letras.
2. **Correção do teclado nativo** — o recurso atual de abrir o teclado do
   aparelho (input oculto + sentinela) não está funcionando de forma confiável
   no app Android. Aqui está o diagnóstico e o caminho para arrumar.

---

## Parte 1 — Sugerir palavra ao errar

### 1.1 Por que fazer isso

O dicionário do Letreco hoje é o arquivo **`src/features/letreco/words.txt`**
(~656 palavras de 5 letras), empacotado dentro do app via
`import wordsRaw from "./words.txt?raw"`. Esse mesmo arquivo é, ao mesmo tempo:

- o **pool de respostas** (de onde sai a palavra do dia), e
- o **dicionário de validação** (`isValidWord` → `WORD_SET`).

Como a lista é finita e curta, é comum o jogador digitar uma palavra
**legítima em português** e tomar _"Palavra não está na lista"_. Isso é
frustrante e faz o jogo parecer "burro". Crescer a lista na mão não escala.

A ideia é **deixar a própria turma ampliar o dicionário** de forma orgânica:
quando alguém esbarra numa palavra que o jogo não conhece, ela pode ser
sugerida e — se for real — passa a valer dali pra frente.

**Mas** há dois riscos que precisam ser contidos:

1. **Lixo no dicionário** — se qualquer palpite pudesse ser adicionado, o banco
   encheria de `AAAAA`, `QWERT`, `ZXCVB`. Por isso a sugestão passa por
   **dois filtros**: um heurístico no cliente (parece palavra?) e uma
   **validação real numa API de dicionário** antes de gravar.
2. **Poluir o botão** — se o botão "adicionar" aparecesse em **todo** erro,
   viraria ruído visual. Ele só deve aparecer quando o palpite for
   **plausível** como palavra (ver heurística abaixo).

### 1.2 Decisão de arquitetura importante (determinismo)

A palavra do dia é calculada **deterministicamente no cliente** a partir de
`words.txt` (seed + `seededShuffle` → `DAILY_ORDER`). Todos os jogadores
precisam chegar na **mesma** palavra no mesmo dia.

> ⚠️ **Palavras adicionadas pela comunidade NUNCA entram no pool de respostas.**
> Elas só ampliam o **dicionário de validação**. Se entrassem no sorteio, dois
> celulares com conjuntos diferentes de palavras aprovadas calculariam palavras
> do dia diferentes — quebraria o jogo e o ranking.

Resumo:

| Conjunto | Origem | Usado para |
|----------|--------|------------|
| Pool de respostas | **só `words.txt`** (estático, empacotado) | sortear a palavra do dia |
| Dicionário de validação | `words.txt` **+** palavras aprovadas do banco | aceitar/recusar palpites |

### 1.3 Por que precisa de uma tabela no banco (e não editar `words.txt`)

`words.txt` é empacotado no bundle em build-time. **Não dá** para escrever nele
em runtime no celular. Então as palavras sugeridas vivem numa **tabela do
Supabase** e são **mescladas em runtime** ao `WORD_SET` de validação.

Nova tabela (migration pendente, no padrão das outras features):

```sql
-- supabase/letreco_words_migration.sql
create table if not exists public.letreco_suggested_words (
  id          uuid primary key default gen_random_uuid(),
  word        text not null,                 -- normalizada: 5 letras A-Z, sem acento
  status      text not null default 'approved'
                check (status in ('approved', 'pending', 'rejected')),
  source      text,                          -- ex.: 'dicionario-aberto'
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (word)
);

alter table public.letreco_suggested_words enable row level security;

-- todos os autenticados leem (para montar o dicionário de validação)
create policy "letreco_words_read"
  on public.letreco_suggested_words for select
  to authenticated using (true);

-- qualquer autenticado pode sugerir; grava como 'approved' já validado pela API
create policy "letreco_words_insert"
  on public.letreco_suggested_words for insert
  to authenticated with check (added_by = auth.uid());
```

> Decisão a confirmar: gravar direto como `approved` (mais simples, confia na
> API) **ou** como `pending` exigindo curadoria. Recomendo `approved` direto,
> já que a API de dicionário é a fonte de verdade — sem fricção para a turma.

### 1.4 A heurística "parece uma palavra" (cliente)

Roda **antes** de mostrar o botão, 100% local, barata, em `letrecoLogic.ts`.
Objetivo: barrar sequências obviamente aleatórias sem precisar bater na API.
Não precisa ser perfeita — só filtrar o lixo gritante. Regras propostas para
uma palavra de 5 letras já normalizada (`A-Z`):

1. **Tem vogal suficiente** — pelo menos **1 vogal** (`AEIOU`). Idealmente
   barra "sem vogal nenhuma" (`BRTML`).
2. **Não é tudo igual nem quase** — no máximo **2 letras iguais** no total
   repetidas de forma exagerada; barra `AAAAA`, `AAAAB`.
3. **Sem 3 letras idênticas seguidas** — barra `LLLAA`.
4. **Sem clusters de consoantes impossíveis em PT** — no máximo **2 consoantes
   seguidas** no início e evitar trincas de consoantes raras (`BCDFG`). (Regra
   tolerante: existem "TR", "BR", "PL"... mas "BCDF" não.)
5. **Não está numa blocklist de teclado** — sequências tipo `QWERT`, `ASDFG`,
   `ZXCVB`.

A função fica algo como `isPlausibleWord(word: string): boolean` e é **testada
em isolamento** (mesmo arquivo de teste `src/test/letreco.test.ts`), com casos
positivos (`PRATO`, `LIVRO`, `CAIXA`) e negativos (`QWERT`, `BBBBB`, `XKZPT`).

> Ajuste fino: começar tolerante (deixa passar mais) e apertar com o tempo. É
> melhor o botão aparecer numa não-palavra ocasional (a API barra depois) do que
> sumir numa palavra real.

### 1.5 A validação real (API pública de dicionário)

Só roda **quando o usuário clica em "Adicionar palavra"** — não em todo palpite,
para não gerar tráfego à toa.

**API recomendada: Dicionário Aberto** (português, gratuita, sem chave):

```
GET https://api.dicionario-aberto.net/word/<palavra>
```

- Responde **`200` com JSON não-vazio** (array de acepções) se a palavra existe.
- Responde vazio / `404` se não existe.

Fluxo do clique:

1. `normalize(word)` → 5 letras maiúsculas sem acento.
2. `fetch` na API (com `try/catch` e timeout curto, ex.: `AbortController` 5s).
3. **Sucesso (existe):** `insert` em `letreco_suggested_words` (ignorar conflito
   de `unique(word)` — se já existe, tudo bem) → atualizar o `WORD_SET` de
   validação em memória → toast "Palavra adicionada! ✅". O palpite **não** é
   reprocessado automaticamente; o usuário digita de novo (a palavra agora vale).
4. **Não existe / erro de rede:** toast "Não encontrei essa palavra no
   dicionário 🤔" e o botão some. Nada é gravado.

> ⚠️ Acentos: a API pode indexar a forma acentuada (` "AÇAI" → "açaí"`). Como o
> jogo trabalha sem acento, considerar tentar a busca pela forma digitada e, se
> falhar, não insistir — ou usar uma 2ª fonte. Documentar como limitação
> conhecida. Alternativa de fallback: **Wiktionary REST** em pt
> (`https://pt.wiktionary.org/api/rest_v1/page/summary/<palavra>`).

**CORS / app Capacitor:** no navegador o `fetch` cross-origin pode esbarrar em
CORS. No app Android (WebView Capacitor) normalmente passa, mas convém **testar**
e, se preciso, rotear por uma **Edge Function** do Supabase (proxy) — assim
também centraliza a regra e evita expor o cliente a mudanças da API.

### 1.6 UX — o botão temporário

No `LetrecoPage.tsx`, quando `submitGuess` detecta palavra fora do dicionário:

- Hoje: `flashToast("Palavra não está na lista")` + shake.
- Novo: se `isPlausibleWord(word)` for `true`, além do toast, exibir um
  **botão inline ao lado/abaixo do palpite recusado** por **~6 segundos**:
  `+ Adicionar "PRATO" ao dicionário`.
- Estado novo: `suggestable: { word: string } | null` + um `setTimeout` que
  limpa após ~6s (guardar a ref do timer para `clearTimeout`, como o
  `toastTimer` já faz).
- Ao clicar: estado de carregando no botão → chama o serviço (§1.5) → toast de
  resultado → limpa `suggestable`.
- Enquanto valida, desabilitar o botão (evita clique duplo / inserção dupla).

Posição visual sugerida: logo **abaixo da grade**, acima do teclado, num chip
discreto com a cor dourada do tema (`var(--gold)`), aparecendo com `anim-fade`.

### 1.7 Mudanças de código previstas

| Arquivo | Mudança |
|---------|---------|
| `src/features/letreco/letrecoLogic.ts` | nova `isPlausibleWord()`; tornar a validação extensível: além do `WORD_SET` estático, um `extraWords: Set<string>` mesclável em runtime + `addRuntimeWord()`; `isValidWord` consulta os dois. |
| `src/features/letreco/letrecoService.ts` | `getApprovedWords()` (carrega na inicialização e mescla); `verifyWordInDictionary(word)` (chama a API pública); `suggestWord(userId, word)` (insert na tabela). |
| `src/features/letreco/LetrecoPage.tsx` | estado `suggestable` + timer; botão inline temporário; handler `handleSuggestWord`; carregar `getApprovedWords()` no boot e mesclar. |
| `supabase/letreco_words_migration.sql` | nova tabela `letreco_suggested_words` + RLS (§1.3). **Pendente** rodar no SQL Editor. |
| `src/test/letreco.test.ts` | testes de `isPlausibleWord` (positivos e negativos). |
| `docs/letreco-jogo-da-palavra.md` | referenciar este recurso na seção de ideias. |

### 1.8 Anti-abuso / arestas

- **Só autenticado** sugere (RLS já garante).
- **`unique(word)`** evita duplicatas; insert idempotente (ignora conflito).
- A palavra adicionada **só vale para validação**, nunca como resposta do dia
  (§1.2).
- Considerar um teto simples (ex.: ignorar silenciosamente se a palavra já está
  em `WORD_SET`/`extraWords` — nem mostra o botão nesse caso).
- Rede ausente → botão falha graciosamente, nada quebra.

---

## Parte 2 — Teclado nativo não está abrindo

### 2.1 O que existe hoje

Em `LetrecoPage.tsx` há um **input oculto** (`opacity-0`, `w-px h-px`,
`pointer-events-none`, `-z-10`) que, ao clicar numa célula, recebe `.focus()`
dentro do gesto de toque para tentar **subir o teclado nativo**. A digitação é
roteada por uma **sentinela** (`INPUT_SENTINEL = "."`) comparando o valor do
input.

### 2.2 Por que provavelmente não funciona no app

1. **`pointer-events-none` + `opacity-0` + `w-px h-px` + `-z-10`**: muitos
   WebViews (Android Capacitor) **se recusam a abrir o teclado** para um input
   considerado "não interativo/invisível". Um elemento praticamente sem área e
   sem eventos de ponteiro tende a ser ignorado pelo IME.
2. **`tabIndex={-1}` + `aria-hidden="true"`**: reforçam para o sistema que o
   campo "não deve" receber foco de teclado.
3. **`.focus()` programático fora de confiança do gesto**: em alguns WebViews só
   um input **realmente visível e tocado pelo usuário** levanta o IME;
   `focus()` chamado em handler nem sempre conta como "user gesture" suficiente.

### 2.3 Caminho recomendado (Capacitor)

O projeto usa **Capacitor 8** mas **não** tem o plugin de teclado instalado
(`@capacitor/keyboard` ausente do `package.json`). Duas frentes:

**A) Plugin nativo de teclado (mais robusto):**

```bash
npm i @capacitor/keyboard
npx cap sync android
```

Com ele dá para controlar o IME explicitamente:

```ts
import { Keyboard } from "@capacitor/keyboard";
// no handleCellClick, dentro do gesto:
await Keyboard.show();      // força o teclado a subir
```

e ajustar `resize`/`scroll` para a grade não ficar coberta.

**B) Ou repensar o input oculto para ser "focável de verdade":**

- Trocar `pointer-events-none`/`-z-10`/`w-px h-px` por um input com **área real**
  porém visualmente neutro (ex.: posicionado **atrás** da grade, tamanho da
  célula, `opacity: 0.01`, **sem** `pointer-events-none`, **sem**
  `aria-hidden`, **sem** `tabIndex=-1`).
- Garantir que o `.focus()` aconteça **direto no `onClick`/`onTouchEnd`** da
  célula (já acontece), mas com o input apto a receber foco.

### 2.4 Decisão pendente

Confirmar com o usuário se prefere:

- **(A)** instalar `@capacitor/keyboard` (mexe em build nativo, requer
  `cap sync` e novo APK), **ou**
- **(B)** só ajustar o CSS/atributos do input oculto (sem dependência nova,
  testável já no próximo build web/APK).

Recomendo começar por **(B)** (barato, sem dependência) e, se o IME ainda
resistir no Android, partir para **(A)**.

---

## Resumo da ordem de implementação sugerida

1. `isPlausibleWord` + testes (puro, sem rede).
2. Migration `letreco_suggested_words` + `getApprovedWords`/`suggestWord` +
   `verifyWordInDictionary` (serviço).
3. UI do botão temporário em `LetrecoPage`.
4. Ajuste do teclado nativo (B primeiro; A se necessário).

> Itens que dependem de decisão do usuário antes de codar: política
> `approved` vs `pending` (§1.3); API principal vs proxy via Edge Function
> (§1.5); estratégia do teclado A vs B (§2.4).
</content>
</invoke>
