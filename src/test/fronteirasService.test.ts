import { describe, it, expect } from "vitest";
import {
  getFronteirasTodayGame,
  saveFronteirasGame,
  getFronteirasDailyLeaderboard,
  getFronteirasOverallEntries,
} from "@/features/letreco/fronteirasService";
import { mockDb } from "./supabaseMock";

const ana = { display_name: "Ana", avatar_url: null };

describe("Fronteiras — serviço", () => {
  it("sem partida = null; erro do banco = null", async () => {
    expect(await getFronteirasTodayGame("u1", "2026-11-15")).toBeNull();
    mockDb.errors.fronteiras_games = { message: "x" };
    expect(await getFronteirasTodayGame("u1", "2026-11-15")).toBeNull();
  });

  it("mapeia a partida do dia", async () => {
    mockDb.tables.fronteiras_games = [
      { id: "f1", user_id: "u1", game_date: "d", guesses: ["AR", "BO"], status: "playing", attempts: "2", score: null, finished_at: null, created_at: "t" },
    ];
    expect(await getFronteirasTodayGame("u1", "d")).toMatchObject({
      guesses: ["AR", "BO"],
      status: "playing",
      attempts: 2,
      score: 0,
    });
  });

  it("saveFronteirasGame faz upsert por user_id+game_date; finished_at só ao terminar", async () => {
    await saveFronteirasGame("u1", "d", { difficulty: "easy", guesses: ["AR"], status: "playing", attempts: 1, score: 0 });
    await saveFronteirasGame("u1", "d", { difficulty: "hard", guesses: ["AR", "BO"], status: "won", attempts: 2, score: 150 });
    const [a, b] = mockDb.writes.filter((w) => w.table === "fronteiras_games");
    expect(a).toMatchObject({ op: "upsert" });
    expect(a.args[0]).toMatchObject({ user_id: "u1", game_date: "d", status: "playing", finished_at: null });
    expect(b.args[0]).toMatchObject({ difficulty: "hard", status: "won", score: 150 });
    expect(a.args[0]).toMatchObject({ difficulty: "easy" });
    expect((b.args[0] as { finished_at: string }).finished_at).toMatch(/^\d{4}-/);
  });

  it("saveFronteirasGame devolve a mensagem de erro do banco", async () => {
    mockDb.errors.fronteiras_games = { message: "sem permissão" };
    const r = await saveFronteirasGame("u1", "d", { difficulty: "easy", guesses: [], status: "playing", attempts: 0, score: 0 });
    expect(r.error).toBe("sem permissão");
  });

  it("ranking do dia ordena por pontos, tentativas e horário", async () => {
    const r = (user_id: string, score: number, attempts: number, finished_at: string) => ({
      user_id, status: "won", attempts, score, finished_at, profiles: ana,
    });
    mockDb.tables.fronteiras_games = [
      r("a", 100, 5, "2026-11-15T09:00:00Z"),
      r("b", 100, 4, "2026-11-15T10:00:00Z"),
      r("c", 100, 5, "2026-11-15T08:00:00Z"),
      r("d", 130, 9, "2026-11-15T11:00:00Z"),
    ];
    expect((await getFronteirasDailyLeaderboard("d")).map((e) => e.user_id)).toEqual(["d", "b", "c", "a"]);
  });

  it("ranking do dia usa 'Jogador' sem perfil e erro vira lista vazia", async () => {
    mockDb.tables.fronteiras_games = [{ user_id: "z", status: "lost", attempts: 6, score: 0, finished_at: null, profiles: null }];
    expect((await getFronteirasDailyLeaderboard("d"))[0]).toMatchObject({ display_name: "Jogador", status: "lost" });
  });

  it("ranking geral soma pontos, jogos e vitórias", async () => {
    mockDb.tables.fronteiras_games = [
      { user_id: "a", status: "won", score: 100, profiles: ana },
      { user_id: "a", status: "lost", score: 0, profiles: ana },
      { user_id: "b", status: "won", score: 60, profiles: { display_name: "Beto", avatar_url: null } },
    ];
    const rows = await getFronteirasOverallEntries();
    expect(rows[0]).toMatchObject({ user_id: "a", totalScore: 100, games: 2, wins: 1 });
    expect(rows[1]).toMatchObject({ user_id: "b", totalScore: 60, games: 1, wins: 1 });
  });
});
