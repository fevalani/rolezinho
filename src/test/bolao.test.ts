import { describe, it, expect } from "vitest";
import {
  calculatePoints,
  DEFAULT_CUSTOM_CONFIG,
  type UserPredictionDetail,
  type BolaoPoolMember,
  type LeaderboardEntry,
  type RoundLeaderboard,
  type BolaoPool,
} from "@/features/bolao/bolaoService";
import {
  computePositionEvolution,
  computeScoreTypeRankings,
  computeEfficiency,
  computeRoundHeroes,
  computePredictionProfile,
  computeMatchInsights,
  computeH2H,
} from "@/features/bolao/statsUtils";

describe("calculatePoints — presets", () => {
  it.each(["classic", "extended", "simplified"] as const)("%s: placar exato vale 15", (m) => {
    expect(calculatePoints(2, 1, 2, 1, m)).toBe(15);
    expect(calculatePoints(0, 0, 0, 0, m)).toBe(15);
  });
  it.each(["classic", "extended", "simplified"] as const)("%s: errar o resultado vale 0", (m) => {
    expect(calculatePoints(1, 0, 0, 1, m)).toBe(0);
    expect(calculatePoints(1, 1, 2, 0, m)).toBe(0);
    expect(calculatePoints(2, 0, 1, 1, m)).toBe(0);
  });
  it("empate acertado (sem placar exato): classic 10, demais 5", () => {
    expect(calculatePoints(1, 1, 2, 2, "classic")).toBe(10);
    expect(calculatePoints(1, 1, 2, 2, "extended")).toBe(5);
    expect(calculatePoints(1, 1, 2, 2, "simplified")).toBe(5);
  });
  it("vencedor + gols do vencedor", () => {
    // real 3x1, palpite 3x0 (vencedor casa, gols da casa certos)
    expect(calculatePoints(3, 0, 3, 1, "classic")).toBe(10);
    expect(calculatePoints(3, 0, 3, 1, "extended")).toBe(10);
    expect(calculatePoints(3, 0, 3, 1, "simplified")).toBe(10);
  });
  it("vencedor + gols do perdedor", () => {
    // real 3x1, palpite 2x1
    expect(calculatePoints(2, 1, 3, 1, "classic")).toBe(5);
    expect(calculatePoints(2, 1, 3, 1, "extended")).toBe(8);
    expect(calculatePoints(2, 1, 3, 1, "simplified")).toBe(10);
  });
  it("só o vencedor", () => {
    // real 3x1, palpite 2x0
    expect(calculatePoints(2, 0, 3, 1, "classic")).toBe(3);
    expect(calculatePoints(2, 0, 3, 1, "extended")).toBe(5);
    expect(calculatePoints(2, 0, 3, 1, "simplified")).toBe(5);
  });
  it("vale também quando o visitante vence", () => {
    // real 0x2, palpite 1x2 (gols do vencedor certos)
    expect(calculatePoints(1, 2, 0, 2, "classic")).toBe(10);
    // real 0x2, palpite 0x1 (gols do perdedor certos)
    expect(calculatePoints(0, 1, 0, 2, "classic")).toBe(5);
  });
  it("sem modelo informado usa o clássico", () => {
    expect(calculatePoints(2, 0, 3, 1)).toBe(3);
  });
});

