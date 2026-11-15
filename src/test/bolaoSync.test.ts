import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FDMatch, MatchScoreResult } from "@/features/bolao/footballApi";

const api = vi.hoisted(() => ({
  fetchChampionshipMatches: vi.fn(),
  fetchMatchResult: vi.fn(),
}));
vi.mock("@/features/bolao/footballApi", async (orig) => ({
  ...(await orig<typeof import("@/features/bolao/footballApi")>()),
  fetchChampionshipMatches: api.fetchChampionshipMatches,
  fetchMatchResult: api.fetchMatchResult,
}));

import { syncPoolResults, forcePopulateMatches, syncMatchSchedules } from "@/features/bolao/bolaoService";
import { mockDb, supabaseMock } from "./supabaseMock";

const NOW = new Date("2026-06-10T12:00:00Z");
let n = 0;
const poolId = () => `pool-${++n}`; // o cooldown é por bolão e vive no módulo: um id novo por teste

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  api.fetchChampionshipMatches.mockReset();
  api.fetchMatchResult.mockReset();
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const result = (over: Partial<MatchScoreResult> = {}): MatchScoreResult => ({
  home: 2, away: 1, regularHome: null, regularAway: null, penaltyHome: null, penaltyAway: null, status: "FINISHED", ...over,
});
const dbMatch = (over: Record<string, unknown> = {}) => ({
  id: "m1", fd_match_id: 101, home_team: "Brasil", away_team: "Argentina", utc_date: "2026-06-09T12:00:00Z", championship_id: "c1", status: "TIMED", ...over,
});
const seedPool = () => {
  mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
};

describe("syncPoolResults", () => {
  it("bolão inexistente = 0", async () => {
    expect(await syncPoolResults(poolId())).toBe(0);
  });

  it("jogo encerrado na API: grava o placar com o detalhamento e pontua os palpites", async () => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchMatchResult.mockResolvedValue(result({ home: 3, away: 2, regularHome: 2, regularAway: 2, penaltyHome: 5, penaltyAway: 4 }));
    supabaseMock.rpc.mockClear();
    expect(await syncPoolResults(poolId())).toBe(1);
    expect(api.fetchMatchResult).toHaveBeenCalledWith(101, "Brasil", "Argentina", "2026-06-09T12:00:00Z");
    expect(mockDb.writes.find((w) => w.table === "bolao_matches")!.args[0]).toMatchObject({
      score_home: 3, score_away: 2, score_regular_home: 2, score_regular_away: 2, score_pen_home: 5, score_pen_away: 4, status: "FINISHED",
    });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("score_match_predictions", { p_match_id: "m1", p_pool_id: null });
  });

  it.each([
    ["ainda em andamento", result({ status: "IN_PLAY" })],
    ["sem placar", result({ home: null, away: null })],
    ["sem resposta das fontes", null],
  ])("resultado %s não grava nada", async (_nome, r) => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchMatchResult.mockResolvedValue(r);
    expect(await syncPoolResults(poolId())).toBe(0);
    expect(mockDb.writes.some((w) => w.table === "bolao_matches")).toBe(false);
  });

  it("re-pontua jogos já encerrados cujos palpites ficaram sem pontuação", async () => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch({ id: "m9", status: "FINISHED" })];
    mockDb.tables.bolao_predictions = [{ id: "p1" }]; // há palpite sem points_earned
    api.fetchMatchResult.mockResolvedValue(null);
    supabaseMock.rpc.mockClear();
    expect(await syncPoolResults(poolId())).toBe(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("score_match_predictions", { p_match_id: "m9", p_pool_id: null });
  });

  it("jogo encerrado com tudo pontuado não re-pontua", async () => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch({ status: "FINISHED" })];
    api.fetchMatchResult.mockResolvedValue(null);
    supabaseMock.rpc.mockClear();
    expect(await syncPoolResults(poolId())).toBe(0);
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("score_match_predictions", expect.anything());
  });

  it("cooldown de 5 minutos por bolão; 'force' ignora; depois de 5 min roda de novo", async () => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchMatchResult.mockResolvedValue(result());
    const id = poolId();
    expect(await syncPoolResults(id)).toBe(1);
    api.fetchMatchResult.mockClear();
    expect(await syncPoolResults(id)).toBe(0); // dentro do cooldown
    expect(api.fetchMatchResult).not.toHaveBeenCalled();
    expect(await syncPoolResults(id, true)).toBe(1); // admin força
    api.fetchMatchResult.mockClear();
    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000 + 1));
    await syncPoolResults(id);
    expect(api.fetchMatchResult).toHaveBeenCalled();
  });

  it("o cooldown de um bolão não afeta outro", async () => {
    seedPool();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchMatchResult.mockResolvedValue(result());
    await syncPoolResults(poolId());
    api.fetchMatchResult.mockClear();
    await syncPoolResults(poolId());
    expect(api.fetchMatchResult).toHaveBeenCalled();
  });
});

