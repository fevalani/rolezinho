// Motor de ranking por comparações par a par (puro, sem I/O).
// Estado = itens (na ordem original) + comparações (vencedor > perdedor).
// Todo o resto é derivado, então desfazer = remover a última comparação.

export interface Comparison {
  winner: string;
  loser: string;
}

export type Closure = Map<string, Set<string>>;

/** Fechamento transitivo: closure.get(a) = todos que `a` vence (direta ou indiretamente). */
export function buildClosure(
  itemIds: string[],
  comparisons: Comparison[],
): Closure {
  const direct = new Map<string, string[]>();
  for (const id of itemIds) direct.set(id, []);
  for (const c of comparisons) direct.get(c.winner)?.push(c.loser);

  const closure: Closure = new Map();
  for (const id of itemIds) {
    const seen = new Set<string>();
    const stack = [...(direct.get(id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(direct.get(cur) ?? []));
    }
    closure.set(id, seen);
  }
  return closure;
}

/** Só é possível comparar se nenhum caminho liga os dois (evita redundância e ciclos). */
export function canCompare(closure: Closure, a: string, b: string): boolean {
  if (a === b) return false;
  return !closure.get(a)?.has(b) && !closure.get(b)?.has(a);
}

/**
 * Inserção binária determinística. Pula confrontos já inferidos pelo fechamento.
 * Retorna o próximo par a perguntar (ou null se terminou) e a ordem atual.
 */
function run(
  itemIds: string[],
  comparisons: Comparison[],
): { pair: [string, string] | null; sorted: string[] } {
  const closure = buildClosure(itemIds, comparisons);
  const sorted: string[] = [];

  for (const item of itemIds) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const other = sorted[mid];
      if (closure.get(item)?.has(other)) {
        hi = mid;
      } else if (closure.get(other)?.has(item)) {
        lo = mid + 1;
      } else {
        return { pair: [item, other], sorted };
      }
    }
    sorted.splice(lo, 0, item);
  }
  return { pair: null, sorted };
}

export function nextPair(
  itemIds: string[],
  comparisons: Comparison[],
): [string, string] | null {
  return run(itemIds, comparisons).pair;
}

export function isFinished(
  itemIds: string[],
  comparisons: Comparison[],
): boolean {
  return nextPair(itemIds, comparisons) === null;
}

/** Ranking final (melhor primeiro). Só é total quando `isFinished`. */
export function result(itemIds: string[], comparisons: Comparison[]): string[] {
  return run(itemIds, comparisons).sorted;
}

/** Valida e adiciona uma comparação; erro se o par já está determinado. */
export function addComparison(
  itemIds: string[],
  comparisons: Comparison[],
  winner: string,
  loser: string,
): { comparisons: Comparison[]; error: string | null } {
  if (!itemIds.includes(winner) || !itemIds.includes(loser)) {
    return { comparisons, error: "Item desconhecido" };
  }
  const closure = buildClosure(itemIds, comparisons);
  if (!canCompare(closure, winner, loser)) {
    return { comparisons, error: "Comparação já determinada" };
  }
  return { comparisons: [...comparisons, { winner, loser }], error: null };
}

/** Estimativa do mínimo de perguntas no pior caso: ceil(log2(n!)). */
export function minComparisons(n: number): number {
  let bits = 0;
  for (let k = 2; k <= n; k++) bits += Math.log2(k);
  return Math.ceil(bits - 1e-9);
}

/** Limite superior da inserção binária: soma de ceil(log2(k+1)), k=1..n-1. */
export function maxComparisons(n: number): number {
  let total = 0;
  for (let k = 1; k < n; k++) total += Math.ceil(Math.log2(k + 1));
  return total;
}

export interface AggregatedItem {
  id: string;
  avgPosition: number; // 0 = sempre em primeiro
  score: number; // 1 = sempre em primeiro, 0 = sempre em último
}

/**
 * Junta as ordens totais de quem terminou num ranking final (Borda: média das
 * posições). Empates (mesma média) desempatam por nome.
 */
export function aggregateRanking(
  itemIds: string[],
  voterOrders: string[][],
  names?: Map<string, string>,
): AggregatedItem[] {
  if (voterOrders.length === 0) return [];
  const n = itemIds.length;
  const posSum = new Map(itemIds.map((id) => [id, 0]));

  for (const order of voterOrders) {
    order.forEach((id, pos) => {
      posSum.set(id, (posSum.get(id) ?? 0) + pos);
    });
  }

  const voters = voterOrders.length;
  return itemIds
    .map((id) => {
      const avgPosition = (posSum.get(id) ?? 0) / voters;
      return {
        id,
        avgPosition,
        score: n > 1 ? 1 - avgPosition / (n - 1) : 1,
      };
    })
    .sort(
      (a, b) =>
        a.avgPosition - b.avgPosition ||
        (names?.get(a.id) ?? a.id).localeCompare(
          names?.get(b.id) ?? b.id,
          "pt-BR",
        ),
    );
}
