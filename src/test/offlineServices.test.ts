import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getTodayGame, saveGame, getDailyLeaderboard } from "@/features/letreco/letrecoService";
import { getLetrosoTodayGame, saveLetrosoGame, validateLetrosoWord, getLetrosoDailyLeaderboard } from "@/features/letreco/letrosoService";
import { getWord500TodayGame, saveWord500Game } from "@/features/letreco/word500Service";
import { getSudokuTodayGame, saveSudokuGame } from "@/features/letreco/sudokuService";
import { getFronteirasTodayGame, saveFronteirasGame } from "@/features/letreco/fronteirasService";
import { fetchEvents, upsertRsvp } from "@/features/agenda/agendaService";
import { fetchAllTables, fetchTableDetail } from "@/features/ranking/rankingService";
import { fetchHomeHighlights } from "@/features/home/homeService";
import { flushQueue, getQueuedRow, pendingCount, writeKey } from "@/lib/offlineQueue";
import { mockDb } from "./supabaseMock";

const OFFLINE_ERR = { message: "TypeError: Failed to fetch" };
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("jogos diários — jogar e salvar sem internet", () => {
  const fields = { guesses: ["CASAS"], status: "playing" as const, attempts: 1, score: 0 };

  it("Letreco: sem rede o palpite vai para a fila, a partida continua visível e sobe quando a rede volta", async () => {
    setOnline(false);
    expect(await saveGame("u1", "2026-11-21", fields)).toEqual({ error: null });
    expect(mockDb.writes).toHaveLength(0);
    expect(pendingCount("u1")).toBe(1);

    // reabrir o jogo offline: lê da fila, não perde o palpite
    mockDb.errors.letreco_games = OFFLINE_ERR;
    const game = await getTodayGame("u1", "2026-11-21");
    expect(game?.guesses).toEqual(["CASAS"]);

    // rede volta: sobe a partida
    mockDb.errors = {};
    setOnline(true);
    expect((await flushQueue("u1")).sent).toBe(1);
    expect(mockDb.writes[0]).toMatchObject({ table: "letreco_games", op: "upsert" });
    expect(mockDb.writes[0].args[0]).toMatchObject({ user_id: "u1", game_date: "2026-11-21", guesses: ["CASAS"] });
    expect(pendingCount("u1")).toBe(0);
  });

  it("o último palpite substitui o anterior na fila (uma linha por dia)", async () => {
    setOnline(false);
    await saveGame("u1", "d", fields);
    await saveGame("u1", "d", { ...fields, guesses: ["CASAS", "PRETO"], attempts: 2 });
    expect(pendingCount("u1")).toBe(1);
    expect(getQueuedRow(writeKey("letreco_games", "u1", "d"))).toMatchObject({ guesses: ["CASAS", "PRETO"] });
  });

  it("com rede, salva direto (sem fila); erro do banco continua sendo erro", async () => {
    expect(await saveGame("u1", "d", fields)).toEqual({ error: null });
    expect(pendingCount()).toBe(0);
    expect(mockDb.writes).toHaveLength(1);
    mockDb.errors.letreco_games = { message: "violates row-level security" };
    expect(await saveGame("u1", "d", fields)).toEqual({ error: "violates row-level security" });
    expect(pendingCount()).toBe(0);
  });

  it("a partida já carregada fica guardada: reabrir offline mostra a última versão do servidor", async () => {
    mockDb.tables.letreco_games = [
      { id: "g1", user_id: "u1", game_date: "d", guesses: ["ABCDE"], status: "playing", attempts: 1, score: 0, finished_at: null, created_at: "x" },
    ];
    expect((await getTodayGame("u1", "d"))?.guesses).toEqual(["ABCDE"]);
    mockDb.errors.letreco_games = OFFLINE_ERR;
    expect((await getTodayGame("u1", "d"))?.guesses).toEqual(["ABCDE"]);
  });

  it("sem rede e sem cópia: partida nova (null), sem quebrar", async () => {
    mockDb.errors.letreco_games = OFFLINE_ERR;
    expect(await getTodayGame("u1", "d")).toBeNull();
  });

  it.each([
    ["Letroso", saveLetrosoGame, getLetrosoTodayGame, "letroso_games"],
    ["Word500", saveWord500Game, getWord500TodayGame, "word500_games"],
  ] as const)("%s também usa a fila offline", async (_n, save, get, table) => {
    setOnline(false);
    await save("u1", "d", fields);
    expect(pendingCount("u1")).toBe(1);
    mockDb.errors[table] = OFFLINE_ERR;
    expect((await get("u1", "d"))?.guesses).toEqual(["CASAS"]);
  });

  it("Sudoku e Fronteiras também usam a fila offline", async () => {
    setOnline(false);
    await saveSudokuGame("u1", "d", {
      difficulty: "facil", board: "1".repeat(81), mistakes: 0, elapsed_seconds: 5, status: "playing", score: 0, started_at: "2026-11-21T10:00:00Z",
    });
    await saveFronteirasGame("u1", "d", { difficulty: "easy", guesses: ["Peru"], status: "playing", attempts: 1, score: 0 });
    expect(pendingCount("u1")).toBe(2);
    mockDb.errors.sudoku_games = OFFLINE_ERR;
    mockDb.errors.fronteiras_games = OFFLINE_ERR;
    expect((await getSudokuTodayGame("u1", "d"))?.board).toBe("1".repeat(81));
    expect((await getFronteirasTodayGame("u1", "d"))?.guesses).toEqual(["Peru"]);
  });

  it("ranking do dia: sem rede mostra o último carregado", async () => {
    mockDb.tables.letreco_games = [
      { user_id: "a", status: "won", attempts: 2, score: 70, finished_at: "x", profiles: { display_name: "Ana", avatar_url: null } },
    ];
    expect((await getDailyLeaderboard("d"))[0].display_name).toBe("Ana");
    mockDb.errors.letreco_games = OFFLINE_ERR;
    expect((await getDailyLeaderboard("d"))[0].display_name).toBe("Ana");
    mockDb.tables.letroso_games = [
      { user_id: "a", status: "won", attempts: 2, score: 70, finished_at: "x", profiles: { display_name: "Bia", avatar_url: null } },
    ];
    await getLetrosoDailyLeaderboard("d");
    mockDb.errors.letroso_games = OFFLINE_ERR;
    expect((await getLetrosoDailyLeaderboard("d"))[0].display_name).toBe("Bia");
  });
});

