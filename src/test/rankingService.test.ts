import { describe, it, expect } from "vitest";
import {
  fetchAllTables,
  fetchTableDetail,
  createTable,
  updateTable,
  deleteTable,
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  addEntry,
  deleteEntry,
  submitValue,
  approvePendingEdit,
  rejectPendingEdit,
} from "@/features/ranking/rankingService";
import { mockDb } from "./supabaseMock";

const table = { id: "t1", title: "Sinuca", icon: "🎱", created_by: "u1", created_at: "", updated_at: "" };

describe("fetchTableDetail", () => {
  it("tabela inexistente = null", async () => {
    expect(await fetchTableDetail("zzz")).toBeNull();
  });
  it("monta categorias, pessoas (app e livres), valores e pendências", async () => {
    mockDb.tables.ranking_tables = [table];
    mockDb.tables.ranking_categories = [
      { id: "c1", table_id: "t1", name: "Vitórias", points_per_unit: "3", display_order: 0, created_at: "" },
    ];
    mockDb.tables.ranking_entries = [
      { id: "e1", table_id: "t1", profile_id: "u1", external_name: null, profiles: { id: "u1", display_name: "Ana", avatar_url: "🦊" }, created_at: "", updated_at: "" },
      { id: "e2", table_id: "t1", profile_id: null, external_name: "Zé de fora", profiles: null, created_at: "", updated_at: "" },
    ];
    mockDb.tables.ranking_entry_values = [
      { entry_id: "e1", category_id: "c1", value: "5" },
      { entry_id: "e2", category_id: "c1", value: 2 },
    ];
    mockDb.tables.ranking_pending_edits = [
      { id: "p1", entry_id: "e1", category_id: "c1", previous_value: 5, new_value: 6, proposed_by: "u2", profiles: { display_name: "Bia" }, status: "pending", approved_by: null, created_at: "", resolved_at: null },
    ];
    const d = (await fetchTableDetail("t1"))!;
    expect(d.table.title).toBe("Sinuca");
    expect(d.categories[0]).toMatchObject({ name: "Vitórias", points_per_unit: 3 });
    const ana = d.entries.find((e) => e.id === "e1")!;
    expect(ana).toMatchObject({ display_name: "Ana", is_app_user: true, avatar_url: "🦊", values: { c1: 5 } });
    const ze = d.entries.find((e) => e.id === "e2")!;
    expect(ze).toMatchObject({ display_name: "Zé de fora", is_app_user: false, avatar_url: null });
    expect(d.pendingEdits[0]).toMatchObject({ proposed_by_name: "Bia", new_value: 6 });
  });
  it("ícone padrão quando a tabela não tem", async () => {
    mockDb.tables.ranking_tables = [{ ...table, icon: null }];
    expect((await fetchTableDetail("t1"))!.table.icon).toBeTruthy();
  });
});

describe("fetchAllTables", () => {
  it("sem tabelas = vazio", async () => {
    expect(await fetchAllTables()).toEqual([]);
  });
  it("resume com líder e pontos (valor × pontos por unidade)", async () => {
    mockDb.tables.ranking_tables = [table];
    mockDb.tables.ranking_categories = [
      { id: "c1", table_id: "t1", name: "V", points_per_unit: 3, display_order: 0 },
      { id: "c2", table_id: "t1", name: "D", points_per_unit: -1, display_order: 1 },
    ];
    mockDb.tables.ranking_entries = [
      { id: "e1", table_id: "t1", profile_id: null, external_name: "Ana", profiles: null },
      { id: "e2", table_id: "t1", profile_id: null, external_name: "Bia", profiles: null },
    ];
    mockDb.tables.ranking_entry_values = [
      { entry_id: "e1", category_id: "c1", value: 2 },
      { entry_id: "e1", category_id: "c2", value: 1 },
      { entry_id: "e2", category_id: "c1", value: 4 },
    ];
    const [s] = await fetchAllTables();
    expect(s.entryCount).toBe(2);
    expect(s.leaderName).toBe("Bia");
    expect(s.leaderPoints).toBe(12);
  });
});

describe("tabelas", () => {
  it("createTable cria a tabela e as categorias padrão", async () => {
    mockDb.tables.ranking_tables = [{ id: "novo" }];
    expect(await createTable("u1", "Tênis")).toEqual({ data: "novo", error: null });
    expect(mockDb.writes[0]).toMatchObject({ table: "ranking_tables", op: "insert" });
    expect(mockDb.writes[0].args[0]).toMatchObject({ title: "Tênis", created_by: "u1" });
    const cats = mockDb.writes[1].args[0] as { table_id: string; display_order: number }[];
    expect(mockDb.writes[1].table).toBe("ranking_categories");
    expect(cats.every((c) => c.table_id === "novo")).toBe(true);
    expect(cats.map((c) => c.display_order)).toEqual(cats.map((_, i) => i));
  });
  it("createTable devolve o erro do banco", async () => {
    mockDb.errors.ranking_tables = { message: "rls" };
    expect(await createTable("u1", "X")).toEqual({ data: null, error: "rls" });
  });
  it("updateTable / deleteTable", async () => {
    expect(await updateTable("t1", { title: "Novo" })).toEqual({ error: null });
    expect(await deleteTable("t1")).toEqual({ error: null });
    expect(mockDb.writes.map((w) => w.op)).toEqual(["update", "delete"]);
    mockDb.errors.ranking_tables = { message: "rls" };
    expect(await deleteTable("t1")).toEqual({ error: "rls" });
  });
});