const fd = (over: Partial<FDMatch> = {}): FDMatch => ({
  id: 101,
  homeTeam: { name: "Brazil", crest: "https://c/br.png" },
  awayTeam: { name: "Argentina", crest: null },
  utcDate: "2026-06-12T18:00:00Z",
  status: "TIMED",
  stage: "GROUP_STAGE",
  matchday: 2,
  score: { fullTime: { home: null, away: null } },
  ...over,
});
const upsertRows = () => mockDb.writes.filter((w) => w.table === "bolao_matches" && w.op === "upsert").flatMap((w) => w.args[0] as Record<string, unknown>[]);
const seedChamp = () => {
  seedPool();
  mockDb.tables.bolao_championships = [{ id: "c1", code: "WC", name: "Copa", season: "2026" }];
};

describe("forcePopulateMatches / mapeamento das partidas da API", () => {
  it("bolão ou campeonato inexistente", async () => {
    expect(await forcePopulateMatches(poolId())).toEqual({ populated: 0, error: "Bolão não encontrado" });
    seedPool();
    expect(await forcePopulateMatches(poolId())).toEqual({ populated: 0, error: "Campeonato não encontrado" });
  });

  it("grava as partidas da API com rodada, escudo e nomes normalizados", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchChampionshipMatches.mockResolvedValue({
      matches: [
        fd({ id: 1, homeTeam: { name: "Turkey", crest: null }, awayTeam: { name: "Congo DR", crest: null } }),
        fd({ id: 2, homeTeam: { name: null as unknown as string, crest: null }, awayTeam: { name: "X", crest: null }, stage: "LAST_16", matchday: null }),
      ],
      error: null,
    });
    const r = await forcePopulateMatches(poolId());
    expect(r.error).toBeNull();
    const rows = upsertRows();
    expect(rows[0]).toMatchObject({ fd_match_id: 1, home_team: "Türkiye", away_team: "DR Congo", round_label: "Rodada 2", round_number: 2, status: "TIMED" });
    expect(rows[1]).toMatchObject({ home_team: "A definir", round_label: expect.any(String), round_number: null });
    expect(mockDb.writes.find((w) => w.op === "upsert")!.args[1]).toEqual({ onConflict: "fd_match_id" });
  });

  it("placar: jogo normal usa o tempo regulamentar", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [fd({ status: "FINISHED", score: { fullTime: { home: 2, away: 1 }, duration: "REGULAR" } })], error: null });
    await forcePopulateMatches(poolId());
    expect(upsertRows()[0]).toMatchObject({ score_home: 2, score_away: 1, score_regular_home: null, score_pen_home: null });
  });

  it("placar: prorrogação soma os gols extras ao tempo regulamentar", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchChampionshipMatches.mockResolvedValue({
      matches: [fd({ status: "FINISHED", score: { fullTime: { home: 3, away: 2 }, regularTime: { home: 2, away: 2 }, extraTime: { home: 1, away: 0 }, duration: "EXTRA_TIME" } })],
      error: null,
    });
    await forcePopulateMatches(poolId());
    expect(upsertRows()[0]).toMatchObject({ score_home: 3, score_away: 2, score_regular_home: 2, score_regular_away: 2 });
  });

  it("placar: pênaltis ficam separados (o fullTime da API já os inclui)", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchChampionshipMatches.mockResolvedValue({
      matches: [fd({ status: "FINISHED", score: { fullTime: { home: 6, away: 4 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, penalties: { home: 5, away: 3 }, duration: "PENALTY_SHOOTOUT" } })],
      error: null,
    });
    await forcePopulateMatches(poolId());
    expect(upsertRows()[0]).toMatchObject({ score_home: 1, score_away: 1, score_regular_home: 1, score_regular_away: 1, score_pen_home: 5, score_pen_away: 3 });
  });

  it("corrige o fd_match_id de partida antiga (mesmo time e dia) em vez de duplicar", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch({ id: "velho", fd_match_id: 999, home_team: "Brazil", away_team: "Argentina", utc_date: "2026-06-12T15:00:00Z" })];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [fd({ id: 101 })], error: null });
    await forcePopulateMatches(poolId());
    const patch = mockDb.writes.find((w) => w.table === "bolao_matches" && w.op === "update");
    expect(patch?.args[0]).toMatchObject({ fd_match_id: 101 });
  });

  it("API fora do ar não mexe no banco e devolve o que já existe", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch(), dbMatch({ id: "m2" })];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [], error: "API fora" });
    expect(await forcePopulateMatches(poolId())).toEqual({ populated: 2, error: "API fora" });
    expect(mockDb.writes).toHaveLength(0);
  });

  it("API fora e banco vazio = erro", async () => {
    seedChamp();
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [], error: "API fora" });
    expect(await forcePopulateMatches(poolId())).toEqual({ populated: 0, error: "API fora" });
  });

  it("resposta parcial da API (menos partidas que o banco) não apaga rodadas manuais", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch({ id: "a" }), dbMatch({ id: "b" }), dbMatch({ id: "c" })];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [fd({ id: 101 })], error: null });
    await forcePopulateMatches(poolId());
    expect(mockDb.writes.some((w) => w.table === "bolao_matches" && w.op === "delete")).toBe(false);
  });

  it("limpeza: remove partidas que a API não conhece mais, mas só as sem palpites", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [{ id: "stale-sem", fd_match_id: 7, home_team: "A definir", away_team: "A definir", utc_date: "2026-06-12T15:00:00Z" }, { id: "stale-com", fd_match_id: 8, home_team: "A definir", away_team: "A definir", utc_date: "2026-06-12T15:00:00Z" }];
    mockDb.tables.bolao_predictions = [{ match_id: "stale-com" }];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [fd({ id: 101 }), fd({ id: 102 }), fd({ id: 103 })], error: null });
    await forcePopulateMatches(poolId());
    const del = mockDb.writes.find((w) => w.table === "bolao_matches" && w.op === "delete");
    expect(del).toBeTruthy();
    const q = mockDb.queries.find((x) => x.table === "bolao_matches" && x.calls.some(([m]) => m === "delete"))!;
    const ids = q.calls.find(([m]) => m === "in")![1][1] as string[];
    expect(ids).toEqual(["stale-sem"]);
  });
});

