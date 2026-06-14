import { supabase } from "@/lib/supabase";
import {
  fetchChampionshipMatches,
  fetchMatchResult,
  toRoundLabel,
  KNOCKOUT_STAGE_ORDER,
  CHAMPIONSHIPS_CONFIG,
  type ChampionshipCode,
  type FDMatch,
} from "./footballApi";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type { ChampionshipCode };

// ── Modelos de pontuação ─────────────────────────────────────
export type PresetScoringModel = "classic" | "extended" | "simplified";
export type ScoringModel = PresetScoringModel | "custom";

// Configuração de pontos do modelo personalizado.
// Cada chave corresponde a uma categoria de acerto.
export interface CustomScoringConfig {
  exact: number; // Placar exato
  winner_goals: number; // Vencedor + Gols do Vencedor
  loser_goals: number; // Vencedor + Gols do Perdedor
  winner_saldo: number; // Vencedor + Saldo de gols
  winner: number; // Vencedor
  draw: number; // Empate
  wrong: number; // Erro
}

export const DEFAULT_CUSTOM_CONFIG: CustomScoringConfig = {
  exact: 15,
  winner_goals: 10,
  loser_goals: 5,
  winner_saldo: 4,
  winner: 3,
  draw: 10,
  wrong: 0,
};

// Metadados das categorias do modelo personalizado (ordem = precedência de acerto).
export const CUSTOM_SCORING_CATEGORIES: {
  key: keyof CustomScoringConfig;
  icon: string;
  label: string;
}[] = [
  { key: "exact", icon: "🎯", label: "Placar exato" },
  { key: "winner_goals", icon: "✅", label: "Vencedor + Gols do Vencedor" },
  { key: "loser_goals", icon: "🔸", label: "Vencedor + Gols do Perdedor" },
  { key: "winner_saldo", icon: "➗", label: "Vencedor + Saldo de gols" },
  { key: "winner", icon: "📌", label: "Vencedor" },
  { key: "draw", icon: "🤝", label: "Empate" },
  { key: "wrong", icon: "❌", label: "Erro" },
];

export const SCORING_MODELS: Record<
  PresetScoringModel,
  { label: string; rules: [string, string, string][] }
> = {
  classic: {
    label: "Clássico",
    rules: [
      ["🎯", "15 pts", "Placar exato"],
      ["✅", "10 pts", "Gols do vencedor ou empate (gols diferentes)"],
      ["🔸", "5 pts", "Gols do perdedor"],
      ["📌", "3 pts", "Vencedor certo, sem gols"],
      ["❌", "0 pts", "Erro total"],
    ],
  },
  extended: {
    label: "Extendido",
    rules: [
      ["🎯", "15 pts", "Placar exato"],
      ["✅", "10 pts", "Vencedor + Gols do vencedor"],
      ["🔸", "8 pts", "Vencedor + Gols do perdedor"],
      ["📌", "5 pts", "Vencedor ou empate sem gols"],
      ["❌", "0 pts", "Erro total"],
    ],
  },
  simplified: {
    label: "Simplificado",
    rules: [
      ["🎯", "15 pts", "Placar exato"],
      ["✅", "10 pts", "Vencedor + Gols do vencedor ou perdedor"],
      ["📌", "5 pts", "Vencedor ou empate sem gols"],
      ["❌", "0 pts", "Erro total"],
    ],
  },
};

// Retorna label + regras para exibição, suportando o modelo personalizado.
export function getScoringDisplay(
  model: ScoringModel,
  config?: CustomScoringConfig | null,
): { label: string; rules: [string, string, string][] } {
  if (model === "custom") {
    const cfg = config ?? DEFAULT_CUSTOM_CONFIG;
    return {
      label: "Personalizado",
      rules: CUSTOM_SCORING_CATEGORIES.map(
        (c) => [c.icon, `${cfg[c.key]} pts`, c.label] as [string, string, string],
      ),
    };
  }
  return SCORING_MODELS[model];
}

