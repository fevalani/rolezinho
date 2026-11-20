import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isMatchLocked,
  withRecomputedLocks,
  snapshotSignature,
  computePositionVariations,
  getScoringDisplay,
  fetchAllPools,
  fetchPoolById,
  fetchPoolMembers,
  joinPool,
  leavePool,
  createPool,
  DEFAULT_CUSTOM_CONFIG,
  type BolaoSnapshot,
  type LeaderboardEntry,
  type UserPredictionDetail,
  type RoundGroup,
} from "@/features/bolao/bolaoService";
import { mockDb, supabaseMock } from "./supabaseMock";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isMatchLocked", () => {
  const NOW = new Date("2026-06-10T12:00:00Z");
  const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const lock = (min: number, status = "SCHEDULED", h: string | null = "A", a: string | null = "B") => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    return isMatchLocked(at(min), status, h, a);
  };
  it("aberto até 1 minuto antes do jogo", () => {
    expect(lock(30)).toBe(false);
    expect(lock(2)).toBe(false);
    expect(lock(1)).toBe(false);
    expect(lock(0.5)).toBe(true);
    expect(lock(-10)).toBe(true);
  });
  it("só TIMED/SCHEDULED aceitam palpite", () => {
    expect(lock(60, "TIMED")).toBe(false);
    for (const s of ["IN_PLAY", "PAUSED", "FINISHED", "POSTPONED", "CANCELLED"]) expect(lock(60, s)).toBe(true);
  });
  it("times a definir travam o jogo", () => {
    expect(lock(60, "SCHEDULED", "A definir", "B")).toBe(true);
    expect(lock(60, "SCHEDULED", "A", null)).toBe(true);
  });
  it("withRecomputedLocks reavalia o bloqueio pelo relógio", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const rounds = [
      { round_label: "R1", matches: [{ id: "m1", utc_date: at(-5), status: "SCHEDULED", home_team: "A", away_team: "B", is_locked: false }] },
    ] as unknown as RoundGroup[];
    expect(withRecomputedLocks(rounds)[0].matches[0].is_locked).toBe(true);
  });
});

describe("computePositionVariations", () => {
  const entry = (user_id: string, total_points: number): LeaderboardEntry => ({ user_id, display_name: user_id, avatar_url: null, total_points, predictions_made: 0, exact_scores: 0 });
  const pred = (match_id: string, points_earned: number) => ({ match_id, points_earned }) as UserPredictionDetail;
  const m = (id: string, round_label: string, utc_date: string) => ({ id, round_label, utc_date, status: "FINISHED", score_home: 1, score_away: 0 });
  // a: 10 antes da última partida + 0; b: 0 antes + 15 na última → b ultrapassa a
  const entries = [entry("b", 15), entry("a", 10)];
  const preds = new Map([
    ["a", [pred("j1", 10), pred("j2", 0)]],
    ["b", [pred("j1", 0), pred("j2", 15)]],
  ]);
  const matches = [m("j1", "R1", "2026-06-01T12:00:00Z"), m("j2", "R2", "2026-06-02T12:00:00Z")];

  it("desligado ou sem dados = vazio", () => {
    expect(computePositionVariations(entries, preds, matches, "off").size).toBe(0);
    expect(computePositionVariations([], preds, matches, "match").size).toBe(0);
    expect(computePositionVariations(entries, preds, [], "match").size).toBe(0);
  });
  it("por partida: quem subiu tem delta positivo e quem desceu, negativo", () => {
    const v = computePositionVariations(entries, preds, matches, "match");
    expect(v.get("b")).toBe(1);
    expect(v.get("a")).toBe(-1);
  });
  it("por rodada compara com o fim da rodada anterior", () => {
    const v = computePositionVariations(entries, preds, matches, "round");
    expect(v.get("b")).toBe(1);
  });
  it("quem não mudou de posição fica de fora", () => {
    const e2 = [entry("a", 20), entry("b", 15)];
    const p2 = new Map([["a", [pred("j1", 10), pred("j2", 10)]], ["b", [pred("j1", 5), pred("j2", 10)]]]);
    expect(computePositionVariations(e2, p2, matches, "match").size).toBe(0);
  });
});

describe("snapshotSignature", () => {
  const snap = (over: Partial<BolaoSnapshot> = {}): BolaoSnapshot => ({
    pool: { scoring_model: "classic", variation_mode: "off", goal_base: "extra_time", member_count: 2 } as BolaoSnapshot["pool"],
    rounds: [{ round_label: "R1", matches: [{ id: "m1", status: "SCHEDULED", score_home: null, score_away: null, utc_date: "d", updated_at: "u", is_locked: false }] }] as unknown as BolaoSnapshot["rounds"],
    members: [],
    leaderboard: [{ user_id: "a", total_points: 5 } as LeaderboardEntry],
    roundLeaderboards: [],
    userPredictions: [["a", [{ match_id: "m1", pred_home: 1, pred_away: 0, points_earned: null } as UserPredictionDetail]]],
    ...over,
  });
  it("snapshots iguais têm a mesma assinatura", () => {
    expect(snapshotSignature(snap())).toBe(snapshotSignature(snap()));
  });
  it("muda quando muda placar, pontos, palpite ou configuração", () => {
    const base = snapshotSignature(snap());
    const r = snap();
    (r.rounds[0].matches[0] as { score_home: number | null }).score_home = 2;
    expect(snapshotSignature(r)).not.toBe(base);
    expect(snapshotSignature(snap({ leaderboard: [{ user_id: "a", total_points: 6 } as LeaderboardEntry] }))).not.toBe(base);
    const p = snap();
    p.userPredictions[0][1][0].pred_home = 3;
    expect(snapshotSignature(p)).not.toBe(base);
    const c = snap();
    (c.pool as { variation_mode: string }).variation_mode = "match";
    expect(snapshotSignature(c)).not.toBe(base);
  });
  it("NÃO muda só porque o relógio fechou o jogo (is_locked fica fora)", () => {
    const base = snapshotSignature(snap());
    const s = snap();
    (s.rounds[0].matches[0] as { is_locked: boolean }).is_locked = true;
    expect(snapshotSignature(s)).toBe(base);
  });
});

