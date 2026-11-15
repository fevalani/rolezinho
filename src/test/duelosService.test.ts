import { describe, it, expect } from "vitest";
import {
  fetchAllDuels,
  fetchRankingDetail,
  createRanking,
  submitWinner,
  undoComparison,
  resetComparisons,
  deleteRanking,
} from "@/features/duelos/duelosService";
import { mockDb } from "./supabaseMock";

const ranking = { id: "r1", owner_id: "u1", title: "Filmes", icon: "🎬", created_at: "", updated_at: "" };
const items = [
  { id: "i1", ranking_id: "r1", name: "A", position: 0 },
  { id: "i2", ranking_id: "r1", name: "B", position: 1 },
];

describe("fetchAllDuels", () => {
  it("sem rankings = vazio", async () => {
    expect(await fetchAllDuels("u1")).toEqual([]);
  });
  it("sem comparações o meu status é 'not_started'", async () => {
    mockDb.tables.duel_rankings = [ranking];
    mockDb.tables.duel_items = items;
    const [s] = await fetchAllDuels("u1");
    expect(s).toMatchObject({ itemCount: 2, participantCount: 0, finishedCount: 0, myStatus: "not_started" });
  });
  it("com comparações incompletas = 'in_progress'", async () => {
    mockDb.tables.duel_rankings = [ranking];
    mockDb.tables.duel_items = [...items, { id: "i3", ranking_id: "r1", name: "C", position: 2 }];
    mockDb.tables.duel_comparisons = [
      { id: "c1", ranking_id: "r1", winner_id: "i1", loser_id: "i2", user_id: "u1", created_at: "1" },
    ];
    const [s] = await fetchAllDuels("u1");
    expect(s.myStatus).toBe("in_progress");
    expect(s.participantCount).toBe(1);
    expect(s.finishedCount).toBe(0);
  });
  it("com todas as comparações necessárias = 'finished'", async () => {
    mockDb.tables.duel_rankings = [ranking];
    mockDb.tables.duel_items = items; // 2 itens: 1 comparação decide tudo
    mockDb.tables.duel_comparisons = [
      { id: "c1", ranking_id: "r1", winner_id: "i1", loser_id: "i2", user_id: "u1", created_at: "1" },
    ];
    const [s] = await fetchAllDuels("u1");
    expect(s.myStatus).toBe("finished");
    expect(s.finishedCount).toBe(1);
  });
});

describe("fetchRankingDetail", () => {
  it("inexistente = null", async () => {
    expect(await fetchRankingDetail("zzz")).toBeNull();
  });
  it("lista participantes com nome e estado", async () => {
    mockDb.tables.duel_rankings = [ranking];
    mockDb.tables.duel_items = items;
    mockDb.tables.duel_comparisons = [
      { id: "c1", winner_id: "i1", loser_id: "i2", user_id: "u1", created_at: "1", profiles: { display_name: "Ana", avatar_url: null } },
      { id: "c2", winner_id: "i2", loser_id: "i1", user_id: "u2", created_at: "2", profiles: null },
    ];
    const d = (await fetchRankingDetail("r1"))!;
    expect(d.items).toHaveLength(2);
    expect(d.participants.map((p) => p.name).sort()).toEqual(["Alguém", "Ana"]);
    expect(d.participants.every((p) => p.finished)).toBe(true);
  });
});

describe("mutações", () => {
  it("createRanking cria o ranking e os itens na ordem digitada", async () => {
    mockDb.tables.duel_rankings = [{ id: "novo" }];
    expect(await createRanking("u1", "Top", "🏆", ["X", "Y", "Z"])).toEqual({ data: "novo", error: null });
    expect(mockDb.writes[0].args[0]).toEqual({ owner_id: "u1", title: "Top", icon: "🏆" });
    expect(mockDb.writes[1].args[0]).toEqual([
      { ranking_id: "novo", name: "X", position: 0 },
      { ranking_id: "novo", name: "Y", position: 1 },
      { ranking_id: "novo", name: "Z", position: 2 },
    ]);
  });
  it("se os itens falham, desfaz o ranking (sem lixo no banco)", async () => {
    mockDb.tables.duel_rankings = [{ id: "novo" }];
    mockDb.errors.duel_items = { message: "boom" };
    expect(await createRanking("u1", "Top", "🏆", ["X"])).toEqual({ data: null, error: "boom" });
    expect(mockDb.writes[mockDb.writes.length - 1]).toMatchObject({ table: "duel_rankings", op: "delete" });
  });
  it("erro ao criar o ranking", async () => {
    mockDb.errors.duel_rankings = { message: "rls" };
    expect(await createRanking("u1", "T", "x", ["a"])).toEqual({ data: null, error: "rls" });
    expect(mockDb.writes.some((w) => w.table === "duel_items")).toBe(false);
  });
  it("submitWinner, undo, reset e delete devolvem null no sucesso e a mensagem no erro", async () => {
    expect(await submitWinner("r1", "u1", "i1", "i2")).toBeNull();
    expect(mockDb.writes[0].args[0]).toEqual({ ranking_id: "r1", user_id: "u1", winner_id: "i1", loser_id: "i2" });
    expect(await undoComparison("c1")).toBeNull();
    expect(await resetComparisons("r1", "u1")).toBeNull();
    expect(await deleteRanking("r1")).toBeNull();
    mockDb.errors.duel_rankings = { message: "rls" };
    expect(await deleteRanking("r1")).toBe("rls");
  });
});
