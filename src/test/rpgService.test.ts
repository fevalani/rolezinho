import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchMyTables,
  fetchTableById,
  createTable,
  joinTableByCode,
  leaveTable,
  transferMastery,
  startSession,
  pauseSession,
  applyRest,
} from "@/features/rpg/rpgService";
import { mockDb, supabaseMock } from "./supabaseMock";

afterEach(() => vi.useRealTimers());

describe("mesas", () => {
  it("fetchMyTables junta mesas, remove duplicadas e ordena pela mais recente", async () => {
    mockDb.tables.rpg_tables = [
      { id: "t1", name: "Velha", updated_at: "2026-01-01T00:00:00Z" },
      { id: "t2", name: "Nova", updated_at: "2026-06-01T00:00:00Z" },
    ];
    mockDb.tables.rpg_table_members = [{ table_id: "t1" }, { table_id: "t2" }];
    const r = await fetchMyTables("u1");
    expect(r.map((t) => t.id)).toEqual(["t2", "t1"]);
  });
  it("sem mesas = vazio", async () => {
    expect(await fetchMyTables("u1")).toEqual([]);
  });
  it("fetchTableById", async () => {
    mockDb.tables.rpg_tables = [{ id: "t1", name: "A" }];
    expect((await fetchTableById("t1"))?.name).toBe("A");
  });
  it("createTable cria a mesa e coloca o mestre como membro", async () => {
    mockDb.tables.rpg_tables = [{ id: "novo", name: "Strahd" }];
    const r = await createTable("Strahd", "desc", "u1");
    expect(r.error).toBeNull();
    expect(r.id).toBe("novo");
    expect(mockDb.writes[0].args[0]).toEqual({ name: "Strahd", description: "desc", master_id: "u1" });
    expect(mockDb.writes[1]).toMatchObject({ table: "rpg_table_members", op: "insert" });
    expect(mockDb.writes[1].args[0]).toEqual({ table_id: "novo", user_id: "u1" });
  });
  it("createTable com erro não cria membro", async () => {
    mockDb.errors.rpg_tables = { message: "rls" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await createTable("X", "", "u1")).toMatchObject({ data: null, error: "rls" });
    expect(mockDb.writes.some((w) => w.table === "rpg_table_members")).toBe(false);
    spy.mockRestore();
  });
});

describe("entrar na mesa por código", () => {
  it("código inexistente", async () => {
    expect(await joinTableByCode("ZZZ", "u1")).toEqual({ table: null, error: "Código de convite inválido." });
  });
  it("normaliza o código (maiúsculas, sem espaços) e entra", async () => {
    mockDb.tables.rpg_tables = [{ id: "t1", name: "A" }];
    const r = await joinTableByCode("  abc123 ", "u1");
    expect(r.error).toBeNull();
    expect(r.table?.id).toBe("t1");
    expect(mockDb.writes[0]).toMatchObject({ table: "rpg_table_members", op: "insert" });
    expect(mockDb.writes[0].args[0]).toEqual({ table_id: "t1", user_id: "u1" });
  });
  it("já é membro (23505) avisa mas devolve a mesa", async () => {
    mockDb.tables.rpg_tables = [{ id: "t1" }];
    mockDb.errors.rpg_table_members = { message: "dup", code: "23505" };
    expect(await joinTableByCode("ABC", "u1")).toMatchObject({ error: "Você já está nessa Mesa!", table: { id: "t1" } });
  });
  it("sair e passar a mestria", async () => {
    await leaveTable("t1", "u1");
    await transferMastery("t1", "u2");
    expect(mockDb.writes.map((w) => `${w.table}:${w.op}`)).toEqual(["rpg_table_members:delete", "rpg_tables:update"]);
    expect(mockDb.writes[1].args[0]).toMatchObject({ master_id: "u2" });
  });
});

