# Bolão — Carregamento instantâneo com cache local + revalidação

## 1. O que foi pedido

1. **Carregamento lento ao entrar em um bolão** — hoje, ao abrir um bolão
   específico, a aba de palpites demora para aparecer porque tudo espera a rede.
2. **Dados sempre locais** — o app deve sempre ter os dados em cache local e
   renderizar a tela imediatamente, sem tela de loading bloqueante.
3. **Atualizar só quando necessário** — o front só deve re-renderizar quando
   houver de fato uma mudança nos dados (não a cada fetch).
4. **Atualização manual por scroll** — o usuário puxa/rola para baixo até um
   ponto que dispara uma requisição ao banco para atualizar os dados.
5. **Front sempre montado** — mesmo durante a atualização, a UI continua
   montada (já com dados do cache), apenas aguardando o novo conteúdo chegar.

Resumindo: trocar o modelo atual de **"bloqueia até a rede responder"** por
**stale-while-revalidate** (mostra o cache na hora → revalida em segundo plano →
atualiza a tela só se algo mudou), com refresh manual via scroll e realtime
mantido.

---

## 2. Diagnóstico do código atual

Arquivo: `src/features/bolao/BolaoDetailPage.tsx`

- `loadAll()` (≈ linha 626) dispara **6 requisições** em `Promise.all`:
  `fetchPoolById`, `fetchMatchesForPool`, `fetchPoolMembers`,
  `fetchLeaderboard`, `fetchRoundLeaderboards`, `fetchAllUserPredictions`.
- No início ele faz `setLoading(true)` e, enquanto não resolve **tudo**, a
  tela renderiza apenas um spinner em tela cheia (≈ linha 855):
  ```tsx
  if (loading) { return <div ...><div className="spinner" /></div>; }
  ```
  → **Esse é o gargalo percebido:** nada aparece até as 6 chamadas voltarem.
- `loadAll` é chamado:
  - no mount (`useEffect` em ≈ linha 681),
  - pelo realtime `subscribeBolao` (≈ linha 686) — que já existe e re-busca tudo,
  - após salvar palpite / ações de admin.
- Não há **nenhum cache**: toda entrada na página recomeça do zero pela rede.
- `subscribeBolao` (em `bolaoService.ts` ≈ linha 1149) já escuta mudanças em
  `bolao_predictions` e `bolao_matches` e chama `onRefresh` → bom, mas hoje o
  refresh recarrega tudo e passa por `setLoading`.

### Conclusão
O problema não é a quantidade de dados em si, é a **estratégia**: loading
bloqueante + zero cache + re-fetch total. Precisamos cachear o "snapshot" do
bolão e renderizar dele instantaneamente.

---

## 3. Estratégia geral (stale-while-revalidate)

```
Entrar no bolão
   │
   ├─► 1. Ler cache local (localStorage) → se existe, renderiza JÁ (sem spinner)
   │
   ├─► 2. Em paralelo, revalidar contra o banco (fetch das 6 fontes)
   │
   ├─► 3. Comparar resultado novo x cache (hash/assinatura)
   │        ├─ igual  → não faz nada (sem re-render)
   │        └─ mudou  → atualiza estado + reescreve cache
   │
   ├─► Realtime (já existe): mudança no banco → revalida (passo 2-3)
   │
   └─► Scroll-to-refresh: sentinela no fim da lista dispara revalidação manual
```

Primeira visita de todas (cache vazio): aí sim mostramos um *skeleton* leve
(não o spinner de tela cheia) enquanto a primeira carga chega.

---

## 4. Como atacar cada ponto do código

### 4.1 Nova camada de cache local — `src/lib/localCache.ts` (novo arquivo)

Pequeno wrapper sobre `localStorage` (padrão já usado em
`src/lib/notificationService.ts`). Para os volumes do bolão, `localStorage`
basta; se o payload crescer muito, migrar para IndexedDB depois.

```ts
const PREFIX = "rolezinho:cache:";
const SCHEMA_VERSION = 1; // bump quando o formato do snapshot mudar

export interface CacheEnvelope<T> {
  v: number;        // SCHEMA_VERSION
  savedAt: number;  // Date.now()
  data: T;
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (env.v !== SCHEMA_VERSION) return null; // invalida formato antigo
    return env.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = { v: SCHEMA_VERSION, savedAt: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    /* quota cheia / modo privado: ignora silenciosamente */
  }
}

export function clearCache(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}
```

