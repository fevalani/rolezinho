import type {
  UserPredictionDetail,
  LeaderboardEntry,
  RoundLeaderboard,
  BolaoPoolMember,
  BolaoPool,
} from "./bolaoService";

// ─── Tipos de saída ──────────────────────────────────────────────

export interface StatUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RankedStatUser extends StatUser {
  count: number;
}

export interface ScoreTypeRankings {
  exact: RankedStatUser[];
  winnerGoals: RankedStatUser[];
  saldo: RankedStatUser[];
  winner: RankedStatUser[];
  draw: RankedStatUser[];
  zero: RankedStatUser[];
  bold: RankedStatUser[]; // palpites com mais de 4 gols no total (goleada)
}

export interface EfficiencyEntry extends StatUser {
  pts: number;
  max: number;
  pct: number;
  participated: number;
  participatedMax: number;
  pctParticipated: number;
}

export interface RoundHero {
  round_label: string;
  hero: StatUser & { points: number };
}

export interface PositionPoint {
  matchIdx: number;
  label: string; // "R1 #3" ou data abreviada
  [userId: string]: number | string;
}

export interface MatchInsights {
  mostControversial: { label: string; uniquePreds: number } | null;
  mostConsensus: { label: string; topPred: string; count: number } | null;
  mostGenerous: { label: string; totalPts: number } | null;
  mostExpensive: { label: string; zeroCount: number } | null;
}

export interface PredictionProfile {
  avgHome: number;
  avgAway: number;
  maxPts: number;
  streak: number;       // sequência ativa de palpites pontuando
  topStreak: number;    // maior sequência histórica
  participationPct: number;
  style: "atacante" | "defensivo" | "equilibrado";
}

export interface H2HResult {
  userA: StatUser & { pts: number; wins: number };
  userB: StatUser & { pts: number; wins: number };
  rounds: { label: string; ptsA: number; ptsB: number }[];
}

// ─── Helpers internos ────────────────────────────────────────────

function matchLabel(p: UserPredictionDetail): string {
  return `${p.home_team ?? "?"} x ${p.away_team ?? "?"}`;
}

function hasResult(p: UserPredictionDetail): boolean {
  return p.score_home !== null && p.score_away !== null;
}

function classifyPred(p: UserPredictionDetail): "exact" | "draw" | "winnerGoals" | "saldo" | "winner" | "zero" | null {
  if (!hasResult(p) || p.points_earned === null) return null;
  const sh = p.score_home!;
  const sa = p.score_away!;
  const ph = p.pred_home;
  const pa = p.pred_away;

  if (ph === sh && pa === sa) return "exact";
  if (p.points_earned === 0) return "zero";

  const realResult = sh > sa ? "home" : sh < sa ? "away" : "draw";
  const predResult = ph > pa ? "home" : ph < pa ? "away" : "draw";
  if (realResult !== predResult) return "zero";
  if (realResult === "draw") return "draw";

  const winnerGoalsCorrect = realResult === "home" ? ph === sh : pa === sa;
  if (winnerGoalsCorrect) return "winnerGoals";

  const saldoCorrect = (ph - pa) === (sh - sa);
  if (saldoCorrect) return "saldo";

  return "winner";
}

// ─── 1. Evolução de posição ──────────────────────────────────────

export function computePositionEvolution(
  allUserPredictions: Map<string, UserPredictionDetail[]>,
  members: BolaoPoolMember[],
): PositionPoint[] {
  // Reúne todas as partidas com resultado, ordenadas por data
  const matchSet = new Map<string, { utc_date: string; label: string }>();
  for (const preds of allUserPredictions.values()) {
    for (const p of preds) {
      if (hasResult(p) && !matchSet.has(p.match_id)) {
        matchSet.set(p.match_id, {
          utc_date: p.utc_date,
          label: matchLabel(p),
        });
      }
    }
  }

  const sortedMatches = [...matchSet.entries()].sort(
    (a, b) => new Date(a[1].utc_date).getTime() - new Date(b[1].utc_date).getTime(),
  );

  if (sortedMatches.length === 0) return [];

  // Acumula pontos por usuário partida a partida
  const accPts = new Map<string, number>(members.map((m) => [m.user_id, 0]));
  const predByUserMatch = new Map<string, Map<string, UserPredictionDetail>>();
  for (const [userId, preds] of allUserPredictions) {
    predByUserMatch.set(userId, new Map(preds.map((p) => [p.match_id, p])));
  }

  const points: PositionPoint[] = [];

  sortedMatches.forEach(([matchId], idx) => {
    for (const userId of accPts.keys()) {
      const pred = predByUserMatch.get(userId)?.get(matchId);
      accPts.set(userId, (accPts.get(userId) ?? 0) + (pred?.points_earned ?? 0));
    }

    // Calcula posições — desempate por pontos (1 = primeiro)
    const sorted = [...accPts.entries()].sort((a, b) => b[1] - a[1]);
    const point: PositionPoint = { matchIdx: idx + 1, label: `#${idx + 1}` };
    let pos = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][1] < sorted[i - 1][1]) pos = i + 1;
      point[sorted[i][0]] = pos;
    }
    points.push(point);
  });

  return points;
}