describe("sessões", () => {
  it("startSession ativa a mesa e abre uma sessão", async () => {
    await startSession("t1");
    expect(mockDb.writes[0]).toMatchObject({ table: "rpg_tables", op: "update" });
    expect(mockDb.writes[0].args[0]).toMatchObject({ is_active: true });
    expect(mockDb.writes[1]).toMatchObject({ table: "rpg_sessions", op: "insert" });
  });
  it("pauseSession fecha a sessão aberta com a duração em minutos e atualiza as estatísticas", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-01T12:00:00Z") });
    mockDb.tables.rpg_sessions = [{ id: "s1", started_at: "2026-06-01T10:30:00Z" }];
    await pauseSession("t1");
    expect(mockDb.writes[0].args[0]).toMatchObject({ is_active: false });
    const close = mockDb.writes.find((w) => w.table === "rpg_sessions")!;
    expect(close.args[0]).toMatchObject({ duration_minutes: 90 });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("increment_member_stats", { p_table_id: "t1", p_minutes: 90 });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("increment_table_session_count", { p_table_id: "t1" });
  });
  it("pauseSession sem sessão aberta só pausa a mesa", async () => {
    supabaseMock.rpc.mockClear();
    await pauseSession("t1");
    expect(mockDb.writes).toHaveLength(1);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });
});

describe("applyRest (descanso)", () => {
  it("sem fichas vinculadas não faz nada", async () => {
    await applyRest("t1", "short");
    expect(mockDb.writes).toHaveLength(0);
  });
  it("descanso curto: cura 1 + mod. de Constituição (mín. 1), limitada ao HP máximo", async () => {
    mockDb.tables.rpg_sheet_table_link = [{ sheet_id: "s1" }];
    mockDb.tables.rpg_sheets = [{ id: "s1", current_hp: 10, max_hp: 30, hit_dice_used: 2, constitution: 14 }];
    await applyRest("t1", "short");
    const u = mockDb.writes.find((w) => w.table === "rpg_sheets")!.args[0] as Record<string, number>;
    expect(u.current_hp).toBe(13); // 1 + mod(+2)
    expect(u.hit_dice_used).toBe(1);
  });
  it("descanso curto não passa do HP máximo nem deixa dado de vida negativo", async () => {
    mockDb.tables.rpg_sheet_table_link = [{ sheet_id: "s1" }];
    mockDb.tables.rpg_sheets = [{ id: "s1", current_hp: 29, max_hp: 30, hit_dice_used: 0, constitution: 20 }];
    await applyRest("t1", "short");
    const u = mockDb.writes.find((w) => w.table === "rpg_sheets")!.args[0] as Record<string, number>;
    expect(u.current_hp).toBe(30);
    expect(u.hit_dice_used).toBe(0);
  });
  it("descanso curto com Constituição baixa cura pelo menos 1", async () => {
    mockDb.tables.rpg_sheet_table_link = [{ sheet_id: "s1" }];
    mockDb.tables.rpg_sheets = [{ id: "s1", current_hp: 5, max_hp: 30, hit_dice_used: 1, constitution: 3 }];
    await applyRest("t1", "short");
    expect((mockDb.writes.find((w) => w.table === "rpg_sheets")!.args[0] as Record<string, number>).current_hp).toBe(6);
  });
  it("descanso longo: HP cheio, metade dos dados de vida e espaços de magia zerados", async () => {
    mockDb.tables.rpg_sheet_table_link = [{ sheet_id: "s1" }];
    mockDb.tables.rpg_sheets = [
      { id: "s1", max_hp: 40, level: 6, hit_dice_used: 5, spell_slots: { "1": { max: 4, used: 3 }, "2": { max: 2, used: 2 } } },
    ];
    await applyRest("t1", "long");
    const u = mockDb.writes.find((w) => w.table === "rpg_sheets")!.args[0] as Record<string, unknown>;
    expect(u.current_hp).toBe(40);
    expect(u.hit_dice_used).toBe(2); // 5 - floor(6/2)
    expect(u.spell_slots).toEqual({ "1": { max: 4, used: 0 }, "2": { max: 2, used: 0 } });
  });
  it("descanso longo recupera pelo menos 1 dado de vida", async () => {
    mockDb.tables.rpg_sheet_table_link = [{ sheet_id: "s1" }];
    mockDb.tables.rpg_sheets = [{ id: "s1", max_hp: 10, level: 1, hit_dice_used: 1, spell_slots: {} }];
    await applyRest("t1", "long");
    expect((mockDb.writes.find((w) => w.table === "rpg_sheets")!.args[0] as Record<string, number>).hit_dice_used).toBe(0);
  });
});
