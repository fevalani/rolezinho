import { describe, it, expect } from "vitest";
import { deleteOccasionRow, fetchOccasions, saveOccasionRow } from "@/lib/seasonal/occasionService";
import { mockDb } from "./supabaseMock";

const row = { id: "o1", title: "Halloween", emoji: "🎃", extras: ["👻", "🦇"], day_md: "10-31", days_before: 5, jumble: false, enabled: true };

describe("occasionService", () => {
  it("fetchOccasions mapeia as colunas", async () => {
    mockDb.tables.seasonal_occasions = [row];
    expect(await fetchOccasions()).toEqual([
      { id: "o1", title: "Halloween", emoji: "🎃", extras: ["👻", "🦇"], dayMd: "10-31", daysBefore: 5, jumble: false, enabled: true },
    ]);
  });
  it("campos faltando ou estranhos viram valores seguros", async () => {
    mockDb.tables.seasonal_occasions = [{ id: "o2", title: "X", emoji: "🎈", extras: null, day_md: "01-01", days_before: "2", jumble: null }];
    expect((await fetchOccasions())[0]).toMatchObject({ extras: [], daysBefore: 2, jumble: false, enabled: true });
  });
  it("sem tabela/erro devolve lista vazia", async () => {
    mockDb.errors.seasonal_occasions = { message: "relation does not exist" };
    expect(await fetchOccasions()).toEqual([]);
  });

  const fields = { title: "Halloween", emoji: "🎃", extras: ["👻"], dayMd: "10-31", daysBefore: 5, jumble: false, enabled: true };

  it("saveOccasionRow sem id cria (com created_by)", async () => {
    mockDb.tables.seasonal_occasions = [row];
    const r = await saveOccasionRow(fields, "admin-1");
    expect(r.error).toBeNull();
    expect(r.occasion?.title).toBe("Halloween");
    const w = mockDb.writes.find((x) => x.table === "seasonal_occasions")!;
    expect(w.op).toBe("insert");
    expect(w.args[0]).toMatchObject({ title: "Halloween", emoji: "🎃", extras: ["👻"], day_md: "10-31", days_before: 5, jumble: false, enabled: true, created_by: "admin-1" });
  });
  it("saveOccasionRow com id atualiza", async () => {
    mockDb.tables.seasonal_occasions = [row];
    await saveOccasionRow({ ...fields, id: "o1", enabled: false }, "admin-1");
    const w = mockDb.writes.find((x) => x.table === "seasonal_occasions")!;
    expect(w.op).toBe("update");
    expect(w.args[0]).toMatchObject({ enabled: false });
    expect(w.args[0]).not.toHaveProperty("created_by");
    expect(mockDb.queries.some((q) => q.table === "seasonal_occasions" && q.calls.some(([m, a]) => m === "eq" && a[1] === "o1"))).toBe(true);
  });
  it("devolve o erro do banco ao salvar e excluir", async () => {
    mockDb.errors.seasonal_occasions = { message: "negado" };
    expect(await saveOccasionRow(fields, "a")).toEqual({ occasion: null, error: "negado" });
    expect(await deleteOccasionRow("o1")).toEqual({ error: "negado" });
  });
  it("deleteOccasionRow apaga pelo id", async () => {
    expect(await deleteOccasionRow("o1")).toEqual({ error: null });
    const w = mockDb.writes.find((x) => x.table === "seasonal_occasions")!;
    expect(w.op).toBe("delete");
    expect(mockDb.queries.some((q) => q.calls.some(([m, a]) => m === "eq" && a[1] === "o1"))).toBe(true);
  });
});