> ⚠️ `Map` não serializa em JSON. `fetchAllUserPredictions` retorna
> `Map<string, UserPredictionDetail[]>` → no snapshot, converter para
> `Record<string, UserPredictionDetail[]>` (ou `Array.from(map)`) antes de
> salvar e reconstruir o `Map` ao ler. Ver 4.2.

---

### 4.2 Snapshot consolidado — em `bolaoService.ts`

Criar **um único** tipo e **uma única** função que devolve tudo o que a página
precisa, para o cache ter uma chave/objeto só.

```ts
export interface BolaoSnapshot {
  pool: BolaoPool | null;
  rounds: RoundGroup[];
  members: BolaoPoolMember[];
  leaderboard: LeaderboardEntry[];
  roundLeaderboards: RoundLeaderboard[];
  // Map não serializa → guardar como pares e reconstruir no consumidor
  userPredictions: [string, UserPredictionDetail[]][];
}

export async function fetchBolaoSnapshot(
  poolId: string,
  userId: string,
): Promise<BolaoSnapshot> {
  const [pool, rounds, members, leaderboard, roundLeaderboards, preds] =
    await Promise.all([
      fetchPoolById(poolId, userId),
      fetchMatchesForPool(poolId, userId),
      fetchPoolMembers(poolId),
      fetchLeaderboard(poolId),
      fetchRoundLeaderboards(poolId),
      fetchAllUserPredictions(poolId),
    ]);
  return {
    pool, rounds, members, leaderboard, roundLeaderboards,
    userPredictions: Array.from(preds.entries()),
  };
}
```

> Mantém as 6 funções existentes intactas — só agrega. Zero risco de regressão
> nas outras telas.

**Otimização opcional (fase 2):** trocar as 6 queries por **1 RPC** no Supabase
(`get_bolao_snapshot(p_pool_id, p_user_id)`) que devolve um JSON único. Reduz
round-trips de 6→1 e melhora a revalidação. Fica como melhoria posterior; o
cache local já resolve a lentidão percebida sem isso.

---

### 4.3 Detecção de mudança (evitar re-render desnecessário)

Precisamos comparar "snapshot novo" x "snapshot atual" de forma barata.

- **Abordagem simples e suficiente:** assinatura via `JSON.stringify` do
  snapshot (ou de um subconjunto relevante) e comparar strings.
- **Abordagem mais barata:** computar uma assinatura só dos campos voláteis —
  ex.: `updated_at` de cada match + `points_earned`/placar dos palpites +
  `total_points` do leaderboard. Concatena e compara.

```ts
export function snapshotSignature(s: BolaoSnapshot): string {
  const matches = s.rounds.flatMap((r) => r.matches)
    .map((m) => `${m.id}:${m.status}:${m.score_home}:${m.score_away}:${m.updated_at}`);
  const board = s.leaderboard.map((e) => `${e.user_id}:${e.total_points}`);
  const preds = s.userPredictions.flatMap(([u, ps]) =>
    ps.map((p) => `${u}:${p.match_id}:${p.pred_home}-${p.pred_away}:${p.points_earned}`));
  return [
    s.pool?.scoring_model, s.pool?.variation_mode,
    ...matches, ...board, ...preds,
  ].join("|");
}
```

No componente: só faz `setState` quando `newSig !== currentSig`. Assim o
realtime e o scroll-refresh podem revalidar à vontade sem piscar a tela.

---

### 4.4 Hook `useBolaoSnapshot` — `src/features/bolao/useBolaoSnapshot.ts` (novo)

Encapsula leitura de cache + revalidação + detecção de mudança. Mantém a
`BolaoDetailPage` limpa.

