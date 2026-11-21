import { describe, it, expect } from "vitest";
import {
  getSudokuTodayGame,
  saveSudokuGame,
  getSudokuDailyLeaderboard,
  getSudokuOverallEntries,
} from "@/features/letreco/sudokuService";
import {
  getWord500TodayGame,
  saveWord500Game,
  getWord500DailyLeaderboard,
  getWord500OverallEntries,
} from "@/features/letreco/word500Service";
import {
  validateLetrosoWord,
  getLetrosoTodayGame,
  saveLetrosoGame,
  getLetrosoDailyLeaderboard,
  getLetrosoOverallEntries,
  getCombinedOverallLeaderboard,
} from "@/features/letreco/letrosoService";
import { mockDb } from "./supabaseMock";

const ana = { display_name: "Ana", avatar_url: null };

describe("Sudoku — serviço", () => {
  it("sem partida = null; erro = null", async () => {
    expect(await getSudokuTodayGame("u1", "2026-06-01")).toBeNull();
    mockDb.errors.sudoku_games = { message: "x" };
    expect(await getSudokuTodayGame("u1", "2026-06-01")).toBeNull();
  });
  it("mapeia a partida e assume dificuldade 'medio' quando não vem", async () => {
    mockDb.tables.sudoku_games = [
      { id: "s1", user_id: "u1", game_date: "d", board: "123", mistakes: "2", elapsed_seconds: "90", status: "playing", score: null },
    ];
    expect(await getSudokuTodayGame("u1", "d")).toMatchObject({ difficulty: "medio", mistakes: 2, elapsed_seconds: 90, score: 0 });
  });
  it("saveSudokuGame: finished_at só quando ganhou", async () => {
    const f = { difficulty: "facil" as const, board: "x", mistakes: 0, elapsed_seconds: 10, score: 5, started_at: "t" };
    await saveSudokuGame("u1", "d", { ...f, status: "playing" });
    await saveSudokuGame("u1", "d", { ...f, status: "won" });
    expect((mockDb.writes[0].args[0] as { finished_at: unknown }).finished_at).toBeNull();
    expect(typeof (mockDb.writes[1].args[0] as { finished_at: unknown }).finished_at).toBe("string");
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "user_id,game_date" });
  });
  it("saveSudokuGame devolve o erro", async () => {
    mockDb.errors.sudoku_games = { message: "rls" };
    expect(await saveSudokuGame("u1", "d", { difficulty: "medio", board: "", mistakes: 0, elapsed_seconds: 0, status: "playing", score: 0, started_at: "t" })).toEqual({ error: "rls" });
  });
  it("ranking do dia: mais pontos, depois menor tempo, depois menos erros", async () => {
    const r = (user_id: string, score: number, elapsed_seconds: number, mistakes: number) => ({ user_id, status: "won", difficulty: "medio", mistakes, elapsed_seconds, score, finished_at: null, profiles: ana });
    mockDb.tables.sudoku_games = [r("a", 100, 300, 0), r("b", 200, 500, 1), r("c", 100, 200, 3), r("d", 100, 200, 1)];
    expect((await getSudokuDailyLeaderboard("d")).map((e) => e.user_id)).toEqual(["b", "d", "c", "a"]);
  });
  it("ranking geral soma só vitórias", async () => {
    mockDb.tables.sudoku_games = [
      { user_id: "a", status: "won", score: 100, profiles: ana },
      { user_id: "a", status: "won", score: 50, profiles: ana },
      { user_id: "b", status: "won", score: 200, profiles: { display_name: "Bia", avatar_url: null } },
    ];
    const r = await getSudokuOverallEntries();
    expect(r[0]).toMatchObject({ user_id: "b", totalScore: 200 });
    expect(r[1]).toMatchObject({ user_id: "a", totalScore: 150, wins: 2, games: 2 });
  });
  it("erro de rede vira lista vazia", async () => {
    mockDb.tables.sudoku_games = undefined as never;
    expect(await getSudokuOverallEntries()).toEqual([]);
  });
});

