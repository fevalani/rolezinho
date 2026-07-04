import { describe, it, expect } from "vitest";
import { calculateTotal, sortEntries } from "@/features/ranking/rankingLogic";
import type { RankingCategory, RankingEntry } from "@/features/ranking/rankingTypes";

function makeCategory(
  id: string,
  points_per_unit: number,
  display_order: number,
): RankingCategory {
  return {
    id,
    table_id: "t1",
    name: id,
    points_per_unit,
    display_order,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function makeEntry(id: string, displayName: string, values: Record<string, number>): RankingEntry {
  return {
    id,
    table_id: "t1",
    profile_id: null,
    display_name: displayName,
    avatar_url: null,
    is_app_user: false,
    values,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const win = makeCategory("win", 3, 0);
const draw = makeCategory("draw", 1, 1);
const loss = makeCategory("loss", 0, 2);
const categories = [win, draw, loss];

describe("calculateTotal", () => {
  it("soma valor x pontos por unidade de cada categoria", () => {
    const entry = makeEntry("a", "Ana", { win: 2, draw: 1, loss: 3 });
    expect(calculateTotal(entry, categories)).toBe(2 * 3 + 1 * 1 + 3 * 0);
  });

  it("trata categoria sem valor lançado como 0", () => {
    const entry = makeEntry("a", "Ana", { win: 2 });
    expect(calculateTotal(entry, categories)).toBe(6);
  });

  it("aceita peso de categoria negativo (ex.: penalidade)", () => {
    const penalty = makeCategory("penalty", -2, 3);
    const entry = makeEntry("a", "Ana", { penalty: 3 });
    expect(calculateTotal(entry, [penalty])).toBe(-6);
  });
});

describe("sortEntries", () => {
  it("ordena por pontuação total desc", () => {
    const a = makeEntry("a", "Ana", { win: 1, draw: 0, loss: 0 }); // 3
    const b = makeEntry("b", "Bia", { win: 2, draw: 0, loss: 0 }); // 6
    const sorted = sortEntries([a, b], categories);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("desempata por vitórias (1ª categoria por display_order) quando o total empata", () => {
    // Ana: 1 vitória (3) + 0 empates = 3 | Bia: 0 vitórias + 3 empates (3) = 3
    const a = makeEntry("a", "Ana", { win: 1, draw: 0, loss: 0 });
    const b = makeEntry("b", "Bia", { win: 0, draw: 3, loss: 0 });
    const sorted = sortEntries([a, b], categories);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("desempata por empates quando pontos e vitórias são iguais", () => {
    const a = makeEntry("a", "Ana", { win: 1, draw: 2, loss: 0 });
    const b = makeEntry("b", "Bia", { win: 1, draw: 1, loss: 0 });
    const sorted = sortEntries([a, b], categories);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("cai para ordem alfabética quando tudo empata", () => {
    const a = makeEntry("a", "Zeca", { win: 1, draw: 0, loss: 0 });
    const b = makeEntry("b", "Ana", { win: 1, draw: 0, loss: 0 });
    const sorted = sortEntries([a, b], categories);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("não muta o array original", () => {
    const a = makeEntry("a", "Ana", { win: 0 });
    const b = makeEntry("b", "Bia", { win: 1 });
    const original = [a, b];
    sortEntries(original, categories);
    expect(original).toEqual([a, b]);
  });
});
