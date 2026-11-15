import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchMatchesForPool,
  upsertPrediction,
  setMatchResultManually,
  recalculateAllPoints,
  updatePoolScoringModel,
  updatePoolGoalBase,
  updatePoolStageMultipliers,
  updatePoolVariationMode,
  fetchKnockoutStages,
  DEFAULT_CUSTOM_CONFIG,
} from "@/features/bolao/bolaoService";
import { mockDb, supabaseMock } from "./supabaseMock";

afterEach(() => vi.useRealTimers());

const NOW = new Date("2026-06-10T12:00:00Z");
const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();
const match = (over: Record<string, unknown>) => ({
  id: "m",
  championship_id: "c1",
  home_team: "Brasil",
  away_team: "Argentina",
  home_crest: null,
  away_crest: null,
  round_label: "Rodada 1",
  round_number: 1,
  stage: "GROUP_STAGE",
  utc_date: at(2),
  status: "SCHEDULED",
  score_home: null,
  score_away: null,
  ...over,
});

describe("fetchMatchesForPool", () => {
  it("bolão inexistente = sem rodadas", async () => {
    expect(await fetchMatchesForPool("p1", "u1")).toEqual([]);
  });

  it("agrupa por rodada em ordem cronológica e anexa o palpite do usuário", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [
      match({ id: "m3", round_label: "Rodada 2", utc_date: at(9) }),
      match({ id: "m1", round_label: "Rodada 1", utc_date: at(2) }),
      match({ id: "m2", round_label: "Rodada 1", utc_date: at(3) }),
    ];
    mockDb.tables.bolao_predictions = [{ match_id: "m1", home_goals: 2, away_goals: 1, points_earned: null }];
    const rounds = await fetchMatchesForPool("p1", "u1");
    expect(rounds.map((r) => r.label)).toEqual(["Rodada 1", "Rodada 2"]);
    const m1 = rounds[0].matches.find((m) => m.id === "m1")!;
    expect(m1.my_prediction).toEqual({ home_goals: 2, away_goals: 1, points_earned: null });
    expect(rounds[0].matches.find((m) => m.id === "m2")!.my_prediction).toBeNull();
    expect(m1.is_locked).toBe(false);
  });

  it("jogo já começado vem travado; escudo local tem prioridade", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [
      match({ id: "m1", home_team: "Spain", home_crest: "https://api/es.png", utc_date: at(-1) }),
    ];
    const [r] = await fetchMatchesForPool("p1", "u1");
    expect(r.matches[0].is_locked).toBe(true);
    expect(r.matches[0].home_crest).toBe("/crests/spain.svg");
  });

  it("fase eliminatória só aparece quando a anterior terminou", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [
      match({ id: "a", round_label: "16 avos", stage: "LAST_32", utc_date: at(1), status: "SCHEDULED" }),
      match({ id: "b", round_label: "Oitavas", stage: "LAST_16", utc_date: at(5) }),
    ];
    let rounds = await fetchMatchesForPool("p1", "u1");
    expect(rounds.find((r) => r.stage === "LAST_32")!.is_visible).toBe(true);
    expect(rounds.find((r) => r.stage === "LAST_16")!.is_visible).toBe(false);

    mockDb.tables.bolao_matches[0].status = "FINISHED";
    rounds = await fetchMatchesForPool("p1", "u1");
    expect(rounds.find((r) => r.stage === "LAST_16")!.is_visible).toBe(true);
  });

  it("uma partida da fase anterior ainda em aberto mantém a próxima escondida", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [
      match({ id: "a1", round_label: "16 avos", stage: "LAST_32", utc_date: at(1), status: "FINISHED" }),
      match({ id: "a2", round_label: "16 avos", stage: "LAST_32", utc_date: at(1, 3), status: "IN_PLAY" }),
      match({ id: "b", round_label: "Oitavas", stage: "LAST_16", utc_date: at(5) }),
    ];
    const rounds = await fetchMatchesForPool("p1", "u1");
    expect(rounds.find((r) => r.stage === "LAST_16")!.is_visible).toBe(false);
  });
});

