import type { RankingCategory, RankingEntry } from "./rankingTypes";

/** Categorias ordenadas pela ordem de exibição definida pelo admin (também define o desempate) */
export function orderCategories(categories: RankingCategory[]): RankingCategory[] {
  return [...categories].sort((a, b) => a.display_order - b.display_order);
}

/** Soma de valor × pontos_por_unidade em todas as categorias da pessoa */
export function calculateTotal(
  entry: RankingEntry,
  categories: RankingCategory[],
): number {
  return categories.reduce(
    (sum, c) => sum + (entry.values[c.id] ?? 0) * c.points_per_unit,
    0,
  );
}

/**
 * Ordena por pontuação total desc; empate é desfeito pelo valor bruto de
 * cada categoria, na ordem definida pelo admin (ex.: Vitórias, depois
 * Empates); último critério é alfabético, só para estabilidade visual.
 */
export function sortEntries(
  entries: RankingEntry[],
  categories: RankingCategory[],
): RankingEntry[] {
  const ordered = orderCategories(categories);

  return [...entries].sort((a, b) => {
    const totalDiff = calculateTotal(b, ordered) - calculateTotal(a, ordered);
    if (totalDiff !== 0) return totalDiff;

    for (const cat of ordered) {
      const diff = (b.values[cat.id] ?? 0) - (a.values[cat.id] ?? 0);
      if (diff !== 0) return diff;
    }

    return a.display_name.localeCompare(b.display_name, "pt-BR");
  });
}
