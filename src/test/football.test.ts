import { describe, it, expect, vi, afterEach } from "vitest";
import { toRoundLabel, KNOCKOUT_STAGE_ORDER, CHAMPIONSHIPS_CONFIG, fetchChampionshipMatches, fetchMatchResult } from "@/features/bolao/footballApi";
import { getTeamCrest } from "@/features/bolao/teamCrests";

afterEach(() => vi.unstubAllGlobals());

describe("toRoundLabel", () => {
  it("fase de pontos/grupos com rodada vira 'Rodada N'", () => {
    expect(toRoundLabel("REGULAR_SEASON", 12)).toBe("Rodada 12");
    expect(toRoundLabel("GROUP_STAGE", 2)).toBe("Rodada 2");
  });
  it("mata-mata usa o rótulo da fase e fase desconhecida volta como veio", () => {
    expect(toRoundLabel("PLAYOFF_ROUND_ONE", null)).toBe("Playoff Rodada 1");
    expect(toRoundLabel("FASE_NOVA", null)).toBe("FASE_NOVA");
    expect(toRoundLabel("GROUP_STAGE", null)).not.toBe("Rodada null");
  });
  it("a ordem do mata-mata termina na final e inclui as duas variantes de nome", () => {
    expect(KNOCKOUT_STAGE_ORDER[KNOCKOUT_STAGE_ORDER.length - 1]).toBe("FINAL");
    expect(KNOCKOUT_STAGE_ORDER).toEqual(expect.arrayContaining(["LAST_32", "ROUND_OF_32", "LAST_16", "ROUND_OF_16"]));
    expect(KNOCKOUT_STAGE_ORDER.indexOf("SEMI_FINALS")).toBeLessThan(KNOCKOUT_STAGE_ORDER.indexOf("FINAL"));
  });
  it("campeonatos configurados têm nome e temporada", () => {
    for (const c of Object.values(CHAMPIONSHIPS_CONFIG)) {
      expect(c.name).toBeTruthy();
      expect(c.season).toBeTruthy();
    }
  });
});

describe("getTeamCrest", () => {
  it("prefere o escudo local", () => {
    expect(getTeamCrest("Spain", "https://api/spain.png")).toBe("/crests/spain.svg");
  });
  it("sem escudo local usa o da API; sem nenhum = null", () => {
    expect(getTeamCrest("Time Inexistente", "https://api/x.png")).toBe("https://api/x.png");
    expect(getTeamCrest("Time Inexistente", null)).toBeNull();
  });
  it("sem nome do time usa o da API", () => {
    expect(getTeamCrest(null, "https://api/x.png")).toBe("https://api/x.png");
    expect(getTeamCrest(undefined, undefined)).toBeNull();
  });
});

describe("falhas de rede nas fontes de futebol", () => {
  it("todas as fontes fora do ar: sem partidas e sem lançar erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await fetchChampionshipMatches("BSA");
    expect(r.matches).toEqual([]);
    log.mockRestore();
    warn.mockRestore();
    err.mockRestore();
  });
  it("resultado sem nenhuma fonte disponível = null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(await fetchMatchResult(1, "Brasil", "Argentina", "2026-06-01T12:00:00Z")).toBeNull();
    spies.forEach((s) => s.mockRestore());
  });
});