describe("upsertPrediction (guarda no momento de gravar)", () => {
  it("partida inexistente", async () => {
    expect(await upsertPrediction("p1", "m1", "u1", 1, 0)).toEqual({ error: "Partida não encontrada." });
    expect(mockDb.writes).toHaveLength(0);
  });
  it("não grava depois do apito, mesmo que a tela esteja defasada", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_matches = [{ utc_date: at(0, -1), status: "SCHEDULED", home_team: "A", away_team: "B" }];
    expect(await upsertPrediction("p1", "m1", "u1", 1, 0)).toEqual({ error: "Palpites encerrados para esta partida." });
    expect(mockDb.writes.some((w) => w.table === "bolao_predictions")).toBe(false);
  });
  it("não grava em jogo com times a definir", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_matches = [{ utc_date: at(5), status: "SCHEDULED", home_team: "A definir", away_team: "B" }];
    expect((await upsertPrediction("p1", "m1", "u1", 1, 0)).error).toMatch(/encerrados/);
  });
  it("grava o palpite com a chave (bolão, partida, usuário)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_matches = [{ utc_date: at(2), status: "TIMED", home_team: "A", away_team: "B" }];
    expect(await upsertPrediction("p1", "m1", "u1", 3, 2)).toEqual({ error: null });
    const w = mockDb.writes.find((x) => x.table === "bolao_predictions")!;
    expect(w.op).toBe("upsert");
    expect(w.args[0]).toMatchObject({ pool_id: "p1", match_id: "m1", user_id: "u1", home_goals: 3, away_goals: 2 });
    expect(w.args[1]).toEqual({ onConflict: "pool_id,match_id,user_id" });
  });
  it("repassa o erro do banco", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    mockDb.tables.bolao_matches = [{ utc_date: at(2), status: "TIMED", home_team: "A", away_team: "B" }];
    mockDb.errors.bolao_predictions = { message: "rls" };
    expect(await upsertPrediction("p1", "m1", "u1", 1, 1)).toEqual({ error: "rls" });
  });
});