```ts
export function useBolaoSnapshot(poolId?: string, userId?: string) {
  const [snapshot, setSnapshot] = useState<BolaoSnapshot | null>(null);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const sigRef = useRef<string>("");

  // 1) Hidratação síncrona do cache (instantâneo, sem spinner)
  useEffect(() => {
    if (!poolId) return;
    const cached = readCache<BolaoSnapshot>(`bolao:${poolId}:${userId}`);
    if (cached) {
      setSnapshot(cached);
      sigRef.current = snapshotSignature(cached);
    }
    setHydratedFromCache(true);
  }, [poolId, userId]);

  // 2) Revalidação (chamada no mount, no realtime e no scroll-refresh)
  const revalidate = useCallback(async () => {
    if (!poolId || !userId) return;
    setRevalidating(true);
    try {
      const fresh = await fetchBolaoSnapshot(poolId, userId);
      const sig = snapshotSignature(fresh);
      if (sig !== sigRef.current) {       // 3) só atualiza se mudou
        sigRef.current = sig;
        setSnapshot(fresh);
        writeCache(`bolao:${poolId}:${userId}`, fresh);
      }
    } finally {
      setRevalidating(false);
    }
  }, [poolId, userId]);

  // revalida ao montar (depois de tentar cache)
  useEffect(() => { if (hydratedFromCache) revalidate(); }, [hydratedFromCache, revalidate]);

  return { snapshot, revalidate, revalidating, hasCache: !!snapshot };
}
```

Estados expostos:
- `snapshot` → dados (do cache na hora, atualizados depois).
- `hasCache` → se já há algo para renderizar (decide skeleton vs. conteúdo).
- `revalidating` → para mostrar indicador discreto "atualizando…".
- `revalidate()` → usado pelo realtime e pelo scroll-to-refresh.

---

### 4.5 `BolaoDetailPage.tsx` — remover o loading bloqueante

**Substituir** o estado `loading` + `loadAll` pelo hook.

- Remover `const [loading, setLoading] = useState(true)` e o bloco
  `if (loading) { return <spinner fullscreen/> }` (≈ linha 855).
- Derivar `rounds`, `members`, `leaderboard`, `roundLeaderboards`,
  `allUserPredictions`, `pool` a partir de `snapshot` (com `useMemo`).
  - Reconstruir o `Map`: `new Map(snapshot.userPredictions)`.
- A `BolaoDetailPage` **sempre monta** a estrutura (tabs, header). O conteúdo:
  - `hasCache === true` → renderiza dados (mesmo que "stale", revalidando atrás).
  - `hasCache === false` → renderiza **skeletons leves** por aba (não o spinner
    de tela cheia). Ex.: 3–4 cards cinza pulsando na aba Palpites.
- Substituir as chamadas a `loadAll()` (após salvar palpite, ações de admin,
  realtime) por `revalidate()`.

> Observação: o cálculo de "rodada atual" (`currentIdx`, ≈ linha 654) deve rodar
> **só na primeira hidratação** (quando o usuário ainda não escolheu uma rodada),
> para não "pular" a aba de rodada do usuário a cada revalidação. Guardar um
> `userPickedRound` ref e só auto-selecionar enquanto for `false`.

---

### 4.6 Atualização manual por scroll (scroll-to-refresh)

Sentinela invisível no fim da lista de palpites + `IntersectionObserver`
(mesmo padrão já usado no `saveButtonRef`, ≈ linha 613).

```tsx
const refreshSentinelRef = useRef<HTMLDivElement | null>(null);
useEffect(() => {
  const el = refreshSentinelRef.current;
  if (!el) return;
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) revalidate(); // dispara req ao chegar no fim
  }, { rootMargin: "120px" });
  io.observe(el);
  return () => io.disconnect();
}, [revalidate]);

// no fim da lista de partidas:
<div ref={refreshSentinelRef} className="h-10 flex items-center justify-center">
  {revalidating
    ? <span className="spinner" style={{ width: 16, height: 16 }} />
    : <span className="text-[0.65rem] text-[var(--text-muted)]">Role para atualizar</span>}
</div>
```

Detalhes:
- **Debounce/guard:** já temos o `revalidating` para evitar disparos repetidos;
  adicionar também um *cooldown* (ex.: ignora se revalidou há < 10s) com um
  `lastRevalidateRef` para não martelar o banco enquanto o sentinela fica
  visível.
- Alternativa/extra: **pull-to-refresh** no topo (gesto de puxar). Mais
  trabalhoso (touch events); o sentinela no fim já entrega o pedido "rolar até
  um ponto que atualiza".
- A UI **permanece montada** o tempo todo — o sentinela só troca o texto por um
  spinner pequeno; os cards continuam visíveis com os dados do cache.

---

### 4.7 Realtime (`subscribeBolao`) — manter e integrar

