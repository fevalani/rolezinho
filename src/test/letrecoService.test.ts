import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getTodayGame,
  saveGame,
  getApprovedWords,
  verifyWordInDictionary,
  suggestWord,
  getDailyLeaderboard,
  getOverallLeaderboard,
  getUserStats,
} from "@/features/letreco/letrecoService";
import { mockDb } from "./supabaseMock";

describe("partida do dia", () => {
  it("sem partida = null", async () => {
    expect(await getTodayGame("u1", "2026-06-01")).toBeNull();
  });
  it("mapeia a partida existente", async () => {
    mockDb.tables.letreco_games = [
      { id: "g1", user_id: "u1", game_date: "2026-06-01", guesses: ["AMIGO"], status: "playing", attempts: "1", score: null, finished_at: null, created_at: "x" },
    ];
    expect(await getTodayGame("u1", "2026-06-01")).toMatchObject({ guesses: ["AMIGO"], attempts: 1, score: 0, status: "playing" });
  });
  it("saveGame partida em andamento não tem finished_at", async () => {
    await saveGame("u1", "2026-06-01", { guesses: ["A"], status: "playing", attempts: 1, score: 0 });
    expect(mockDb.writes[0].args[0]).toMatchObject({ user_id: "u1", game_date: "2026-06-01", finished_at: null });
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "user_id,game_date" });
  });
  it("saveGame partida terminada marca finished_at", async () => {
    await saveGame("u1", "2026-06-01", { guesses: ["A"], status: "won", attempts: 1, score: 100 });
    expect(typeof (mockDb.writes[0].args[0] as { finished_at: string }).finished_at).toBe("string");
  });
  it("saveGame devolve o erro", async () => {
    mockDb.errors.letreco_games = { message: "rls" };
    expect(await saveGame("u1", "d", { guesses: [], status: "playing", attempts: 0, score: 0 })).toEqual({ error: "rls" });
  });
});

describe("palavras da comunidade", () => {
  it("getApprovedWords devolve a lista; erro sem cache = vazio", async () => {
    mockDb.tables.letreco_suggested_words = [{ word: "FOFOS" }, { word: "BAITA" }];
    expect(await getApprovedWords()).toEqual(["FOFOS", "BAITA"]);
    localStorage.clear();
    mockDb.errors.letreco_suggested_words = { message: "x" };
    expect(await getApprovedWords()).toEqual([]);
  });
  it("getApprovedWords com erro (ex.: sem rede) usa a última lista guardada", async () => {
    mockDb.tables.letreco_suggested_words = [{ word: "FOFOS" }, { word: "BAITA" }];
    await getApprovedWords();
    mockDb.errors.letreco_suggested_words = { message: "TypeError: Failed to fetch" };
    expect(await getApprovedWords()).toEqual(["FOFOS", "BAITA"]);
  });
  it("suggestWord grava como aprovada e trata duplicada como sucesso", async () => {
    expect(await suggestWord("u1", "FOFOS")).toEqual({ error: null });
    expect(mockDb.writes[0].args[0]).toMatchObject({ word: "FOFOS", status: "approved", added_by: "u1" });
    mockDb.errors.letreco_suggested_words = { message: "dup", code: "23505" };
    expect(await suggestWord("u1", "FOFOS")).toEqual({ error: null });
    mockDb.errors.letreco_suggested_words = { message: "rls" };
    expect(await suggestWord("u1", "FOFOS")).toEqual({ error: "rls" });
  });
});

describe("verifyWordInDictionary", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("palavra vazia não chama a rede", async () => {
    expect(await verifyWordInDictionary("  ")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("acepções registradas = existe", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ xml: "..." }] });
    expect(await verifyWordInDictionary(" AMIGO ")).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.dicionario-aberto.net/word/amigo");
  });
  it("lista vazia, erro HTTP, resposta estranha ou rede = não existe", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect(await verifyWordInDictionary("xxxxx")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await verifyWordInDictionary("xxxxx")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ erro: 1 }) });
    expect(await verifyWordInDictionary("xxxxx")).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await verifyWordInDictionary("xxxxx")).toBe(false);
  });
});

