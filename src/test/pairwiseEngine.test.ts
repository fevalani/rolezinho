import { describe, it, expect } from "vitest";
import {
  addComparison,
  aggregateRanking,
  buildClosure,
  canCompare,
  isFinished,
  maxComparisons,
  minComparisons,
  nextPair,
  result,
  type Comparison,
} from "@/features/duelos/pairwiseEngine";

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Usuário simulado com uma ordem secreta (melhor primeiro). */
function play(itemIds: string[], secret: string[]) {
  const rank = (id: string) => secret.indexOf(id);
  let comparisons: Comparison[] = [];
  let questions = 0;
  for (;;) {
    const pair = nextPair(itemIds, comparisons);
    if (!pair) break;
    const [a, b] = pair;
    const [winner, loser] = rank(a) < rank(b) ? [a, b] : [b, a];
    const r = addComparison(itemIds, comparisons, winner, loser);
    expect(r.error).toBeNull();
    comparisons = r.comparisons;
    questions++;
  }
  return { comparisons, questions };
}

describe("pairwiseEngine", () => {
  it("fechamento transitivo", () => {
    const c = buildClosure(["A", "B", "C"], [
      { winner: "A", loser: "B" },
      { winner: "B", loser: "C" },
    ]);
    expect(c.get("A")!.has("C")).toBe(true);
    expect(canCompare(c, "A", "C")).toBe(false);
    expect(canCompare(c, "C", "A")).toBe(false);
  });

  it("rejeita comparação que criaria ciclo ou é redundante", () => {
    const items = ["A", "B", "C"];
    const cmp: Comparison[] = [
      { winner: "A", loser: "B" },
      { winner: "B", loser: "C" },
    ];
    expect(addComparison(items, cmp, "C", "A").error).not.toBeNull();
    expect(addComparison(items, cmp, "A", "C").error).not.toBeNull();
  });

  it("recupera a ordem secreta dentro do limite de perguntas", () => {
    for (const n of [2, 3, 6, 10, 25]) {
      for (let seed = 1; seed <= 5; seed++) {
        const items = Array.from({ length: n }, (_, i) => `i${i}`);
        const secret = shuffle(items, seed * 7 + n);
        const { comparisons, questions } = play(items, secret);
        expect(result(items, comparisons)).toEqual(secret);
        expect(isFinished(items, comparisons)).toBe(true);
        expect(questions).toBeLessThanOrEqual(maxComparisons(n));
        expect(questions).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("limites para 6 itens", () => {
    expect(minComparisons(6)).toBe(10);
    expect(maxComparisons(6)).toBeLessThanOrEqual(11);
  });

  it("desfazer reproduz o mesmo próximo par", () => {
    const items = ["A", "B", "C", "D", "E"];
    const before: Comparison[] = [{ winner: "B", loser: "A" }];
    const pairBefore = nextPair(items, before);
    const r = addComparison(items, before, pairBefore![0], pairBefore![1]);
    expect(nextPair(items, r.comparisons.slice(0, -1))).toEqual(pairBefore);
  });

  describe("aggregateRanking", () => {
    const items = ["A", "B", "C", "D"];

    it("unanimidade mantém a ordem", () => {
      const o = ["C", "A", "D", "B"];
      expect(aggregateRanking(items, [o, o, o]).map((x) => x.id)).toEqual(o);
    });

    it("médias de posição com 3 votantes", () => {
      const r = aggregateRanking(items, [
        ["A", "B", "C", "D"],
        ["B", "A", "C", "D"],
        ["A", "C", "B", "D"],
      ]);
      expect(r.map((x) => x.id)).toEqual(["A", "B", "C", "D"]);
      expect(r[0].avgPosition).toBeCloseTo(1 / 3);
      expect(r[3].score).toBe(0);
    });

    it("ordens opostas desempatam por nome, de forma determinística", () => {
      const r = aggregateRanking(
        ["A", "B"],
        [["A", "B"], ["B", "A"]],
        new Map([["A", "Alfa"], ["B", "Beta"]]),
      );
      expect(r.map((x) => x.id)).toEqual(["A", "B"]);
    });

    it("sem votantes retorna vazio", () => {
      expect(aggregateRanking(items, [])).toEqual([]);
    });
  });
});