describe("Letroso — validar palpite sem internet", () => {
  it("aceita palavras já validadas antes neste aparelho", async () => {
    mockDb.rpcResults.validate_letroso_word = true;
    expect(await validateLetrosoWord("zzzyx")).toBe(true); // validada online e lembrada
    setOnline(false);
    mockDb.rpcResults.validate_letroso_word = false;
    expect(await validateLetrosoWord("zzzyx")).toBe(true);
  });

  it("sem rede: aceita palavra do dicionário local e recusa o que não conhece", async () => {
    setOnline(false);
    expect(await validateLetrosoWord("universais")).toBe(true); // lista de respostas
    expect(await validateLetrosoWord("preto")).toBe(true); // dicionário local do Letreco
    expect(await validateLetrosoWord("qqqqq")).toBe(false);
    expect(mockDb.queries.length).toBe(0); // nem tenta o banco
  });

  it("erro de rede no banco cai no dicionário local; erro de regra continua recusando", async () => {
    mockDb.errors["rpc:validate_letroso_word"] = OFFLINE_ERR;
    expect(await validateLetrosoWord("preto")).toBe(true);
    expect(await validateLetrosoWord("qqqqq")).toBe(false);
    mockDb.errors["rpc:validate_letroso_word"] = { message: "permission denied" };
    expect(await validateLetrosoWord("preto")).toBe(false);
  });
});

describe("agenda, ranking e home sem internet", () => {
  const day = "2099-01-01";

  it("fetchEvents: sem rede mostra a última agenda carregada", async () => {
    mockDb.tables.agenda_events = [{ id: "e1", created_by: "u2", title: "Churrasco", event_date: day, event_time: null }];
    mockDb.tables.agenda_rsvps = [];
    mockDb.tables.profiles = [{ id: "u2", display_name: "Zé", avatar_url: null }];
    expect((await fetchEvents("u1"))[0].title).toBe("Churrasco");
    mockDb.errors.agenda_events = OFFLINE_ERR;
    expect((await fetchEvents("u1"))[0].title).toBe("Churrasco");
  });

  it("fetchEvents: erro sem cópia = lista vazia", async () => {
    mockDb.errors.agenda_events = OFFLINE_ERR;
    expect(await fetchEvents("u1")).toEqual([]);
  });

  it("confirmar presença sem rede fica na fila e sobe depois", async () => {
    setOnline(false);
    expect(await upsertRsvp("u1", "e1", "confirmed")).toEqual({ error: null });
    expect(mockDb.writes).toHaveLength(0);
    expect(pendingCount("u1")).toBe(1);
    setOnline(true);
    await flushQueue("u1");
    expect(mockDb.writes[0]).toMatchObject({ table: "agenda_rsvps", op: "upsert" });
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "event_id,user_id" });
  });

  it("ranking: lista e detalhe usam a última cópia quando falha", async () => {
    const table = { id: "t1", title: "Sinuca", icon: "🎱", created_by: "u1", created_at: "", updated_at: "" };
    mockDb.tables.ranking_tables = [table];
    mockDb.tables.ranking_categories = [{ id: "c1", table_id: "t1", name: "V", points_per_unit: 3, display_order: 0 }];
    mockDb.tables.ranking_entries = [];
    expect(await fetchAllTables()).toHaveLength(1);
    expect((await fetchTableDetail("t1"))?.table.title).toBe("Sinuca");
    mockDb.errors.ranking_tables = OFFLINE_ERR;
    expect(await fetchAllTables()).toHaveLength(1);
    expect((await fetchTableDetail("t1"))?.table.title).toBe("Sinuca");
  });

  it("home: destaques guardados valem sem rede", async () => {
    const today = new Date(2026, 10, 19);
    mockDb.tables.profiles = [{ id: "a", display_name: "Ana", avatar_url: null, birthday: "1990-11-19" }];
    expect((await fetchHomeHighlights(false, today)).todayBirthdays).toHaveLength(1);
    mockDb.errors.profiles = OFFLINE_ERR;
    expect((await fetchHomeHighlights(false, today)).todayBirthdays).toHaveLength(1);
    expect((await fetchHomeHighlights(true, today)).todayBirthdays).toEqual([]); // sem cópia estendida
  });
});