describe("rankings", () => {
  const g = (over: Record<string, unknown>) => ({
    user_id: "u1",
    status: "won",
    attempts: 3,
    score: 100,
    finished_at: "2026-06-01T10:00:00Z",
    profiles: { display_name: "Ana", avatar_url: null },
    ...over,
  });

  it("ranking do dia: pontos, depois menos tentativas, depois quem terminou antes", async () => {
    mockDb.tables.letreco_games = [
      g({ user_id: "a", score: 100, attempts: 4, finished_at: "2026-06-01T09:00:00Z" }),
      g({ user_id: "b", score: 150, attempts: 5 }),
      g({ user_id: "c", score: 100, attempts: 2 }),
      g({ user_id: "d", score: 100, attempts: 4, finished_at: "2026-06-01T08:00:00Z" }),
    ];
    const r = await getDailyLeaderboard("2026-06-01");
    expect(r.map((e) => e.user_id)).toEqual(["b", "c", "d", "a"]);
  });
  it("jogador sem perfil vira 'Jogador'", async () => {
    mockDb.tables.letreco_games = [g({ profiles: null })];
    expect((await getDailyLeaderboard("d"))[0].display_name).toBe("Jogador");
  });
  it("ranking geral soma pontos, vitórias e jogos por jogador", async () => {
    mockDb.tables.letreco_games = [
      g({ user_id: "a", score: 100, status: "won" }),
      g({ user_id: "a", score: 0, status: "lost" }),
      g({ user_id: "b", score: 100, status: "won" }),
      g({ user_id: "c", score: 300, status: "won", profiles: { display_name: "Cris", avatar_url: null } }),
    ];
    const r = await getOverallLeaderboard();
    expect(r[0]).toMatchObject({ user_id: "c", totalScore: 300 });
    // a e b empatam em pontos e vitórias: quem jogou mais fica na frente
    expect(r[1]).toMatchObject({ user_id: "a", totalScore: 100, wins: 1, games: 2 });
    expect(r[2]).toMatchObject({ user_id: "b", games: 1 });
  });
});

describe("getUserStats", () => {
  const row = (game_date: string, status: string, attempts = 3, score = 100) => ({ game_date, status, attempts, score });

  it("sem partidas tudo zerado", async () => {
    expect(await getUserStats("u1")).toMatchObject({ played: 0, wins: 0, winRate: 0, currentStreak: 0, maxStreak: 0, totalScore: 0 });
  });
  it("taxa de vitória, pontos e distribuição por tentativa", async () => {
    mockDb.tables.letreco_games = [
      row("2026-06-01", "won", 1, 200),
      row("2026-06-02", "won", 3, 100),
      row("2026-06-03", "lost", 6, 0),
      row("2026-06-04", "won", 3, 100),
    ];
    const s = await getUserStats("u1");
    expect(s).toMatchObject({ played: 4, wins: 3, winRate: 75, totalScore: 400 });
    expect(s.distribution[0]).toBe(1);
    expect(s.distribution[2]).toBe(2);
    expect(s.distribution.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it("maior sequência de dias seguidos com vitória", async () => {
    mockDb.tables.letreco_games = [
      row("2026-06-01", "won"),
      row("2026-06-02", "won"),
      row("2026-06-03", "won"),
      row("2026-06-05", "won"),
      row("2026-06-06", "won"),
    ];
    const s = await getUserStats("u1", "2026-06-06");
    expect(s.maxStreak).toBe(3);
    expect(s.currentStreak).toBe(2); // contada a partir da vitória mais recente
  });
  it("sequência ativa vale se a última vitória foi hoje ou ontem", async () => {
    mockDb.tables.letreco_games = [row("2026-06-05", "won"), row("2026-06-06", "won")];
    expect((await getUserStats("u1", "2026-06-06")).currentStreak).toBe(2);
    expect((await getUserStats("u1", "2026-06-07")).currentStreak).toBe(2);
  });
  it("sequência antiga não conta como atual (última vitória há 2+ dias)", async () => {
    mockDb.tables.letreco_games = [row("2026-06-05", "won"), row("2026-06-06", "won")];
    const s = await getUserStats("u1", "2026-06-08");
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(2); // o recorde histórico continua
  });
  it("derrota no meio quebra a sequência", async () => {
    mockDb.tables.letreco_games = [row("2026-06-05", "won"), row("2026-06-06", "lost"), row("2026-06-07", "won")];
    expect((await getUserStats("u1", "2026-06-07")).currentStreak).toBe(1);
  });
});