describe("ações de admin do bolão (serviço)", () => {
  const rpcCalls = () => supabaseMock.rpc.mock.calls.map((c) => c[0]);

  it("setMatchResultManually grava o placar como FINISHED, zera o detalhamento e re-pontua", async () => {
    supabaseMock.rpc.mockClear();
    expect(await setMatchResultManually("m1", 2, 1)).toEqual({ error: null });
    expect(mockDb.writes[0].args[0]).toMatchObject({
      score_home: 2, score_away: 1, status: "FINISHED",
      score_regular_home: null, score_regular_away: null, score_pen_home: null, score_pen_away: null,
    });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("score_match_predictions", { p_match_id: "m1", p_pool_id: null });
  });
  it("setMatchResultManually com erro não re-pontua", async () => {
    supabaseMock.rpc.mockClear();
    mockDb.errors.bolao_matches = { message: "rls" };
    expect(await setMatchResultManually("m1", 1, 0)).toEqual({ error: "rls" });
    expect(rpcCalls()).not.toContain("score_match_predictions");
  });

  it("recalculateAllPoints: bolão inexistente", async () => {
    expect(await recalculateAllPoints("p1")).toEqual({ updated: 0, error: "Bolão não encontrado" });
  });
  it("recalculateAllPoints re-pontua cada partida encerrada do bolão", async () => {
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [{ id: "m1" }, { id: "m2" }];
    supabaseMock.rpc.mockClear();
    expect(await recalculateAllPoints("p1")).toEqual({ updated: 2, error: null });
    const calls = supabaseMock.rpc.mock.calls.filter((c) => c[0] === "score_match_predictions");
    expect(calls.map((c) => c[1])).toEqual([
      { p_match_id: "m1", p_pool_id: "p1" },
      { p_match_id: "m2", p_pool_id: "p1" },
    ]);
  });

  it("trocar o modelo: atualiza, zera os pontos e recalcula (nessa ordem)", async () => {
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    mockDb.tables.bolao_matches = [{ id: "m1" }];
    supabaseMock.rpc.mockClear();
    expect(await updatePoolScoringModel("p1", "simplified")).toEqual({ error: null });
    expect(rpcCalls()).toEqual(["update_pool_scoring_model", "reset_pool_scores", "score_match_predictions"]);
    expect(supabaseMock.rpc.mock.calls[0][1]).toEqual({ p_pool_id: "p1", p_scoring_model: "simplified", p_scoring_config: null });
  });
  it("só envia a config quando o modelo é personalizado", async () => {
    supabaseMock.rpc.mockClear();
    await updatePoolScoringModel("p1", "custom", { ...DEFAULT_CUSTOM_CONFIG, exact: 20 });
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({ p_scoring_model: "custom", p_scoring_config: { exact: 20 } });
    supabaseMock.rpc.mockClear();
    await updatePoolScoringModel("p1", "classic", DEFAULT_CUSTOM_CONFIG);
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({ p_scoring_config: null });
  });
  it("erro ao trocar o modelo interrompe antes de zerar os pontos", async () => {
    mockDb.errors["rpc:update_pool_scoring_model"] = { message: "só o criador" };
    supabaseMock.rpc.mockClear();
    expect(await updatePoolScoringModel("p1", "extended")).toEqual({ error: "só o criador" });
    expect(rpcCalls()).toEqual(["update_pool_scoring_model"]);
  });
  it("erro ao zerar os pontos interrompe antes de recalcular", async () => {
    mockDb.errors["rpc:reset_pool_scores"] = { message: "x" };
    supabaseMock.rpc.mockClear();
    expect(await updatePoolScoringModel("p1", "extended")).toEqual({ error: "x" });
    expect(rpcCalls()).toEqual(["update_pool_scoring_model", "reset_pool_scores"]);
  });

  it("base de gols e multiplicadores seguem o mesmo fluxo (atualiza → zera → recalcula)", async () => {
    mockDb.tables.bolao_pools = [{ championship_id: "c1" }];
    supabaseMock.rpc.mockClear();
    expect(await updatePoolGoalBase("p1", "regular")).toEqual({ error: null });
    expect(rpcCalls().slice(0, 2)).toEqual(["update_pool_goal_base", "reset_pool_scores"]);
    supabaseMock.rpc.mockClear();
    expect(await updatePoolStageMultipliers("p1", { FINAL: 2 })).toEqual({ error: null });
    expect(rpcCalls().slice(0, 2)).toEqual(["update_pool_stage_multipliers", "reset_pool_scores"]);
    expect(supabaseMock.rpc.mock.calls[0][1]).toEqual({ p_pool_id: "p1", p_stage_multipliers: { FINAL: 2 } });
  });

  it("variação de posição só chama a RPC (não mexe nos pontos)", async () => {
    supabaseMock.rpc.mockClear();
    expect(await updatePoolVariationMode("p1", "round")).toEqual({ error: null });
    expect(rpcCalls()).toEqual(["update_pool_variation_mode"]);
    mockDb.errors["rpc:update_pool_variation_mode"] = { message: "x" };
    expect(await updatePoolVariationMode("p1", "off")).toEqual({ error: "x" });
  });

  it("fetchKnockoutStages devolve só as fases que existem, na ordem do mata-mata", async () => {
    mockDb.tables.bolao_matches = [{ stage: "FINAL" }, { stage: "LAST_16" }, { stage: "LAST_16" }, { stage: "GROUP_STAGE" }];
    expect(await fetchKnockoutStages("c1")).toEqual(["LAST_16", "FINAL"]);
  });
  it("fetchKnockoutStages com erro = vazio", async () => {
    mockDb.errors.bolao_matches = { message: "x" };
    expect(await fetchKnockoutStages("c1")).toEqual([]);
  });
});