- Continua igual em `bolaoService.ts` (≈ linha 1149).
- No componente, o callback passa a ser `revalidate` (em vez de `loadAll`).
- Como `revalidate` só re-renderiza quando a assinatura muda, o realtime fica
  "de graça": quando o admin lança um resultado, todos recebem e a tela atualiza
  sozinha — sem piscar para quem não teve mudança relevante.

---

### 4.8 Invalidação ao escrever (salvar palpite / admin)

Após `upsertPrediction`, `setMatchResultManually`, `updatePoolScoringModel`,
`updatePoolVariationMode` etc.:

1. Fazer **update otimista** no `snapshot` em memória (opcional, deixa o salvar
   instantâneo) **ou** simplesmente chamar `revalidate()` logo após o sucesso.
2. `revalidate()` reescreve o cache automaticamente (4.4), então não há cache
   "velho" após ações do usuário.

Mínimo viável: trocar `loadAll()` por `revalidate()` nesses handlers. Update
otimista é refinamento posterior.

---

## 5. Ordem de implementação (checklist)

- [x] 1. `src/lib/localCache.ts` (read/write/clear + versão de schema).
- [x] 2. `bolaoService.ts`: `BolaoSnapshot`, `fetchBolaoSnapshot`,
      `snapshotSignature` (+ `withRecomputedLocks`, `isMatchLocked` exportado).
- [x] 3. Lógica cache → revalidate → diff implementada **inline na
      `BolaoDetailPage`** (`applySnapshot` + `revalidate` + hidratação no mount),
      em vez de um hook separado — menos indireção e reaproveita os `setState`
      existentes. O hook `useBolaoSnapshot` continua válido como refatoração
      futura, se a lógica precisar ser reutilizada em outra tela.
- [x] 4. `BolaoDetailPage.tsx`: `loadAll` removido; estados vêm de
      `applySnapshot`. **Decisão:** o spinner full-screen foi mantido apenas
      para o *cold start* (primeira visita, sem cache) — em visitas seguintes a
      hidratação do cache zera `loading` na hora e a tela aparece instantânea.
      Skeletons por aba ficam como refinamento futuro.
- [x] 5. Sentinela de scroll-to-refresh + cooldown (`REVALIDATE_COOLDOWN` 10s).
- [x] 6. Realtime e handlers de escrita apontando para `revalidate()`.
- [x] 7. Indicador discreto "atualizando…" (spinner no header + texto/spinner na
      sentinela), via estado `revalidating`.
- [ ] 8. (Fase 2, opcional) RPC `get_bolao_snapshot` para 1 round-trip.
- [ ] 9. (Refinamento futuro) update otimista ao salvar palpite e skeletons no
      cold start.

---

## 6. Riscos e cuidados

- **Serialização de `Map`** — `fetchAllUserPredictions` devolve `Map`; salvar
  como pares e reconstruir (4.1/4.2). Erro clássico: cache gravar `{}` vazio.
- **Dados "stale" visíveis** — aceitável por design (é o ponto do SWR), mas
  garantir que a revalidação roda no mount e o realtime cobre mudanças.
- **`is_locked` é calculado por tempo** (`isMatchLocked` em `bolaoService.ts`):
  ao reidratar de cache antigo, um jogo pode aparecer como "aberto" quando já
  fechou. A revalidação no mount corrige; ainda assim, recalcular `is_locked`
  no cliente a partir de `utc_date` ao ler o cache evita brecha de palpite fora
  do prazo. **Importante:** o backend/regra de pontuação é a fonte de verdade —
  o lock visual é só UX.
- **Versão de schema** — qualquer mudança no formato do snapshot exige
  `SCHEMA_VERSION++` (4.1) para descartar caches incompatíveis.
- **Cooldown do scroll-refresh** — sem ele, o sentinela visível dispara fetch em
  loop. Guardar `lastRevalidateRef` e ignorar < 10s.
- **Chave de cache por usuário** — incluir `userId` na chave
  (`bolao:{poolId}:{userId}`) porque `my_prediction` e `userPredictions` são
  específicos do usuário logado.
- **Quota do localStorage** — bolões grandes (muitos membros × muitas rodadas)
  podem estourar ~5MB. Mitigar guardando só o essencial; se necessário, migrar
  para IndexedDB (fase 2). `writeCache` já engole erro de quota sem quebrar a UI.
- **Auto-seleção de rodada** — não re-disparar a cada revalidação (ver nota em
  4.5), senão a aba "pula" enquanto o usuário navega.
```