describe("syncMatchSchedules", () => {
  it("cooldown de 5 minutos", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [dbMatch()];
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [fd()], error: null });
    const id = poolId();
    await syncMatchSchedules(id);
    expect(await syncMatchSchedules(id)).toEqual({ updated: 0, error: "cooldown" });
  });

  it("bolão, campeonato e API ausentes viram erro", async () => {
    expect(await syncMatchSchedules(poolId())).toEqual({ updated: 0, error: "Bolão não encontrado" });
    seedPool();
    expect(await syncMatchSchedules(poolId())).toEqual({ updated: 0, error: "Campeonato não encontrado" });
    seedChamp();
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [], error: null });
    expect(await syncMatchSchedules(poolId())).toEqual({ updated: 0, error: "Nenhuma partida retornada pela API" });
    api.fetchChampionshipMatches.mockResolvedValue({ matches: [], error: "fora" });
    expect(await syncMatchSchedules(poolId())).toEqual({ updated: 0, error: "fora" });
  });

  it("conta só partidas existentes cujo horário ou status mudou (ignora encerradas e novas)", async () => {
    seedChamp();
    mockDb.tables.bolao_matches = [
      dbMatch({ fd_match_id: 1, utc_date: "2026-06-12T18:00:00Z", status: "TIMED" }), // igual → não conta
      dbMatch({ id: "b", fd_match_id: 2, utc_date: "2026-06-12T18:00:00Z", status: "TIMED" }), // horário mudou
      dbMatch({ id: "c", fd_match_id: 3, utc_date: "2026-06-12T18:00:00Z", status: "TIMED" }), // status mudou
    ];
    api.fetchChampionshipMatches.mockResolvedValue({
      matches: [
        fd({ id: 1, utcDate: "2026-06-12T18:00:00Z" }),
        fd({ id: 2, utcDate: "2026-06-12T20:00:00Z" }),
        fd({ id: 3, utcDate: "2026-06-12T18:00:00Z", status: "POSTPONED" }),
        fd({ id: 4, utcDate: "2026-06-13T18:00:00Z" }), // nova (não existia)
        fd({ id: 5, status: "FINISHED" }), // encerrada: ignorada
      ],
      error: null,
    });
    const r = await syncMatchSchedules(poolId());
    expect(r).toEqual({ updated: 2, error: null });
  });
});