describe("categorias", () => {
  it("addCategory vai para o fim e zera o valor das pessoas existentes", async () => {
    mockDb.tables.ranking_categories = [{ id: "nova", display_order: 4 }];
    mockDb.tables.ranking_entries = [{ id: "e1" }, { id: "e2" }];
    expect(await addCategory("t1", "Empates", 1)).toEqual({ error: null });
    const cat = mockDb.writes.find((w) => w.table === "ranking_categories")!.args[0] as Record<string, unknown>;
    expect(cat).toMatchObject({ name: "Empates", points_per_unit: 1, display_order: 5 });
    const values = mockDb.writes.find((w) => w.table === "ranking_entry_values")!.args[0] as Record<string, unknown>[];
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({ entry_id: "e1", category_id: "nova", value: 0 });
  });
  it("addCategory sem categorias começa na ordem 0 e sem pessoas não grava valores", async () => {
    mockDb.tables.ranking_categories = [{ id: "nova" }];
    await addCategory("t1", "X", 1);
    expect((mockDb.writes[0].args[0] as { display_order: number }).display_order).toBe(0);
    expect(mockDb.writes.some((w) => w.table === "ranking_entry_values")).toBe(false);
  });
  it("update, delete e reorder", async () => {
    expect(await updateCategory("c1", { name: "N" })).toEqual({ error: null });
    expect(await deleteCategory("c1")).toEqual({ error: null });
    mockDb.writes.length = 0;
    expect(await reorderCategories(["c3", "c1", "c2"])).toEqual({ error: null });
    expect(mockDb.writes.map((w) => (w.args[0] as { display_order: number }).display_order)).toEqual([0, 1, 2]);
  });
  it("reorder para no primeiro erro", async () => {
    mockDb.errors.ranking_categories = { message: "rls" };
    expect(await reorderCategories(["a", "b"])).toEqual({ error: "rls" });
    expect(mockDb.writes).toHaveLength(1);
  });
});

describe("pessoas", () => {
  it("addEntry com usuário do app", async () => {
    mockDb.tables.ranking_entries = [{ id: "e9" }];
    mockDb.tables.ranking_categories = [{ id: "c1" }, { id: "c2" }];
    expect(await addEntry("t1", { profileId: "u5" })).toEqual({ error: null });
    expect(mockDb.writes[0].args[0]).toEqual({ table_id: "t1", profile_id: "u5", external_name: null });
    expect((mockDb.writes[1].args[0] as unknown[]).length).toBe(2);
  });
  it("addEntry com nome livre", async () => {
    mockDb.tables.ranking_entries = [{ id: "e9" }];
    await addEntry("t1", { name: "Zé" });
    expect(mockDb.writes[0].args[0]).toEqual({ table_id: "t1", profile_id: null, external_name: "Zé" });
  });
  it("pessoa repetida tem mensagem amigável", async () => {
    mockDb.errors.ranking_entries = { message: "dup", code: "23505" };
    expect(await addEntry("t1", { name: "Zé" })).toEqual({ error: "Essa pessoa já está na tabela" });
  });
  it("deleteEntry", async () => {
    expect(await deleteEntry("e1")).toEqual({ error: null });
  });
});

describe("valores e aprovação (RPCs)", () => {
  it("submitValue devolve 'applied' ou 'pending' conforme o banco decide", async () => {
    mockDb.rpcResults.submit_ranking_value = "pending";
    expect(await submitValue("e1", "c1", 7)).toEqual({ status: "pending", error: null });
    mockDb.rpcResults.submit_ranking_value = "applied";
    expect(await submitValue("e1", "c1", 7)).toEqual({ status: "applied", error: null });
  });
  it("submitValue repassa o erro", async () => {
    mockDb.errors["rpc:submit_ranking_value"] = { message: "sem permissão" };
    expect(await submitValue("e1", "c1", 7)).toEqual({ status: null, error: "sem permissão" });
  });
  it("aprovar e rejeitar chamam as RPCs certas", async () => {
    expect(await approvePendingEdit("p1")).toEqual({ error: null });
    expect(await rejectPendingEdit("p1")).toEqual({ error: null });
    mockDb.errors["rpc:approve_ranking_edit"] = { message: "só admin" };
    expect(await approvePendingEdit("p1")).toEqual({ error: "só admin" });
  });
});