// ─── 2. Rankings por tipo de pontuação ───────────────────────────

export function computeScoreTypeRankings(
  allUserPredictions: Map<string, UserPredictionDetail[]>,
  members: BolaoPoolMember[],
): ScoreTypeRankings {
  const counters = new Map<string, { exact: number; winnerGoals: number; saldo: number; winner: number; draw: number; zero: number; bold: number }>();
  for (const m of members) {
    counters.set(m.user_id, { exact: 0, winnerGoals: 0, saldo: 0, winner: 0, draw: 0, zero: 0, bold: 0 });
  }

  for (const [userId, preds] of allUserPredictions) {
    const c = counters.get(userId);
    if (!c) continue;
    for (const p of preds) {
      const type = classifyPred(p);
      if (!type) continue;
      if (type === "exact") c.exact++;
      else if (type === "winnerGoals") c.winnerGoals++;
      else if (type === "saldo") c.saldo++;
      else if (type === "winner") c.winner++;
      else if (type === "draw") c.draw++;
      else if (type === "zero") c.zero++;
      // goleada: soma de gols chutados > 4
      if (hasResult(p) && p.pred_home + p.pred_away > 4) c.bold++;
    }
  }

  const profileMap = new Map(members.map((m) => [m.user_id, m.profile]));

  const toRanked = (_key: string, getValue: (c: ReturnType<typeof counters.get>) => number): RankedStatUser[] =>
    [...counters.entries()]
      .map(([userId, c]) => ({
        userId,
        displayName: profileMap.get(userId)?.display_name ?? "?",
        avatarUrl: profileMap.get(userId)?.avatar_url ?? null,
        count: getValue(c),
      }))
      .sort((a, b) => b.count - a.count);

  return {
    exact: toRanked("exact", (c) => c?.exact ?? 0),
    winnerGoals: toRanked("winnerGoals", (c) => c?.winnerGoals ?? 0),
    saldo: toRanked("saldo", (c) => c?.saldo ?? 0),
    winner: toRanked("winner", (c) => c?.winner ?? 0),
    draw: toRanked("draw", (c) => c?.draw ?? 0),
    zero: toRanked("zero", (c) => c?.zero ?? 0),
    bold: toRanked("bold", (c) => c?.bold ?? 0),
  };
}

// ─── 3. Aproveitamento ───────────────────────────────────────────

export function computeEfficiency(
  allUserPredictions: Map<string, UserPredictionDetail[]>,
  leaderboard: LeaderboardEntry[],
  pool: BolaoPool | null,
): EfficiencyEntry[] {
  // Pontuação máxima por cravada
  const maxPerMatch =
    pool?.scoring_model === "custom"
      ? (pool.scoring_config?.exact ?? 15)
      : 15;

  // Partidas com resultado já pontuadas (base comum)
  const finishedMatchIds = new Set<string>();
  for (const preds of allUserPredictions.values()) {
    for (const p of preds) {
      if (hasResult(p) && p.points_earned !== null) finishedMatchIds.add(p.match_id);
    }
  }
  const maxPossible = finishedMatchIds.size * maxPerMatch;

  return leaderboard
    .map((e) => {
      const userPreds = allUserPredictions.get(e.user_id) ?? [];
      const participated = userPreds.filter((p) => hasResult(p) && p.points_earned !== null).length;
      const participatedMax = participated * maxPerMatch;
      return {
        userId: e.user_id,
        displayName: e.display_name,
        avatarUrl: e.avatar_url,
        pts: e.total_points,
        max: maxPossible,
        pct: maxPossible > 0 ? Math.round((e.total_points / maxPossible) * 100) : 0,
        participated,
        participatedMax,
        pctParticipated: participatedMax > 0 ? Math.round((e.total_points / participatedMax) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ─── 4. Herói por rodada ─────────────────────────────────────────

export function computeRoundHeroes(
  roundLeaderboards: RoundLeaderboard[],
  members: BolaoPoolMember[],
): RoundHero[] {
  const profileMap = new Map(members.map((m) => [m.user_id, m.profile]));

  return roundLeaderboards
    .map((rl) => {
      const top = rl.entries[0];
      if (!top) return null;
      const profile = profileMap.get(top.user_id);
      return {
        round_label: rl.round_label,
        hero: {
          userId: top.user_id,
          displayName: profile?.display_name ?? top.display_name,
          avatarUrl: profile?.avatar_url ?? top.avatar_url,
          points: top.total_points,
        },
      };
    })
    .filter(Boolean) as RoundHero[];
}

// ─── 5. Perfil de palpiteiro ─────────────────────────────────────

export function computePredictionProfile(
  preds: UserPredictionDetail[],
  totalFinishedMatches: number,
): PredictionProfile {
  const withResult = preds.filter(hasResult);
  if (withResult.length === 0) {
    return { avgHome: 0, avgAway: 0, maxPts: 0, streak: 0, topStreak: 0, participationPct: 0, style: "equilibrado" };
  }

  const avgHome = withResult.reduce((s, p) => s + p.pred_home, 0) / withResult.length;
  const avgAway = withResult.reduce((s, p) => s + p.pred_away, 0) / withResult.length;
  const maxPts = Math.max(...withResult.map((p) => p.points_earned ?? 0));

  // Streaks — sequência de partidas consecutivas com pontuação > 0
  let streak = 0;
  let topStreak = 0;
  let cur = 0;
  const sorted = [...withResult].sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime());
  for (const p of sorted) {
    if ((p.points_earned ?? 0) > 0) {
      cur++;
      if (cur > topStreak) topStreak = cur;
    } else {
      cur = 0;
    }
  }
  // Streak ativo = sequência do final da lista
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].points_earned ?? 0) > 0) streak++;
    else break;
  }

  const participationPct = totalFinishedMatches > 0
    ? Math.round((withResult.length / totalFinishedMatches) * 100)
    : 0;

  const diff = avgHome - avgAway;
  const style: PredictionProfile["style"] =
    diff > 0.5 ? "atacante" : diff < -0.5 ? "defensivo" : "equilibrado";

  return { avgHome, avgAway, maxPts, streak, topStreak, participationPct, style };
}