describe("calculatePoints — personalizado", () => {
  const cfg = { exact: 20, winner_goals: 12, loser_goals: 7, winner_saldo: 6, winner: 2, draw: 9, wrong: -1 };
  it("usa cada categoria do config", () => {
    expect(calculatePoints(2, 1, 2, 1, "custom", cfg)).toBe(20); // exato
    expect(calculatePoints(1, 1, 2, 2, "custom", cfg)).toBe(9); // empate
    expect(calculatePoints(0, 1, 2, 0, "custom", cfg)).toBe(-1); // erro
    expect(calculatePoints(3, 0, 3, 1, "custom", cfg)).toBe(12); // gols do vencedor
    expect(calculatePoints(2, 1, 3, 1, "custom", cfg)).toBe(7); // gols do perdedor
    expect(calculatePoints(2, 0, 4, 2, "custom", cfg)).toBe(6); // saldo (2 = 2)
    expect(calculatePoints(5, 0, 3, 1, "custom", cfg)).toBe(2); // só vencedor
  });
  it("sem config usa o padrão", () => {
    expect(calculatePoints(2, 1, 2, 1, "custom", null)).toBe(DEFAULT_CUSTOM_CONFIG.exact);
    expect(calculatePoints(5, 0, 3, 1, "custom")).toBe(DEFAULT_CUSTOM_CONFIG.winner);
  });
});

// ── estatísticas ──────────────────────────────────────────────

const member = (id: string, name: string): BolaoPoolMember => ({
  id: `m-${id}`,
  pool_id: "p1",
  user_id: id,
  joined_at: "",
  profile: { id, display_name: name, avatar_url: null },
});
const A = member("a", "Ana");
const B = member("b", "Bia");

let n = 0;
const pred = (over: Partial<UserPredictionDetail>): UserPredictionDetail => ({
  match_id: `m${++n}`,
  home_team: "Casa",
  away_team: "Fora",
  home_crest: null,
  away_crest: null,
  round_label: "R1",
  utc_date: "2026-06-01T12:00:00Z",
  score_home: 2,
  score_away: 1,
  pred_home: 2,
  pred_away: 1,
  points_earned: 15,
  ...over,
});
const map = (o: Record<string, UserPredictionDetail[]>) => new Map(Object.entries(o));

describe("computeScoreTypeRankings", () => {
  it("classifica cada palpite e ordena por quantidade", () => {
    const r = computeScoreTypeRankings(
      map({
        a: [
          pred({ pred_home: 2, pred_away: 1, score_home: 2, score_away: 1, points_earned: 15 }), // exato
          pred({ pred_home: 3, pred_away: 0, score_home: 3, score_away: 1, points_earned: 10 }), // gols vencedor
          pred({ pred_home: 1, pred_away: 1, score_home: 2, score_away: 2, points_earned: 10 }), // empate
        ],
        b: [
          pred({ pred_home: 0, pred_away: 1, score_home: 2, score_away: 0, points_earned: 0 }), // zero
          pred({ pred_home: 1, pred_away: 0, score_home: 3, score_away: 1, points_earned: 3 }), // só vencedor
          pred({ pred_home: 2, pred_away: 0, score_home: 3, score_away: 1, points_earned: 3 }), // saldo
        ],
      }),
      [A, B],
    );
    expect(r.exact[0]).toMatchObject({ userId: "a", count: 1 });
    expect(r.winnerGoals[0]).toMatchObject({ userId: "a", count: 1 });
    expect(r.draw[0]).toMatchObject({ userId: "a", count: 1 });
    expect(r.zero[0]).toMatchObject({ userId: "b", count: 1 });
    expect(r.winner[0]).toMatchObject({ userId: "b", count: 1 });
    expect(r.saldo[0]).toMatchObject({ userId: "b", count: 1 });
    expect(r.exact[0].displayName).toBe("Ana");
  });
  it("ignora jogos sem resultado e conta goleada (>4 gols chutados)", () => {
    const r = computeScoreTypeRankings(
      map({
        a: [
          pred({ score_home: null, score_away: null, points_earned: null }),
          pred({ pred_home: 4, pred_away: 1, score_home: 4, score_away: 1 }),
        ],
      }),
      [A],
    );
    expect(r.exact[0].count).toBe(1);
    expect(r.bold[0].count).toBe(1);
  });
  it("ignora usuários que não são membros", () => {
    const r = computeScoreTypeRankings(map({ x: [pred({})] }), [A]);
    expect(r.exact).toHaveLength(1);
    expect(r.exact[0].count).toBe(0);
  });
});

