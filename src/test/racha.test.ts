import { describe, it, expect } from "vitest";
import { computeDebts } from "@/features/racha-conta/rachaContaLogic";
import type { Expense, GroupMember, Payment } from "@/lib/types";

const m = (id: string): GroupMember => ({
  id,
  display_name: id,
  avatar_letter: id[0].toUpperCase(),
  avatar_url: null,
  is_app_user: true,
  is_me: false,
});
const A = m("a");
const B = m("b");
const C = m("c");

let n = 0;
const exp = (over: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  group_id: "g",
  name: "x",
  amount: 100,
  paid_by: "a",
  split_type: "equal",
  participant_ids: ["a", "b"],
  splits: {},
  category: "outros",
  date: "2026-01-01",
  created_by: "a",
  created_at: "",
  ...over,
});
const pay = (from: string, to: string, amount: number): Payment => ({
  id: `p${++n}`,
  group_id: "g",
  from_member_id: from,
  to_member_id: to,
  amount,
  date: "2026-01-02",
  settled: true,
  created_at: "",
});

describe("computeDebts", () => {
  it("sem gastos não há dívidas", () => {
    expect(computeDebts([A, B], [], [])).toEqual([]);
  });

  it("divisão igual entre dois: quem não pagou deve a metade", () => {
    expect(computeDebts([A, B], [exp({})], [])).toEqual([{ from: "b", to: "a", amount: 50 }]);
  });

  it("quem paga e participa não deve a si mesmo", () => {
    expect(computeDebts([A], [exp({ participant_ids: ["a"] })], [])).toEqual([]);
  });

  it("pagador que não participa recebe o total dos participantes", () => {
    const r = computeDebts([A, B, C], [exp({ paid_by: "a", participant_ids: ["b", "c"] })], []);
    expect(r).toHaveLength(2);
    expect(r.every((t) => t.to === "a" && t.amount === 50)).toBe(true);
  });

  it("divisão por valores (custom)", () => {
    const r = computeDebts(
      [A, B, C],
      [exp({ split_type: "custom", participant_ids: ["a", "b", "c"], splits: { a: 20, b: 30, c: 50 } })],
      [],
    );
    expect(r).toEqual([
      { from: "c", to: "a", amount: 50 },
      { from: "b", to: "a", amount: 30 },
    ]);
  });

  it("divisão por porcentagem", () => {
    const r = computeDebts(
      [A, B],
      [exp({ amount: 200, split_type: "percent", participant_ids: ["a", "b"], splits: { a: 25, b: 75 } })],
      [],
    );
    expect(r).toEqual([{ from: "b", to: "a", amount: 150 }]);
  });

  it("pagamentos abatem a dívida", () => {
    expect(computeDebts([A, B], [exp({})], [pay("b", "a", 20)])).toEqual([{ from: "b", to: "a", amount: 30 }]);
  });

  it("dívida totalmente quitada some", () => {
    expect(computeDebts([A, B], [exp({})], [pay("b", "a", 50)])).toEqual([]);
  });

  it("pagar a mais inverte o sentido da dívida", () => {
    expect(computeDebts([A, B], [exp({})], [pay("b", "a", 80)])).toEqual([{ from: "a", to: "b", amount: 30 }]);
  });

  it("minimiza transações: a→b e b→c viram a→c", () => {
    // A paga 100 para B (B deve 100 a A); B paga 100 para C (C deve 100 a B)
    const r = computeDebts(
      [A, B, C],
      [
        exp({ paid_by: "a", participant_ids: ["b"], amount: 100 }),
        exp({ paid_by: "b", participant_ids: ["c"], amount: 100 }),
      ],
      [],
    );
    expect(r).toEqual([{ from: "c", to: "a", amount: 100 }]);
  });

  it("o total devido por todos é igual ao total a receber", () => {
    const r = computeDebts(
      [A, B, C],
      [
        exp({ paid_by: "a", amount: 90, participant_ids: ["a", "b", "c"] }),
        exp({ paid_by: "b", amount: 45.5, participant_ids: ["a", "b", "c"] }),
        exp({ paid_by: "c", amount: 12.34, participant_ids: ["a", "c"] }),
      ],
      [pay("b", "a", 5)],
    );
    const net: Record<string, number> = {};
    for (const t of r) {
      net[t.from] = (net[t.from] ?? 0) - t.amount;
      net[t.to] = (net[t.to] ?? 0) + t.amount;
    }
    const sum = Object.values(net).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum)).toBeLessThan(0.02);
    expect(r.every((t) => t.amount > 0)).toBe(true);
  });

  it("valores arredondados em centavos", () => {
    const r = computeDebts([A, B, C], [exp({ amount: 100, participant_ids: ["a", "b", "c"] })], []);
    for (const t of r) expect(t.amount).toBe(parseFloat(t.amount.toFixed(2)));
    expect(r.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(66.67, 1);
  });

  it("ignora diferenças menores que meio centavo", () => {
    expect(computeDebts([A, B], [exp({ amount: 0.004 })], [])).toEqual([]);
  });
});