describe("Word500 — serviço", () => {
  it("sem partida = null", async () => {
    expect(await getWord500TodayGame("u1", "d")).toBeNull();
  });
  it("saveWord500Game: finished_at só quando terminou", async () => {
    await saveWord500Game("u1", "d", { guesses: ["A"], status: "playing", attempts: 1, score: 0 });
    await saveWord500Game("u1", "d", { guesses: ["A"], status: "lost", attempts: 8, score: 0 });
    expect((mockDb.writes[0].args[0] as { finished_at: unknown }).finished_at).toBeNull();
    expect(typeof (mockDb.writes[1].args[0] as { finished_at: unknown }).finished_at).toBe("string");
  });
  it("ranking do dia ordena por pontos, tentativas e horário", async () => {
    const r = (user_id: string, score: number, attempts: number, finished_at: string) => ({ user_id, status: "won", attempts, score, finished_at, profiles: ana });
    mockDb.tables.word500_games = [r("a", 100, 4, "2026-06-01T09:00:00Z"), r("b", 100, 3, "2026-06-01T10:00:00Z"), r("c", 100, 4, "2026-06-01T08:00:00Z"), r("d", 300, 8, "2026-06-01T11:00:00Z")];
    expect((await getWord500DailyLeaderboard("d")).map((e) => e.user_id)).toEqual(["d", "b", "c", "a"]);
  });
  it("ranking geral conta jogos e vitórias", async () => {
    mockDb.tables.word500_games = [
      { user_id: "a", status: "won", score: 100, profiles: ana },
      { user_id: "a", status: "lost", score: 0, profiles: ana },
    ];
    expect((await getWord500OverallEntries())[0]).toMatchObject({ totalScore: 100, games: 2, wins: 1 });
  });
});

describe("Letroso — serviço", () => {
  it("validateLetrosoWord normaliza e confia só em `true` do banco", async () => {
    mockDb.rpcResults.validate_letroso_word = true;
    expect(await validateLetrosoWord("Ação")).toBe(true);
    mockDb.rpcResults.validate_letroso_word = false;
    expect(await validateLetrosoWord("xxxx")).toBe(false);
    mockDb.rpcResults.validate_letroso_word = "true"; // valor estranho
    expect(await validateLetrosoWord("xxxx")).toBe(false);
  });
  it("validateLetrosoWord aceita palavras da lista de respostas mesmo fora do dicionário do banco", async () => {
    mockDb.rpcResults.validate_letroso_word = false;
    expect(await validateLetrosoWord("universais")).toBe(true);
    expect(await validateLetrosoWord("UNIVERSAIS")).toBe(true);
    mockDb.errors["rpc:validate_letroso_word"] = { message: "x" };
    expect(await validateLetrosoWord("universais")).toBe(true);
  });
  it("validateLetrosoWord com erro do banco = inválida", async () => {
    mockDb.rpcResults.validate_letroso_word = true;
    mockDb.errors["rpc:validate_letroso_word"] = { message: "x" };
    expect(await validateLetrosoWord("amigo")).toBe(false);
  });
  it("partida do dia e save", async () => {
    expect(await getLetrosoTodayGame("u1", "d")).toBeNull();
    await saveLetrosoGame("u1", "d", { guesses: ["A"], status: "won", attempts: 1, score: 400 });
    expect(mockDb.writes[0]).toMatchObject({ table: "letroso_games", op: "upsert" });
  });
  it("ranking do dia", async () => {
    mockDb.tables.letroso_games = [
      { user_id: "a", status: "won", attempts: 2, score: 100, finished_at: "x", profiles: ana },
      { user_id: "b", status: "won", attempts: 3, score: 300, finished_at: "x", profiles: ana },
    ];
    expect((await getLetrosoDailyLeaderboard("d"))[0].user_id).toBe("b");
  });
  it("ranking geral do Letroso agrega por jogador", async () => {
    mockDb.tables.letroso_games = [
      { user_id: "a", status: "won", score: 100, profiles: ana },
      { user_id: "a", status: "lost", score: 0, profiles: ana },
    ];
    expect((await getLetrosoOverallEntries())[0]).toMatchObject({ totalScore: 100, games: 2, wins: 1 });
  });
  it("ranking combinado soma Letreco + Letroso por jogador", async () => {
    mockDb.tables.letreco_games = [{ user_id: "a", status: "won", score: 100, profiles: ana }];
    mockDb.tables.letroso_games = [
      { user_id: "a", status: "won", score: 200, profiles: ana },
      { user_id: "b", status: "won", score: 50, profiles: { display_name: "Bia", avatar_url: null } },
    ];
    const r = await getCombinedOverallLeaderboard();
    expect(r[0]).toMatchObject({ user_id: "a", totalScore: 300, games: 2, wins: 2 });
    expect(r[1]).toMatchObject({ user_id: "b", totalScore: 50 });
  });
});
