import { describe, it, expect } from "vitest";
import { deleteEdition, fetchEdition, fetchEditions, fetchProfileNames, fetchUserRaw, saveEdition } from "@/features/wrapped/wrappedService";
import { mockDb } from "./supabaseMock";

const row = {
  slug: "2026",
  is_active: true,
  config: { pageTitle: "Wrapped 2026", slides: [{ position: 1, type: "intro", title: "Oi" }] },
};

describe("wrappedService", () => {
  it("fetchEdition mapeia a linha e usa is_active da coluna", async () => {
    mockDb.tables.wrapped_editions = [{ ...row, config: { ...row.config, isActive: false } }];
    const e = await fetchEdition("2026");
    expect(e).toMatchObject({ slug: "2026", pageTitle: "Wrapped 2026", isActive: true });
    expect(e!.slides).toHaveLength(1);
  });
  it("sem linha, config inválida ou erro → null/[]", async () => {
    expect(await fetchEdition()).toBeNull();
    mockDb.tables.wrapped_editions = [{ slug: "x", is_active: true, config: {} }];
    expect(await fetchEdition("x")).toBeNull();
    mockDb.errors.wrapped_editions = { message: "relation does not exist" };
    expect(await fetchEdition()).toBeNull();
    expect(await fetchEditions()).toEqual([]);
  });
  it("fetchEdition sem slug filtra pela ativa", async () => {
    mockDb.tables.wrapped_editions = [row];
    await fetchEdition();
    const q = mockDb.queries.find((x) => x.table === "wrapped_editions")!;
    expect(q.calls).toContainEqual(["eq", ["is_active", true]]);
  });
  it("fetchEditions descarta linhas inválidas", async () => {
    mockDb.tables.wrapped_editions = [row, { slug: "ruim", is_active: false, config: {} }];
    expect((await fetchEditions()).map((e) => e.slug)).toEqual(["2026"]);
  });
  it("saveEdition faz upsert por slug separando config e is_active", async () => {
    const r = await saveEdition({ slug: "2026", pageTitle: "T", isActive: true, slides: [] }, "admin-1");
    expect(r.error).toBeNull();
    const w = mockDb.writes.find((x) => x.table === "wrapped_editions")!;
    expect(w.op).toBe("upsert");
    expect(w.args[0]).toMatchObject({ slug: "2026", is_active: true, created_by: "admin-1", config: { pageTitle: "T", slides: [] } });
    expect(w.args[1]).toEqual({ onConflict: "slug" });
  });
  it("saveEdition/deleteEdition devolvem a mensagem de erro", async () => {
    mockDb.errors.wrapped_editions = { message: "denied" };
    expect((await saveEdition({ slug: "1", pageTitle: "T", isActive: false, slides: [] }, "u")).error).toBe("denied");
    expect((await deleteEdition("1")).error).toBe("denied");
  });
  it("fetchUserRaw junta as fontes, filtra pelo ano e tolera falhas", async () => {
    mockDb.tables.music_picks = [{ pick_date: "2026-01-01", title: "a", artist: "Q", thumbnail: null }];
    mockDb.tables.cultura_posts = [{ item_id: "i1", personal_rating: 8, created_at: "2026-02-01T00:00:00Z" }];
    mockDb.tables.cultura_items = [{ id: "i1", title: "F", cover_url: null, type: "movie", genres: null }];
    mockDb.tables.sudoku_games = [{ game_date: "2026-03-01", status: "won", score: 10 }];
    mockDb.errors.dice_rolls = { message: "boom" };
    const raw = await fetchUserRaw("user-1", "2026");
    expect(raw.musics).toHaveLength(1);
    expect(raw.culturaItems[0].genres).toEqual([]);
    expect(raw.dice).toEqual([]);
    expect(raw.games).toEqual([{ game: "sudoku", game_date: "2026-03-01", status: "won", score: 10 }]);
    const mq = mockDb.queries.find((x) => x.table === "music_picks")!;
    expect(mq.calls).toContainEqual(["eq", ["user_id", "user-1"]]);
    expect(mq.calls).toContainEqual(["gte", ["pick_date", "2026-01-01"]]);
    expect(mq.calls).toContainEqual(["lt", ["pick_date", "2027-01-01"]]);
  });
  it("fetchUserRaw(null) busca o grupo todo: sem filtro de usuário", async () => {
    mockDb.tables.music_picks = [{ user_id: "a", pick_date: "2026-01-01", title: "a", artist: "Q", thumbnail: null }];
    const raw = await fetchUserRaw(null, "2026");
    expect(raw.musics).toHaveLength(1);
    const q = mockDb.queries.find((x) => x.table === "music_picks")!;
    expect(q.calls.some(([m]) => m === "eq")).toBe(false);
    expect(q.calls[0]).toEqual(["select", [expect.stringContaining("user_id")]]);
  });
  it("fetchProfileNames mapeia id → nome e tolera erro", async () => {
    mockDb.tables.profiles = [{ id: "a", display_name: "Ana" }];
    expect(await fetchProfileNames()).toEqual({ a: "Ana" });
    mockDb.errors.profiles = { message: "x" };
    expect(await fetchProfileNames()).toEqual({});
  });
  it("sem slug, pega a mais recente que está no ar (pula expirada e agendada)", async () => {
    const cfg = { pageTitle: "T", slides: [] };
    mockDb.tables.wrapped_editions = [
      { slug: "2028", is_active: true, starts_at: "2999-01-01", ends_at: null, config: cfg },
      { slug: "2027", is_active: true, starts_at: null, ends_at: "2000-01-01", config: cfg },
      { slug: "2026", is_active: true, starts_at: "2000-01-01", ends_at: "2999-01-01", config: cfg },
    ];
    expect((await fetchEdition())!.slug).toBe("2026");
    mockDb.tables.wrapped_editions = [mockDb.tables.wrapped_editions[0]];
    expect(await fetchEdition()).toBeNull();
    // por slug devolve mesmo fora da janela (admin pré-visualiza)
    expect((await fetchEdition("2028"))!.startsAt).toBe("2999-01-01");
  });
  it("saveEdition grava starts_at/ends_at (null quando ausentes)", async () => {
    await saveEdition({ slug: "1", pageTitle: "T", isActive: true, startsAt: "2026-12-01", slides: [] }, "u");
    expect(mockDb.writes.find((w) => w.table === "wrapped_editions")!.args[0]).toMatchObject({ starts_at: "2026-12-01", ends_at: null });
  });
});