describe("computeEfficiency", () => {
  const lb = (id: string, pts: number): LeaderboardEntry => ({
    user_id: id,
    display_name: id,
    avatar_url: null,
    total_points: pts,
    predictions_made: 0,
    exact_scores: 0,
  });
  const preds = map({
    a: [pred({ match_id: "x1" }), pred({ match_id: "x2" })],
    b: [pred({ match_id: "x1" })],
  });
  it("percentual sobre o máximo possível (15 por jogo encerrado)", () => {
    const r = computeEfficiency(preds, [lb("a", 15), lb("b", 30)], null);
    const b = r.find((e) => e.userId === "b")!;
    expect(b.max).toBe(30);
    expect(b.pct).toBe(100);
    expect(r[0].userId).toBe("b"); // ordenado por pct
    const a = r.find((e) => e.userId === "a")!;
    expect(a.pct).toBe(50);
    expect(a.participated).toBe(2);
    expect(a.pctParticipated).toBe(50);
  });
  it("modelo custom usa o 'exact' como máximo", () => {
    const pool = { scoring_model: "custom", scoring_config: { exact: 20 } } as unknown as BolaoPool;
    const r = computeEfficiency(preds, [lb("a", 20)], pool);
    expect(r[0].max).toBe(40);
    expect(r[0].pct).toBe(50);
  });
  it("sem jogos encerrados = 0%, sem dividir por zero", () => {
    const r = computeEfficiency(new Map(), [lb("a", 0)], null);
    expect(r[0]).toMatchObject({ max: 0, pct: 0, pctParticipated: 0 });
  });
});

describe("computeRoundHeroes", () => {
  it("pega o 1º colocado de cada rodada e ignora rodadas vazias", () => {
    const e = (id: string, pts: number): LeaderboardEntry => ({
      user_id: id,
      display_name: id.toUpperCase(),
      avatar_url: null,
      total_points: pts,
      predictions_made: 0,
      exact_scores: 0,
    });
    const rounds: RoundLeaderboard[] = [
      { round_label: "R1", entries: [e("a", 30), e("b", 10)] },
      { round_label: "R2", entries: [] },
      { round_label: "R3", entries: [e("b", 25)] },
    ];
    const r = computeRoundHeroes(rounds, [A, B]);
    expect(r.map((h) => h.round_label)).toEqual(["R1", "R3"]);
    expect(r[0].hero).toMatchObject({ userId: "a", displayName: "Ana", points: 30 });
    expect(r[1].hero.userId).toBe("b");
  });
});

describe("computePositionEvolution", () => {
  it("sem resultados devolve vazio", () => {
    expect(computePositionEvolution(new Map(), [A, B])).toEqual({ positions: [], scores: [] });
  });
  it("acumula pontos por partida em ordem de data e calcula posições com empate", () => {
    const m1 = { match_id: "j1", utc_date: "2026-06-01T12:00:00Z" };
    const m2 = { match_id: "j2", utc_date: "2026-06-02T12:00:00Z" };
    const r = computePositionEvolution(
      map({
        a: [pred({ ...m2, points_earned: 0 }), pred({ ...m1, points_earned: 10 })],
        b: [pred({ ...m1, points_earned: 10 }), pred({ ...m2, points_earned: 5 })],
      }),
      [A, B],
    );
    expect(r.scores).toEqual([
      { matchIdx: 1, label: "#1", a: 10, b: 10 },
      { matchIdx: 2, label: "#2", a: 10, b: 15 },
    ]);
    expect(r.positions[0]).toMatchObject({ a: 1, b: 1 }); // empatados
    expect(r.positions[1]).toMatchObject({ b: 1, a: 2 });
  });
});