// ─── 6. Curiosidades de partidas ─────────────────────────────────

export function computeMatchInsights(
  allUserPredictions: Map<string, UserPredictionDetail[]>,
): MatchInsights {
  // Agrupa palpites por partida
  const byMatch = new Map<string, { label: string; preds: UserPredictionDetail[] }>();
  for (const preds of allUserPredictions.values()) {
    for (const p of preds) {
      if (!hasResult(p)) continue;
      if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, { label: matchLabel(p), preds: [] });
      byMatch.get(p.match_id)!.preds.push(p);
    }
  }

  if (byMatch.size === 0) return { mostControversial: null, mostConsensus: null, mostGenerous: null, mostExpensive: null };

  let mostControversial: MatchInsights["mostControversial"] = null;
  let mostConsensus: MatchInsights["mostConsensus"] = null;
  let mostGenerous: MatchInsights["mostGenerous"] = null;
  let mostExpensive: MatchInsights["mostExpensive"] = null;

  for (const { label, preds } of byMatch.values()) {
    if (preds.length === 0) continue;

    // Polêmica: nº de palpites únicos
    const uniquePreds = new Set(preds.map((p) => `${p.pred_home}-${p.pred_away}`)).size;
    if (!mostControversial || uniquePreds > mostControversial.uniquePreds) {
      mostControversial = { label, uniquePreds };
    }

    // Consenso: palpite mais repetido
    const freq = new Map<string, number>();
    for (const p of preds) {
      const key = `${p.pred_home}-${p.pred_away}`;
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    const [topKey, topCount] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!mostConsensus || topCount > mostConsensus.count) {
      mostConsensus = { label, topPred: topKey.replace("-", " × "), count: topCount };
    }

    // Generosa: total de pontos distribuídos
    const totalPts = preds.reduce((s, p) => s + (p.points_earned ?? 0), 0);
    if (!mostGenerous || totalPts > mostGenerous.totalPts) {
      mostGenerous = { label, totalPts };
    }

    // Cara: mais zeros
    const zeroCount = preds.filter((p) => (p.points_earned ?? 0) === 0).length;
    if (!mostExpensive || zeroCount > mostExpensive.zeroCount) {
      mostExpensive = { label, zeroCount };
    }
  }

  return { mostControversial, mostConsensus, mostGenerous, mostExpensive };
}

// ─── 7. Confronto direto H2H ─────────────────────────────────────

export function computeH2H(
  _allUserPredictions: Map<string, UserPredictionDetail[]>,
  roundLeaderboards: RoundLeaderboard[],
  members: BolaoPoolMember[],
  userAId: string,
  userBId: string,
): H2HResult | null {
  const profileMap = new Map(members.map((m) => [m.user_id, m.profile]));
  const profA = profileMap.get(userAId);
  const profB = profileMap.get(userBId);
  if (!profA || !profB) return null;

  let ptsA = 0, ptsB = 0, winsA = 0, winsB = 0;
  const rounds: H2HResult["rounds"] = [];

  for (const rl of roundLeaderboards) {
    const entryA = rl.entries.find((e) => e.user_id === userAId);
    const entryB = rl.entries.find((e) => e.user_id === userBId);
    const rA = entryA?.total_points ?? 0;
    const rB = entryB?.total_points ?? 0;
    ptsA += rA;
    ptsB += rB;
    if (rA > rB) winsA++;
    else if (rB > rA) winsB++;
    rounds.push({ label: rl.round_label, ptsA: rA, ptsB: rB });
  }

  return {
    userA: { userId: userAId, displayName: profA.display_name, avatarUrl: profA.avatar_url, pts: ptsA, wins: winsA },
    userB: { userId: userBId, displayName: profB.display_name, avatarUrl: profB.avatar_url, pts: ptsB, wins: winsB },
    rounds,
  };
}