export interface BolaoChampionship {
  id: string;
  code: ChampionshipCode;
  name: string;
  season: string;
  emblem_url: string | null;
  fd_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BolaoMatch {
  id: string;
  championship_id: string;
  fd_match_id: number;
  home_team: string;
  home_crest: string | null;
  away_team: string;
  away_crest: string | null;
  round_label: string;
  round_number: number | null;
  stage: string;
  utc_date: string;
  status: string;
  score_home: number | null;
  score_away: number | null;
  created_at: string;
  updated_at: string;
}

export interface BolaoPool {
  id: string;
  name: string;
  championship_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  championship: BolaoChampionship;
  member_count: number;
  is_member: boolean;
  scoring_model: ScoringModel;
  scoring_config: CustomScoringConfig | null;
}

export interface BolaoPoolMember {
  id: string;
  pool_id: string;
  user_id: string;
  joined_at: string;
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface BolaoPrediction {
  id: string;
  pool_id: string;
  match_id: string;
  user_id: string;
  home_goals: number;
  away_goals: number;
  points_earned: number | null;
  created_at: string;
  updated_at: string;
}

export interface MatchWithPrediction extends BolaoMatch {
  my_prediction: Pick<BolaoPrediction, "home_goals" | "away_goals" | "points_earned"> | null;
  is_locked: boolean;
}

export interface RoundGroup {
  label: string;
  round_number: number | null;
  stage: string;
  matches: MatchWithPrediction[];
  is_visible: boolean;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  predictions_made: number;
  exact_scores: number;
}

export interface RoundLeaderboard {
  round_label: string;
  entries: LeaderboardEntry[];
}

export interface UserPredictionDetail {
  match_id: string;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  round_label: string;
  utc_date: string;
  score_home: number | null;
  score_away: number | null;
  pred_home: number;
  pred_away: number;
  points_earned: number | null;
}

// ══════════════════════════════════════════════════════════════
// Pontuação
// ══════════════════════════════════════════════════════════════

export function calculatePoints(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number,
  model: ScoringModel = "classic",
  config?: CustomScoringConfig | null,
): number {
  if (model === "custom") {
    const cfg = config ?? DEFAULT_CUSTOM_CONFIG;
    return calculateCustomPoints(predHome, predAway, realHome, realAway, cfg);
  }

  if (predHome === realHome && predAway === realAway) return 15;

  const realResult =
    realHome > realAway ? "home" : realHome < realAway ? "away" : "draw";
  const predResult =
    predHome > predAway ? "home" : predHome < predAway ? "away" : "draw";

  if (realResult !== predResult) return 0;

  if (realResult === "draw") {
    return model === "classic" ? 10 : 5;
  }

  const winnerGoalsCorrect =
    realResult === "home" ? predHome === realHome : predAway === realAway;
  const loserGoalsCorrect =
    realResult === "home" ? predAway === realAway : predHome === realHome;

  if (model === "classic") {
    if (winnerGoalsCorrect) return 10;
    if (loserGoalsCorrect) return 5;
    return 3;
  }
  if (model === "extended") {
    if (winnerGoalsCorrect) return 10;
    if (loserGoalsCorrect) return 8;
    return 5;
  }
  // simplified
  if (winnerGoalsCorrect || loserGoalsCorrect) return 10;
  return 5;
}

// Pontuação do modelo personalizado — precedência segue CUSTOM_SCORING_CATEGORIES.
function calculateCustomPoints(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number,
  cfg: CustomScoringConfig,
): number {
  if (predHome === realHome && predAway === realAway) return cfg.exact;

  const realResult =
    realHome > realAway ? "home" : realHome < realAway ? "away" : "draw";
  const predResult =
    predHome > predAway ? "home" : predHome < predAway ? "away" : "draw";

  if (realResult !== predResult) return cfg.wrong;
  if (realResult === "draw") return cfg.draw;

  const winnerGoalsCorrect =
    realResult === "home" ? predHome === realHome : predAway === realAway;
  const loserGoalsCorrect =
    realResult === "home" ? predAway === realAway : predHome === realHome;
  const saldoCorrect = predHome - predAway === realHome - realAway;

  if (winnerGoalsCorrect) return cfg.winner_goals;
  if (loserGoalsCorrect) return cfg.loser_goals;
  if (saldoCorrect) return cfg.winner_saldo;
  return cfg.winner;
}

// ══════════════════════════════════════════════════════════════
// Campeonatos
// ══════════════════════════════════════════════════════════════

export async function fetchAvailableChampionships(): Promise<
  Array<{ code: ChampionshipCode; name: string; season: string }>
> {
  return Object.entries(CHAMPIONSHIPS_CONFIG).map(([code, cfg]) => ({
    code: code as ChampionshipCode,
    name: cfg.name,
    season: cfg.season,
  }));
}

async function ensureChampionship(
  code: ChampionshipCode,
): Promise<BolaoChampionship | null> {
  const cfg = CHAMPIONSHIPS_CONFIG[code];

  const { data, error } = await supabase
    .from("bolao_championships")
    .upsert(
      {
        code,
        name: cfg.name,
        season: cfg.season,
        fd_id: cfg.fd_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    )
    .select()
    .single();

  if (error) {
    console.error("[ensureChampionship]", error);
    return null;
  }
  return data as BolaoChampionship;
}

async function syncMatches(
  championship: BolaoChampionship,
  fdMatches: FDMatch[],
): Promise<void> {
  if (!fdMatches.length) return;

  // Count before upsert to detect partial API responses (e.g. only round 1 when DB has rounds 1-3)
  const { count: preCount } = await supabase
    .from("bolao_matches")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", championship.id);

  const rows = fdMatches.map((m) => ({
    championship_id: championship.id,
    fd_match_id: m.id,
    home_team: m.homeTeam.name,
    home_crest: m.homeTeam.crest ?? null,
    away_team: m.awayTeam.name,
    away_crest: m.awayTeam.crest ?? null,
    round_label: toRoundLabel(m.stage, m.matchday),
    round_number: m.matchday ?? null,
    stage: m.stage,
    utc_date: m.utcDate,
    status: m.status,
    score_home: m.score.fullTime.home ?? null,
    score_away: m.score.fullTime.away ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("bolao_matches")
    .upsert(rows, { onConflict: "fd_match_id" });

  if (error) console.error("[syncMatches]", error);

  // Skip stale deletion when API returned fewer matches than we already have —
  // prevents partial API responses from wiping manually-inserted rounds
  if (fdMatches.length < (preCount ?? 0)) {
    console.log(`[syncMatches] API retornou ${fdMatches.length} < ${preCount} existentes. Stale cleanup ignorado para preservar rodadas inseridas manualmente.`);
    return;
  }

  // Remove partidas stale (não retornadas pela API nesta temporada) que não têm palpites
  const currentFdIds = fdMatches.map((m) => m.id);
  const { data: stale } = await supabase
    .from("bolao_matches")
    .select("id")
    .eq("championship_id", championship.id)
    .not("fd_match_id", "in", `(${currentFdIds.join(",")})`);

  if (stale && stale.length > 0) {
    const staleIds = stale.map((m: { id: string }) => m.id);
    const { data: predsOnStale } = await supabase
      .from("bolao_predictions")
      .select("match_id")
      .in("match_id", staleIds);

    const idsWithPreds = new Set((predsOnStale ?? []).map((p: { match_id: string }) => p.match_id));
    const safeToDelete = staleIds.filter((id) => !idsWithPreds.has(id));

    if (safeToDelete.length > 0) {
      await supabase.from("bolao_matches").delete().in("id", safeToDelete);
      console.log(`[syncMatches] Removidas ${safeToDelete.length} partidas stale do campeonato ${championship.code}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Pools
// ══════════════════════════════════════════════════════════════

export async function fetchAllPools(userId: string): Promise<BolaoPool[]> {
  const { data: pools, error } = await supabase
    .from("bolao_pools")
    .select("*, bolao_championships(*), bolao_pool_members(user_id)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchAllPools]", error);
    return [];
  }

  return (pools ?? []).map((p) => {
    const members = (p.bolao_pool_members ?? []) as { user_id: string }[];
    return {
      id: p.id,
      name: p.name,
      championship_id: p.championship_id,
      created_by: p.created_by,
      created_at: p.created_at,
      updated_at: p.updated_at,
      championship: p.bolao_championships as BolaoChampionship,
      member_count: members.length,
      is_member: members.some((m) => m.user_id === userId),
      scoring_model: (p.scoring_model ?? "classic") as ScoringModel,
      scoring_config: (p.scoring_config ?? null) as CustomScoringConfig | null,
    };
  });
}

export async function fetchPoolById(
  poolId: string,
  userId: string,
): Promise<BolaoPool | null> {
  const { data, error } = await supabase
    .from("bolao_pools")
    .select("*, bolao_championships(*), bolao_pool_members(user_id)")
    .eq("id", poolId)
    .maybeSingle();

  if (error || !data) return null;

  const members = (data.bolao_pool_members ?? []) as { user_id: string }[];
  return {
    id: data.id,
    name: data.name,
    championship_id: data.championship_id,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
    championship: data.bolao_championships as BolaoChampionship,
    member_count: members.length,
    is_member: members.some((m) => m.user_id === userId),
    scoring_model: (data.scoring_model ?? "classic") as ScoringModel,
    scoring_config: (data.scoring_config ?? null) as CustomScoringConfig | null,
  };
}

export async function fetchPoolMembers(
  poolId: string,
): Promise<BolaoPoolMember[]> {
  const { data, error } = await supabase
    .from("bolao_pool_members")
    .select("*, profiles(id, display_name, avatar_url)")
    .eq("pool_id", poolId)
    .order("joined_at", { ascending: true });

  if (error) return [];

  return (data ?? []).map((m) => ({
    id: m.id,
    pool_id: m.pool_id,
    user_id: m.user_id,
    joined_at: m.joined_at,
    profile: m.profiles as BolaoPoolMember["profile"],
  }));
}

export async function createPool(
  userId: string,
  name: string,
  code: ChampionshipCode,
  scoringModel: ScoringModel = "classic",
  scoringConfig: CustomScoringConfig | null = null,
): Promise<{ data: string | null; error: string | null }> {
  // 1. Garante que o campeonato existe no banco
  const championship = await ensureChampionship(code);
  if (!championship) return { data: null, error: "Erro ao criar campeonato" };

  // 2. Tenta sincronizar partidas via API; se falhar, usa o que já está no banco
  const { matches: fdMatches } = await fetchChampionshipMatches(code);
  if (fdMatches.length > 0) {
    await syncMatches(championship, fdMatches);
  } else {
    // API indisponível — verifica se o banco já tem partidas (ex: importadas via SQL)
    const { count } = await supabase
      .from("bolao_matches")
      .select("id", { count: "exact", head: true })
      .eq("championship_id", championship.id);

    if ((count ?? 0) === 0) {
      return {
        data: null,
        error: "Nenhuma partida encontrada. Importe o calendário via SQL ou tente mais tarde.",
      };
    }
    console.log(`[createPool] API indisponível; usando ${count} partidas já no banco para ${code}`);
  }

  // 3. Cria o bolão + adiciona criador como membro (RPC atômica)
  const { data, error } = await supabase.rpc("create_bolao_pool", {
    p_name: name,
    p_championship_id: championship.id,
    p_user_id: userId,
    p_scoring_model: scoringModel,
    p_scoring_config: scoringModel === "custom" ? scoringConfig : null,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as string, error: null };
}

export async function joinPool(
  userId: string,
  poolId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("bolao_pool_members")
    .insert({ pool_id: poolId, user_id: userId });

  if (error) {
    if (error.code === "23505") return { error: "Você já está neste bolão" };
    return { error: error.message };
  }
  return { error: null };
}

export async function leavePool(
  userId: string,
  poolId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("bolao_pool_members")
    .delete()
    .eq("pool_id", poolId)
    .eq("user_id", userId);

  return { error: error?.message ?? null };
}

// ══════════════════════════════════════════════════════════════
// Partidas + Palpites
// ══════════════════════════════════════════════════════════════

function isMatchLocked(utcDate: string, status: string): boolean {
  const openStatuses = ["TIMED", "SCHEDULED"];
  if (!openStatuses.includes(status)) return true;
  return Date.now() > new Date(utcDate).getTime() - 1 * 60 * 1000;
}

export async function fetchMatchesForPool(
  poolId: string,
  userId: string,
): Promise<RoundGroup[]> {
  // Busca o campeonato do bolão
  const { data: pool } = await supabase
    .from("bolao_pools")
    .select("championship_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) return [];

  // Busca partidas + palpites em paralelo
  const [matchesRes, predictionsRes] = await Promise.all([
    supabase
      .from("bolao_matches")
      .select("*")
      .eq("championship_id", pool.championship_id)
      .order("utc_date", { ascending: true }),
    supabase
      .from("bolao_predictions")
      .select("*")
      .eq("pool_id", poolId)
      .eq("user_id", userId),
  ]);

  const matches = (matchesRes.data ?? []) as BolaoMatch[];
  const predictions = (predictionsRes.data ?? []) as BolaoPrediction[];
  const predMap = new Map(predictions.map((p) => [p.match_id, p]));

  // Enriquece partidas com palpite do usuário
  const enriched: MatchWithPrediction[] = matches.map((m) => {
    const pred = predMap.get(m.id) ?? null;
    return {
      ...m,
      my_prediction: pred
        ? {
            home_goals: pred.home_goals,
            away_goals: pred.away_goals,
            points_earned: pred.points_earned,
          }
        : null,
      is_locked: isMatchLocked(m.utc_date, m.status),
    };
  });

  // Agrupa por rodada
  const roundMap = new Map<string, MatchWithPrediction[]>();
  for (const m of enriched) {
    const key = m.round_label;
    if (!roundMap.has(key)) roundMap.set(key, []);
    roundMap.get(key)!.push(m);
  }

  // Constrói RoundGroups com visibilidade para fases eliminatórias
  const groups: RoundGroup[] = [];
  for (const [label, roundMatches] of roundMap) {
    const first = roundMatches[0];
    groups.push({
      label,
      round_number: first.round_number,
      stage: first.stage,
      matches: roundMatches,
      is_visible: true, // calculado abaixo
    });
  }

  // Ordena rodadas pela data mais cedo de cada rodada (garante ordem cronológica correta)
  groups.sort((a, b) => {
    const aMin = Math.min(...a.matches.map((m) => new Date(m.utc_date).getTime()));
    const bMin = Math.min(...b.matches.map((m) => new Date(m.utc_date).getTime()));
    return aMin - bMin;
  });

  // Determina visibilidade de fases eliminatórias
  for (const group of groups) {
    const stageIdx = KNOCKOUT_STAGE_ORDER.indexOf(group.stage);
    if (stageIdx <= 0) continue; // REGULAR_SEASON ou GROUP_STAGE sempre visíveis

    const prevStage = KNOCKOUT_STAGE_ORDER[stageIdx - 1];
    const prevGroup = groups.find((g) => g.stage === prevStage);
    if (!prevGroup) continue;

    group.is_visible = prevGroup.matches.every(
      (m) => m.status === "FINISHED",
    );
  }

  return groups;
}

// ══════════════════════════════════════════════════════════════
// Palpites
// ══════════════════════════════════════════════════════════════

export async function upsertPrediction(
  poolId: string,
  matchId: string,
  userId: string,
  homeGoals: number,
  awayGoals: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("bolao_predictions").upsert(
    {
      pool_id: poolId,
      match_id: matchId,
      user_id: userId,
      home_goals: homeGoals,
      away_goals: awayGoals,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pool_id,match_id,user_id" },
  );

  return { error: error?.message ?? null };
}

// ══════════════════════════════════════════════════════════════
// Sincronização de resultados
// ══════════════════════════════════════════════════════════════

// Throttle: evita re-sync em menos de 5 minutos
const lastSyncByPool = new Map<string, number>();
const SYNC_COOLDOWN = 5 * 60 * 1000;

// Throttle separado para sync de horários
const lastScheduleSyncByPool = new Map<string, number>();
const SCHEDULE_SYNC_COOLDOWN = 5 * 60 * 1000;

export async function syncPoolResults(poolId: string, force = false): Promise<number> {
  const lastSync = lastSyncByPool.get(poolId) ?? 0;
  if (!force && Date.now() - lastSync < SYNC_COOLDOWN) return 0;
  lastSyncByPool.set(poolId, Date.now());

  // Busca o campeonato deste bolão
  const { data: pool } = await supabase
    .from("bolao_pools")
    .select("championship_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) return 0;

  let updated = 0;
  const now = new Date().toISOString();

  // 1. Partidas que ainda não têm status FINISHED — busca resultado na API
  const { data: pendingMatches } = await supabase
    .from("bolao_matches")
    .select("id, fd_match_id, home_team, away_team, utc_date, championship_id, status")
    .eq("championship_id", pool.championship_id)
    .lt("utc_date", now)
    .not("status", "eq", "FINISHED")
    .not("status", "eq", "CANCELLED")
    .not("status", "eq", "POSTPONED");

  for (const match of pendingMatches ?? []) {
    const result = await fetchMatchResult(
      match.fd_match_id,
      match.home_team,
      match.away_team,
      match.utc_date,
    );
    if (!result || result.status !== "FINISHED") continue;

    await supabase
      .from("bolao_matches")
      .update({
        score_home: result.home,
        score_away: result.away,
        status: "FINISHED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    if (result.home !== null && result.away !== null) {
      await scoreMatchPredictions(match.id, result.home, result.away);
    }

    updated++;
  }

  // 2. Partidas já FINISHED com placar mas palpites sem pontuação — rescore
  const { data: finishedMatches } = await supabase
    .from("bolao_matches")
    .select("id, score_home, score_away")
    .eq("championship_id", pool.championship_id)
    .eq("status", "FINISHED")
    .not("score_home", "is", null)
    .not("score_away", "is", null);

  for (const match of finishedMatches ?? []) {
    const { count } = await supabase
      .from("bolao_predictions")
      .select("id", { count: "exact", head: true })
      .eq("match_id", match.id)
      .is("points_earned", null);

    if ((count ?? 0) > 0) {
      await scoreMatchPredictions(match.id, match.score_home!, match.score_away!);
      updated++;
    }
  }

  return updated;
}

// ══════════════════════════════════════════════════════════════
// Repopulação forçada (sem cooldown, para admin)
// ══════════════════════════════════════════════════════════════

export async function forcePopulateMatches(
  poolId: string,
): Promise<{ populated: number; error: string | null }> {
  const { data: pool } = await supabase
    .from("bolao_pools")
    .select("championship_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) return { populated: 0, error: "Bolão não encontrado" };

  const { data: championship } = await supabase
    .from("bolao_championships")
    .select("*")
    .eq("id", pool.championship_id)
    .maybeSingle();

  if (!championship) return { populated: 0, error: "Campeonato não encontrado" };

  const { matches: fdMatches, error: apiError } = await fetchChampionshipMatches(
    championship.code as ChampionshipCode,
  );

  // Sync apenas se a API retornou algo; caso contrário preserva o banco intacto
  if (fdMatches.length > 0) {
    await syncMatches(championship as BolaoChampionship, fdMatches);
    lastSyncByPool.delete(poolId);
    lastScheduleSyncByPool.delete(poolId);
  }

  // Sempre retorna o total do banco — inclui rodadas inseridas manualmente
  const { count: totalInDb } = await supabase
    .from("bolao_matches")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", championship.id);

  if ((totalInDb ?? 0) === 0) {
    return { populated: 0, error: apiError ?? "Nenhuma partida encontrada na API nem no banco" };
  }

  return { populated: totalInDb!, error: apiError };
}

// ══════════════════════════════════════════════════════════════
// Resultado manual (admin)
// ══════════════════════════════════════════════════════════════

export async function setMatchResultManually(
  matchId: string,
  scoreHome: number,
  scoreAway: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("bolao_matches")
    .update({
      score_home: scoreHome,
      score_away: scoreAway,
      status: "FINISHED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) return { error: error.message };
  await scoreMatchPredictions(matchId, scoreHome, scoreAway);
  return { error: null };
}

export async function recalculateAllPoints(
  poolId: string,
): Promise<{ updated: number; error: string | null }> {
  const { data: pool } = await supabase
    .from("bolao_pools")
    .select("championship_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) return { updated: 0, error: "Bolão não encontrado" };

  const { data: finishedMatches } = await supabase
    .from("bolao_matches")
    .select("id, score_home, score_away")
    .eq("championship_id", pool.championship_id)
    .eq("status", "FINISHED")
    .not("score_home", "is", null)
    .not("score_away", "is", null);

  let updated = 0;
  for (const match of finishedMatches ?? []) {
    await scoreMatchPredictions(match.id, match.score_home!, match.score_away!, poolId);
    updated++;
  }
  return { updated, error: null };
}

// ══════════════════════════════════════════════════════════════
// Sincronização de horários das partidas
// ══════════════════════════════════════════════════════════════

export async function syncMatchSchedules(poolId: string): Promise<{ updated: number; error: string | null }> {
  const lastSync = lastScheduleSyncByPool.get(poolId) ?? 0;
  if (Date.now() - lastSync < SCHEDULE_SYNC_COOLDOWN) {
    return { updated: 0, error: "cooldown" };
  }
  lastScheduleSyncByPool.set(poolId, Date.now());

  // Busca o campeonato do bolão
  const { data: pool } = await supabase
    .from("bolao_pools")
    .select("championship_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) return { updated: 0, error: "Bolão não encontrado" };

  const { data: championship } = await supabase
    .from("bolao_championships")
    .select("*")
    .eq("id", pool.championship_id)
    .maybeSingle();

  if (!championship) return { updated: 0, error: "Campeonato não encontrado" };

  const { matches: fdMatches, error: apiError } = await fetchChampionshipMatches(
    championship.code as ChampionshipCode,
  );
  if (apiError || fdMatches.length === 0) {
    return { updated: 0, error: apiError ?? "Nenhuma partida retornada pela API" };
  }

  // Compara horários/status antes de sincronizar para saber quantos mudaram
  const { data: existing } = await supabase
    .from("bolao_matches")
    .select("fd_match_id, utc_date, status")
    .eq("championship_id", pool.championship_id)
    .not("status", "eq", "FINISHED");

  type ExistingMatch = { fd_match_id: number; utc_date: string; status: string };
  const existingMap = new Map<number, ExistingMatch>(
    (existing ?? []).map((m: ExistingMatch) => [m.fd_match_id, m]),
  );

  await syncMatches(championship as BolaoChampionship, fdMatches);

  let updated = 0;
  for (const m of fdMatches) {
    if (m.status === "FINISHED") continue;
    const prev = existingMap.get(m.id);
    if (prev && (prev.utc_date !== m.utcDate || prev.status !== m.status)) {
      updated++;
    }
  }

  return { updated, error: null };
}

export async function updatePoolScoringModel(
  poolId: string,
  model: ScoringModel,
  config: CustomScoringConfig | null = null,
): Promise<{ error: string | null }> {
  const { error: modelErr } = await supabase.rpc("update_pool_scoring_model", {
    p_pool_id: poolId,
    p_scoring_model: model,
    p_scoring_config: model === "custom" ? config : null,
  });
  if (modelErr) return { error: modelErr.message };

  const { error: resetErr } = await supabase.rpc("reset_pool_scores", {
    p_pool_id: poolId,
  });
  if (resetErr) return { error: resetErr.message };

  const { error: calcErr } = await recalculateAllPoints(poolId);
  return { error: calcErr };
}

async function scoreMatchPredictions(
  matchId: string,
  realHome: number,
  realAway: number,
  poolId?: string,
): Promise<void> {
  const { error } = await supabase.rpc("score_match_predictions", {
    p_match_id: matchId,
    p_real_home: realHome,
    p_real_away: realAway,
    p_pool_id: poolId ?? null,
  });

  if (error) console.error("[scoreMatchPredictions]", error);
}

// ══════════════════════════════════════════════════════════════
// Leaderboard
// ══════════════════════════════════════════════════════════════

export async function fetchLeaderboard(
  poolId: string,
): Promise<LeaderboardEntry[]> {
  const [membersRes, predsRes] = await Promise.all([
    supabase
      .from("bolao_pool_members")
      .select("user_id, profiles(id, display_name, avatar_url)")
      .eq("pool_id", poolId),
    supabase
      .from("bolao_predictions")
      .select("user_id, points_earned")
      .eq("pool_id", poolId)
      .not("points_earned", "is", null),
  ]);

  type MemberRow = {
    user_id: string;
    profiles: { id: string; display_name: string; avatar_url: string | null };
  };
  const members = (membersRes.data ?? []) as unknown as MemberRow[];
  const preds = (predsRes.data ?? []) as {
    user_id: string;
    points_earned: number;
  }[];

  return members
    .map((m) => {
      const userPreds = preds.filter((p) => p.user_id === m.user_id);
      const total = userPreds.reduce((s, p) => s + (p.points_earned ?? 0), 0);
      const exact = userPreds.filter((p) => p.points_earned === 15).length;
      return {
        user_id: m.user_id,
        display_name: m.profiles?.display_name ?? "?",
        avatar_url: m.profiles?.avatar_url ?? null,
        total_points: total,
        predictions_made: userPreds.length,
        exact_scores: exact,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);
}

export async function fetchRoundLeaderboards(
  poolId: string,
): Promise<RoundLeaderboard[]> {
  const [membersRes, predsRes] = await Promise.all([
    supabase
      .from("bolao_pool_members")
      .select("user_id, profiles(id, display_name, avatar_url)")
      .eq("pool_id", poolId),
    supabase
      .from("bolao_predictions")
      .select("user_id, points_earned, bolao_matches(round_label)")
      .eq("pool_id", poolId)
      .not("points_earned", "is", null),
  ]);

  type MemberRow2 = {
    user_id: string;
    profiles: { id: string; display_name: string; avatar_url: string | null };
  };
  type PredRow = {
    user_id: string;
    points_earned: number;
    bolao_matches: { round_label: string } | null;
  };

  const members = (membersRes.data ?? []) as unknown as MemberRow2[];
  const preds = (predsRes.data ?? []) as unknown as PredRow[];

  // Coleta rodadas únicas
  const rounds = [
    ...new Set(preds.map((p) => p.bolao_matches?.round_label).filter(Boolean)),
  ] as string[];

  return rounds.map((round) => {
    const roundPreds = preds.filter(
      (p) => p.bolao_matches?.round_label === round,
    );

    const entries: LeaderboardEntry[] = members
      .map((m) => {
        const userPreds = roundPreds.filter((p) => p.user_id === m.user_id);
        const total = userPreds.reduce(
          (s, p) => s + (p.points_earned ?? 0),
          0,
        );
        return {
          user_id: m.user_id,
          display_name: m.profiles?.display_name ?? "?",
          avatar_url: m.profiles?.avatar_url ?? null,
          total_points: total,
          predictions_made: userPreds.length,
          exact_scores: userPreds.filter((p) => p.points_earned === 15).length,
        };
      })
      .sort((a, b) => b.total_points - a.total_points);

    return { round_label: round, entries };
  });
}

export async function fetchAllUserPredictions(
  poolId: string,
): Promise<Map<string, UserPredictionDetail[]>> {
  const { data } = await supabase
    .from("bolao_predictions")
    .select(
      "user_id, match_id, home_goals, away_goals, points_earned, bolao_matches(home_team, away_team, home_crest, away_crest, round_label, utc_date, score_home, score_away)",
    )
    .eq("pool_id", poolId);

  const result = new Map<string, UserPredictionDetail[]>();
  for (const p of (data ?? []) as any[]) {
    const m = p.bolao_matches;
    if (!m) continue;
    const detail: UserPredictionDetail = {
      match_id: p.match_id,
      home_team: m.home_team,
      away_team: m.away_team,
      home_crest: m.home_crest ?? null,
      away_crest: m.away_crest ?? null,
      round_label: m.round_label,
      utc_date: m.utc_date,
      score_home: m.score_home ?? null,
      score_away: m.score_away ?? null,
      pred_home: p.home_goals,
      pred_away: p.away_goals,
      points_earned: p.points_earned ?? null,
    };
    if (!result.has(p.user_id)) result.set(p.user_id, []);
    result.get(p.user_id)!.push(detail);
  }

  for (const [, preds] of result) {
    preds.sort(
      (a, b) =>
        new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime(),
    );
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// Realtime
// ══════════════════════════════════════════════════════════════

export function subscribeBolao(poolId: string, onRefresh: () => void) {
  return supabase
    .channel(`bolao_pool_${poolId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bolao_predictions",
        filter: `pool_id=eq.${poolId}`,
      },
      onRefresh,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "bolao_matches" },
      onRefresh,
    )
    .subscribe();
}