describe("computePredictionProfile", () => {
  it("sem partidas com resultado = perfil zerado", () => {
    expect(computePredictionProfile([pred({ score_home: null, score_away: null })], 5)).toEqual({
      avgHome: 0,
      avgAway: 0,
      maxPts: 0,
      streak: 0,
      topStreak: 0,
      participationPct: 0,
      style: "equilibrado",
    });
  });
  it("médias, sequência atual, maior sequência e participação", () => {
    const d = (day: number) => `2026-06-0${day}T12:00:00Z`;
    const r = computePredictionProfile(
      [
        pred({ utc_date: d(1), pred_home: 3, pred_away: 0, points_earned: 10 }),
        pred({ utc_date: d(2), pred_home: 2, pred_away: 0, points_earned: 5 }),
        pred({ utc_date: d(3), pred_home: 1, pred_away: 0, points_earned: 0 }),
        pred({ utc_date: d(4), pred_home: 2, pred_away: 0, points_earned: 3 }),
      ],
      8,
    );
    expect(r.avgHome).toBe(2);
    expect(r.avgAway).toBe(0);
    expect(r.maxPts).toBe(10);
    expect(r.topStreak).toBe(2);
    expect(r.streak).toBe(1);
    expect(r.participationPct).toBe(50);
    expect(r.style).toBe("atacante");
  });
  it("estilo defensivo e equilibrado", () => {
    expect(computePredictionProfile([pred({ pred_home: 0, pred_away: 2 })], 1).style).toBe("defensivo");
    expect(computePredictionProfile([pred({ pred_home: 1, pred_away: 1 })], 1).style).toBe("equilibrado");
  });
});

describe("computeMatchInsights", () => {
  it("sem resultados = tudo nulo", () => {
    expect(computeMatchInsights(new Map())).toEqual({
      mostControversial: null,
      mostConsensus: null,
      mostGenerous: null,
      mostExpensive: null,
    });
  });
  it("encontra a partida mais polêmica, de consenso, generosa e cara", () => {
    const j1 = { match_id: "j1", home_team: "A", away_team: "B" };
    const j2 = { match_id: "j2", home_team: "C", away_team: "D" };
    const r = computeMatchInsights(
      map({
        a: [pred({ ...j1, pred_home: 1, pred_away: 0, points_earned: 0 }), pred({ ...j2, pred_home: 2, pred_away: 1, points_earned: 15 })],
        b: [pred({ ...j1, pred_home: 2, pred_away: 2, points_earned: 0 }), pred({ ...j2, pred_home: 2, pred_away: 1, points_earned: 15 })],
      }),
    );
    expect(r.mostControversial).toEqual({ label: "A x B", uniquePreds: 2 });
    expect(r.mostConsensus).toEqual({ label: "C x D", topPred: "2 × 1", count: 2 });
    expect(r.mostGenerous).toEqual({ label: "C x D", totalPts: 30 });
    expect(r.mostExpensive).toEqual({ label: "A x B", zeroCount: 2 });
  });
});

describe("computeH2H", () => {
  const e = (id: string, pts: number): LeaderboardEntry => ({
    user_id: id,
    display_name: id,
    avatar_url: null,
    total_points: pts,
    predictions_made: 0,
    exact_scores: 0,
  });
  const rounds: RoundLeaderboard[] = [
    { round_label: "R1", entries: [e("a", 20), e("b", 10)] },
    { round_label: "R2", entries: [e("b", 15)] },
    { round_label: "R3", entries: [e("a", 5), e("b", 5)] },
  ];
  it("soma pontos e vitórias por rodada (ausente = 0, empate não conta vitória)", () => {
    const r = computeH2H(new Map(), rounds, [A, B], "a", "b")!;
    expect(r.userA).toMatchObject({ displayName: "Ana", pts: 25, wins: 1 });
    expect(r.userB).toMatchObject({ displayName: "Bia", pts: 30, wins: 1 });
    expect(r.rounds[1]).toEqual({ label: "R2", ptsA: 0, ptsB: 15 });
  });
  it("usuário que não é membro = null", () => {
    expect(computeH2H(new Map(), rounds, [A], "a", "zzz")).toBeNull();
  });
});
