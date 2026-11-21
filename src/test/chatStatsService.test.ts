import { describe, it, expect } from "vitest";
import {
  deleteChatStats,
  fetchChatStats,
  fetchChatStatsList,
  fetchChatStatsViewerCounts,
  fetchChatStatsViewers,
  saveChatStats,
  saveChatStatsViewers,
} from "@/features/chatstats/chatStatsService";
import { parseChatStats } from "@/features/chatstats/chatStatsLogic";
import { RAW } from "./chatStatsFixtures";
import { mockDb } from "./supabaseMock";

const { slug, ...config } = RAW;
const row = { slug, is_active: true, config };

describe("chatStatsService", () => {
  it("fetchChatStats mapeia a linha e usa is_active da coluna", async () => {
    mockDb.tables.chat_stats_snapshots = [{ ...row, config: { ...config, isActive: false } }];
    expect(await fetchChatStats("2026")).toMatchObject({ slug: "2026", isActive: true, totalMessages: 100 });
  });
  it("sem slug filtra pelo ativo; sem linha, config inválida ou erro → null/[]", async () => {
    expect(await fetchChatStats()).toBeNull();
    mockDb.tables.chat_stats_snapshots = [row];
    await fetchChatStats();
    expect(mockDb.queries.find((q) => q.table === "chat_stats_snapshots")!.calls).toContainEqual(["eq", ["is_active", true]]);
    mockDb.tables.chat_stats_snapshots = [{ slug: "x", is_active: true, config: {} }];
    expect(await fetchChatStats("x")).toBeNull();
    mockDb.errors.chat_stats_snapshots = { message: "relation does not exist" };
    expect(await fetchChatStats()).toBeNull();
    expect(await fetchChatStatsList()).toEqual([]);
  });
  it("fetchChatStatsList descarta linhas inválidas", async () => {
    mockDb.tables.chat_stats_snapshots = [row, { slug: "ruim", is_active: false, config: {} }];
    expect((await fetchChatStatsList()).map((s) => s.slug)).toEqual(["2026"]);
  });
  it("saveChatStats faz upsert por slug separando config e is_active", async () => {
    const stats = { ...parseChatStats(RAW).stats!, isActive: true };
    expect((await saveChatStats(stats)).error).toBeNull();
    const w = mockDb.writes.find((x) => x.table === "chat_stats_snapshots")!;
    expect(w.op).toBe("upsert");
    const [payload, opts] = w.args as [Record<string, unknown>, unknown];
    expect(payload).toMatchObject({ slug: "2026", is_active: true });
    expect(payload.config).not.toHaveProperty("slug");
    expect(payload.config).not.toHaveProperty("isActive");
    expect(opts).toEqual({ onConflict: "slug" });
  });
  it("saveChatStats devolve o erro do banco", async () => {
    mockDb.errors.chat_stats_snapshots = { message: "negado" };
    expect((await saveChatStats(parseChatStats(RAW).stats!)).error).toBe("negado");
  });
  it("deleteChatStats apaga pelo slug", async () => {
    await deleteChatStats("2026");
    expect(mockDb.writes.find((x) => x.op === "delete")?.table).toBe("chat_stats_snapshots");
  });
  it("viewers: lista, contagem e erro viram vazio", async () => {
    mockDb.tables.chat_stats_viewers = [{ slug: "2026", user_id: "u1" }, { slug: "2026", user_id: "u2" }, { slug: "2027", user_id: "u1" }];
    expect(await fetchChatStatsViewers("2026")).toEqual(["u1", "u2", "u1"].slice(0, 3));
    expect(await fetchChatStatsViewerCounts()).toEqual({ "2026": 2, "2027": 1 });
    mockDb.errors.chat_stats_viewers = { message: "x" };
    expect(await fetchChatStatsViewers("2026")).toEqual([]);
    expect(await fetchChatStatsViewerCounts()).toEqual({});
  });
  it("saveChatStatsViewers aplica só a diferença", async () => {
    mockDb.tables.chat_stats_viewers = [{ slug: "2026", user_id: "u1" }, { slug: "2026", user_id: "u2" }];
    expect((await saveChatStatsViewers("2026", ["u2", "u3"])).error).toBeNull();
    const ops = mockDb.writes.filter((w) => w.table === "chat_stats_viewers").map((w) => w.op);
    expect(ops).toEqual(["delete", "upsert"]);
    const up = mockDb.writes.find((w) => w.op === "upsert")!.args[0] as unknown[];
    expect(up).toEqual([{ slug: "2026", user_id: "u3" }]);
  });
  it("saveChatStatsViewers sem mudança não escreve; erro de leitura não apaga nada", async () => {
    mockDb.tables.chat_stats_viewers = [{ slug: "2026", user_id: "u1" }];
    await saveChatStatsViewers("2026", ["u1"]);
    expect(mockDb.writes).toHaveLength(0);
    mockDb.errors.chat_stats_viewers = { message: "falha" };
    expect((await saveChatStatsViewers("2026", [])).error).toBe("falha");
    expect(mockDb.writes).toHaveLength(0);
  });
});