describe("getScoringDisplay", () => {
  it("custom usa os pontos configurados; sem config usa o padrão", () => {
    const d = getScoringDisplay("custom", { ...DEFAULT_CUSTOM_CONFIG, exact: 99 });
    expect(d.label).toBe("Personalizado");
    expect(d.rules.some(([, pts]) => pts === "99 pts")).toBe(true);
    expect(getScoringDisplay("custom").rules.some(([, pts]) => pts === `${DEFAULT_CUSTOM_CONFIG.exact} pts`)).toBe(true);
  });
  it("presets têm rótulo e regras", () => {
    for (const m of ["classic", "extended", "simplified"] as const) {
      const d = getScoringDisplay(m);
      expect(d.label).toBeTruthy();
      expect(d.rules.length).toBeGreaterThan(0);
    }
  });
});

describe("bolões no banco", () => {
  const pool = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    name: "Bolão dos Amigos",
    championship_id: "c1",
    created_by: "u9",
    created_at: "",
    updated_at: "",
    bolao_championships: { id: "c1", name: "Copa", code: "WC" },
    bolao_pool_members: [{ user_id: "u1" }, { user_id: "u2" }],
    ...over,
  });
  it("fetchAllPools conta membros, marca se sou membro e aplica padrões", async () => {
    mockDb.tables.bolao_pools = [pool(), pool({ id: "p2", bolao_pool_members: [{ user_id: "u2" }], scoring_model: "extended", variation_mode: "round" })];
    const [a, b] = await fetchAllPools("u1");
    expect(a).toMatchObject({ member_count: 2, is_member: true, scoring_model: "classic", variation_mode: "off", goal_base: "extra_time", stage_multipliers: {} });
    expect(b).toMatchObject({ member_count: 1, is_member: false, scoring_model: "extended", variation_mode: "round" });
  });
  it("erro = lista vazia", async () => {
    mockDb.errors.bolao_pools = { message: "x" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchAllPools("u1")).toEqual([]);
    spy.mockRestore();
  });
  it("fetchPoolById: existente e inexistente", async () => {
    expect(await fetchPoolById("p1", "u1")).toBeNull();
    mockDb.tables.bolao_pools = [pool()];
    expect((await fetchPoolById("p1", "u2"))?.is_member).toBe(true);
    expect((await fetchPoolById("p1", "zzz"))?.is_member).toBe(false);
  });
  it("fetchPoolMembers mapeia o perfil", async () => {
    mockDb.tables.bolao_pool_members = [{ id: "m1", pool_id: "p1", user_id: "u1", joined_at: "", profiles: { id: "u1", display_name: "Ana", avatar_url: null } }];
    expect((await fetchPoolMembers("p1"))[0].profile.display_name).toBe("Ana");
  });
  it("joinPool / leavePool", async () => {
    expect(await joinPool("u1", "p1")).toEqual({ error: null });
    expect(mockDb.writes[0].args[0]).toEqual({ pool_id: "p1", user_id: "u1" });
    mockDb.errors.bolao_pool_members = { message: "dup", code: "23505" };
    expect(await joinPool("u1", "p1")).toEqual({ error: "Você já está neste bolão" });
    mockDb.errors.bolao_pool_members = { message: "rls" };
    expect(await joinPool("u1", "p1")).toEqual({ error: "rls" });
    expect(await leavePool("u1", "p1")).toEqual({ error: "rls" });
  });
  it("createPool sem partidas (API fora e banco vazio) avisa em vez de criar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    mockDb.tables.bolao_championships = [{ id: "c1", code: "BSA" }];
    const r = await createPool("Meu bolão", "BSA");
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/Nenhuma partida/);
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("create_bolao_pool", expect.anything());
    spies.forEach((s) => s.mockRestore());
  });
  it("createPool com partidas já no banco cria pelo RPC atômico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    mockDb.tables.bolao_championships = [{ id: "c1", code: "BSA" }];
    mockDb.tables.bolao_matches = [{ id: "m1" }];
    mockDb.rpcResults.create_bolao_pool = "novo-pool";
    expect(await createPool("Meu bolão", "BSA", "custom", { ...DEFAULT_CUSTOM_CONFIG, exact: 20 })).toEqual({ data: "novo-pool", error: null });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("create_bolao_pool", expect.objectContaining({ p_name: "Meu bolão", p_scoring_model: "custom" }));
    // quem cria é sempre auth.uid() no banco: o cliente não manda user_id
    expect(supabaseMock.rpc.mock.calls.find((c) => c[0] === "create_bolao_pool")![1]).not.toHaveProperty("p_user_id");
    spies.forEach((s) => s.mockRestore());
  });
  it("createPool só envia a config quando o modelo é custom", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    mockDb.tables.bolao_championships = [{ id: "c1" }];
    mockDb.tables.bolao_matches = [{ id: "m1" }];
    supabaseMock.rpc.mockClear();
    await createPool("X", "BSA", "classic", DEFAULT_CUSTOM_CONFIG);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("create_bolao_pool", expect.objectContaining({ p_scoring_config: null }));
    spies.forEach((s) => s.mockRestore());
  });
});
