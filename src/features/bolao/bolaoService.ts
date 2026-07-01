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
import { getTeamCrest } from "./teamCrests";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type { ChampionshipCode };
export { toRoundLabel };

// ── Modelos de pontuação ─────────────────────────────────────
export type PresetScoringModel = "classic" | "extended" | "simplified";
export type ScoringModel = PresetScoringModel | "custom";

// ── Base de gols para pontuação ──────────────────────────────
// 'regular'    = placar ao fim dos 90min (sem prorrogação)
// 'extra_time' = placar após prorrogação, se houver (padrão)
// 'penalty'    = extra_time + gols de pênaltis somados ao placar
export type GoalBase = "regular" | "extra_time" | "penalty";

export const GOAL_BASE_LABELS: Record<GoalBase, { label: string; description: string }> = {
  regular:    { label: "90min", description: "Apenas os gols dos 90 minutos regulamentares, sem prorrogação." },
  extra_time: { label: "90min + prorrogação", description: "Inclui gols da prorrogação quando houver. Resultado oficial do jogo." },
  penalty:    { label: "90min + prorrogação + pênaltis", description: "Soma os gols convertidos nos pênaltis ao placar final." },
};

// ── Variação de posição na classificação ─────────────────────
// "off"   = desativado (nenhuma seta)
// "round" = compara com a classificação antes da última rodada
// "match" = compara com a classificação antes da última partida
export type VariationMode = "off" | "round" | "match";

export const VARIATION_MODES: Record<VariationMode, string> = {
  off: "Desativado",
  round: "Por rodada",
  match: "Por partida",
};

// ── Multiplicador de pontos por fase eliminatória (mata-mata) ─
// Chave = stage (ex: "ROUND_OF_32", "QUARTER_FINALS"). Fase ausente = 1x (sem alteração).
// Cada campeonato tem seu próprio conjunto de fases eliminatórias (ex: a Copa
// do Mundo 2026 começa nas dezesseis-avos, outros campeonatos podem começar
// direto nas oitavas), por isso o multiplicador é livre por fase, não fixo.
export type StageMultipliers = Partial<Record<string, number>>;

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
  home_team: string | null;
  home_crest: string | null;
  away_team: string | null;
  away_crest: string | null;
  round_label: string;
  round_number: number | null;
  stage: string;
  utc_date: string;
  status: string;
  /** Placar após prorrogação (sem pênaltis). Valor exibido na UI. */
  score_home: number | null;
  score_away: number | null;
  /** Placar somente dos 90min. Null quando não houve prorrogação (igual a score_home). */
  score_regular_home: number | null;
  score_regular_away: number | null;
  /** Gols convertidos nos pênaltis (ex: 5 e 3). Null quando não houve disputa. */
  score_pen_home: number | null;
  score_pen_away: number | null;
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
  variation_mode: VariationMode;
  stage_multipliers: StageMultipliers;
  goal_base: GoalBase;
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

// Nomes que diferem entre SofaScore (original, canônico) e football-data.org.
// Chave = nome FD → valor = nome canônico gravado no banco.
const TEAM_NAME_ALIASES: Record<string, string> = {
  "Turkey": "Türkiye",
  "Congo DR": "DR Congo",
  "Cape Verde Islands": "Cape Verde",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
};

function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return "A definir";
  return TEAM_NAME_ALIASES[name] ?? name;
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

  const rows = fdMatches.map((m) => {
    const ftHome = m.score.fullTime.home ?? null;
    const ftAway = m.score.fullTime.away ?? null;
    const rtHome = m.score.regularTime?.home ?? null;
    const rtAway = m.score.regularTime?.away ?? null;
    const etDeltaHome = m.score.extraTime?.home ?? null;
    const etDeltaAway = m.score.extraTime?.away ?? null;
    const penHome = m.score.penalties?.home ?? null;
    const penAway = m.score.penalties?.away ?? null;
    const hadET = m.score.duration === "EXTRA_TIME" || m.score.duration === "PENALTY_SHOOTOUT";

    // Placar dos 90min: quando houve ET/pênaltis, fullTime já inclui tudo
    // (inclusive gols de pênaltis), então o placar de 90min vem de regularTime.
    const baseHome = hadET ? (rtHome ?? ftHome) : ftHome;
    const baseAway = hadET ? (rtAway ?? ftAway) : ftAway;

    // score_home/away = placar após prorrogação (sem pênaltis)
    const scoreHome = hadET && etDeltaHome !== null && baseHome !== null ? baseHome + etDeltaHome : baseHome;
    const scoreAway = hadET && etDeltaAway !== null && baseAway !== null ? baseAway + etDeltaAway : baseAway;

    return {
      championship_id: championship.id,
      fd_match_id: m.id,
      // Mata-mata TBD: API retorna name=null até os classificados serem definidos.
      // Normaliza variações de nome entre SofaScore e FD para manter consistência.
      home_team: normalizeTeamName(m.homeTeam.name),
      home_crest: m.homeTeam.crest ?? null,
      away_team: normalizeTeamName(m.awayTeam.name),
      away_crest: m.awayTeam.crest ?? null,
      round_label: toRoundLabel(m.stage, m.matchday),
      round_number: m.matchday ?? null,
      stage: m.stage,
      utc_date: m.utcDate,
      status: m.status,
      score_home: scoreHome,
      score_away: scoreAway,
      score_regular_home: hadET ? baseHome : null,
      score_regular_away: hadET ? baseAway : null,
      score_pen_home: penHome,
      score_pen_away: penAway,
      updated_at: new Date().toISOString(),
    };
  });

  // Antes de upsert por fd_match_id, detecta registros com o mesmo
  // time+dia mas fd_match_id diferente (resíduo de import anterior via SofaScore).
  // Migra o fd_match_id do registro existente para o valor correto da API FD,
  // evitando duplicatas.
  const { data: existing } = await supabase
    .from("bolao_matches")
    .select("id, fd_match_id, home_team, away_team, utc_date")
    .eq("championship_id", championship.id);

  if (existing && existing.length > 0) {
    const currentFdIdSet = new Set(fdMatches.map((m) => m.id));
    const patchOps: PromiseLike<unknown>[] = [];

    for (const dbMatch of existing as { id: string; fd_match_id: number; home_team: string; away_team: string; utc_date: string }[]) {
      if (currentFdIdSet.has(dbMatch.fd_match_id)) continue; // já sincronizado, sem ação
      // Procura a partida da API com mesmo time+dia (ignora TBD)
      if (dbMatch.home_team === "A definir" || dbMatch.away_team === "A definir") continue;
      const dbDay = dbMatch.utc_date.slice(0, 10);
      const apiMatch = fdMatches.find(
        (m) =>
          m.id !== dbMatch.fd_match_id &&
          normalizeTeamName(m.homeTeam.name) === dbMatch.home_team &&
          normalizeTeamName(m.awayTeam.name) === dbMatch.away_team &&
          m.utcDate.slice(0, 10) === dbDay,
      );
      if (apiMatch) {
        // Atualiza o fd_match_id no banco para o valor correto da API FD
        patchOps.push(
          supabase
            .from("bolao_matches")
            .update({ fd_match_id: apiMatch.id, updated_at: new Date().toISOString() })
            .eq("id", dbMatch.id)
            .then((r) => r),
        );
        console.log(`[syncMatches] Corrigindo fd_match_id: ${dbMatch.home_team} x ${dbMatch.away_team} ${dbDay} — ${dbMatch.fd_match_id} → ${apiMatch.id}`);
      }
    }
    if (patchOps.length > 0) await Promise.all(patchOps);
  }

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
  // Usa fdMatches completo (incluindo TBD) para não deletar partidas que a API ainda conhece
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
      variation_mode: (p.variation_mode ?? "off") as VariationMode,
      stage_multipliers: (p.stage_multipliers ?? {}) as StageMultipliers,
      goal_base: (p.goal_base ?? "extra_time") as GoalBase,
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
    variation_mode: (data.variation_mode ?? "off") as VariationMode,
    stage_multipliers: (data.stage_multipliers ?? {}) as StageMultipliers,
    goal_base: (data.goal_base ?? "extra_time") as GoalBase,
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

const TBD_PLACEHOLDER = "A definir";

export function isMatchLocked(
  utcDate: string,
  status: string,
  homeTeam?: string | null,
  awayTeam?: string | null,
): boolean {
  // Partida sem times definidos fica travada até a API publicar os classificados
  const isTbd = (t: string | null | undefined) => t === null || t === TBD_PLACEHOLDER;
  if (isTbd(homeTeam) || isTbd(awayTeam)) return true;
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
      // Resolve crest: arquivo local (public/crests/) → URL da API → null
      home_crest: getTeamCrest(m.home_team, m.home_crest),
      away_crest: getTeamCrest(m.away_team, m.away_crest),
      my_prediction: pred
        ? {
            home_goals: pred.home_goals,
            away_goals: pred.away_goals,
            points_earned: pred.points_earned,
          }
        : null,
      is_locked: isMatchLocked(m.utc_date, m.status, m.home_team, m.away_team),
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
  // Guard autoritativo: revalida o lock contra o relógio no momento da
  // gravação. O is_locked do cliente pode estar defasado (página aberta desde
  // antes do início do jogo, sem interação que recalcule), então confiar só na
  // UI permite editar palpite após o apito. Aqui rechecamos no banco.
  const { data: match } = await supabase
    .from("bolao_matches")
    .select("utc_date, status, home_team, away_team")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Partida não encontrada." };
  if (isMatchLocked(match.utc_date, match.status, match.home_team, match.away_team)) {
    return { error: "Palpites encerrados para esta partida." };
  }

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
    if (result.home === null || result.away === null) continue;

    await supabase
      .from("bolao_matches")
      .update({
        score_home: result.home,
        score_away: result.away,
        score_regular_home: result.regularHome,
        score_regular_away: result.regularAway,
        score_pen_home: result.penaltyHome,
        score_pen_away: result.penaltyAway,
        status: "FINISHED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    // Função SQL lê o placar do banco e aplica o goal_base de cada bolão
    await scoreMatchPredictions(match.id);
    updated++;
  }

  // 2. Partidas já FINISHED com placar mas palpites sem pontuação — rescore
  const { data: finishedMatches } = await supabase
    .from("bolao_matches")
    .select("id")
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
      await scoreMatchPredictions(match.id);
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
  // Entrada manual: admin define o placar como quiser. Zera breakdown para
  // que o goal_base 'regular' caia em score_home (sem prorrogação separada).
  const { error } = await supabase
    .from("bolao_matches")
    .update({
      score_home: scoreHome,
      score_away: scoreAway,
      score_regular_home: null,
      score_regular_away: null,
      score_pen_home: null,
      score_pen_away: null,
      status: "FINISHED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) return { error: error.message };
  // Função SQL lê o placar do banco e aplica goal_base de cada bolão
  await scoreMatchPredictions(matchId);
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
    .select("id")
    .eq("championship_id", pool.championship_id)
    .eq("status", "FINISHED")
    .not("score_home", "is", null)
    .not("score_away", "is", null);

  let updated = 0;
  for (const match of finishedMatches ?? []) {
    // Função SQL lê placar do banco e aplica goal_base do bolão
    await scoreMatchPredictions(match.id, poolId);
    updated++;
  }
  return { updated, error: null };
}

export async function updatePoolGoalBase(
  poolId: string,
  goalBase: GoalBase,
): Promise<{ error: string | null }> {
  const { error: updateErr } = await supabase.rpc("update_pool_goal_base", {
    p_pool_id: poolId,
    p_goal_base: goalBase,
  });
  if (updateErr) return { error: updateErr.message };

  const { error: resetErr } = await supabase.rpc("reset_pool_scores", {
    p_pool_id: poolId,
  });
  if (resetErr) return { error: resetErr.message };

  const { error: calcErr } = await recalculateAllPoints(poolId);
  return { error: calcErr };
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

export async function updatePoolVariationMode(
  poolId: string,
  mode: VariationMode,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("update_pool_variation_mode", {
    p_pool_id: poolId,
    p_variation_mode: mode,
  });
  return { error: error?.message ?? null };
}

// Fases eliminatórias que de fato existem entre as partidas do campeonato,
// na ordem de KNOCKOUT_STAGE_ORDER. Cada campeonato pode começar em uma fase
// diferente (ex: Copa do Mundo 2026 começa nas dezesseis-avos, outros
// campeonatos podem começar direto nas oitavas ou nas quartas).
export async function fetchKnockoutStages(
  championshipId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("bolao_matches")
    .select("stage")
    .eq("championship_id", championshipId)
    .in("stage", KNOCKOUT_STAGE_ORDER);

  if (error || !data) return [];

  const stages = new Set(data.map((m) => m.stage as string));
  return KNOCKOUT_STAGE_ORDER.filter((s) => stages.has(s));
}

export async function updatePoolStageMultipliers(
  poolId: string,
  multipliers: StageMultipliers,
): Promise<{ error: string | null }> {
  const { error: rpcErr } = await supabase.rpc("update_pool_stage_multipliers", {
    p_pool_id: poolId,
    p_stage_multipliers: multipliers,
  });
  if (rpcErr) return { error: rpcErr.message };

  const { error: resetErr } = await supabase.rpc("reset_pool_scores", {
    p_pool_id: poolId,
  });
  if (resetErr) return { error: resetErr.message };

  const { error: calcErr } = await recalculateAllPoints(poolId);
  return { error: calcErr };
}

async function scoreMatchPredictions(
  matchId: string,
  poolId?: string,
): Promise<void> {
  // A função SQL lê o placar de bolao_matches e aplica o goal_base de cada bolão,
  // eliminando a necessidade de passar gols por parâmetro.
  const { error } = await supabase.rpc("score_match_predictions", {
    p_match_id: matchId,
    p_pool_id: poolId ?? null,
  });

  if (error) console.error("[scoreMatchPredictions]", error);
}

// ══════════════════════════════════════════════════════════════
// Leaderboard
// ══════════════════════════════════════════════════════════════

// "Cravada" = placar exato. Conta comparando o palpite ao resultado real,
// independente do modelo de pontuação (o valor de pontos da cravada é
// dinâmico por bolão, então não dá para assumir points_earned === 15).
interface LeaderboardPredRow {
  user_id: string;
  points_earned: number;
  home_goals: number;
  away_goals: number;
  bolao_matches: { score_home: number | null; score_away: number | null } | null;
}

function isExactScore(p: {
  home_goals: number;
  away_goals: number;
  bolao_matches: { score_home: number | null; score_away: number | null } | null;
}): boolean {
  const m = p.bolao_matches;
  if (!m || m.score_home === null || m.score_away === null) return false;
  return p.home_goals === m.score_home && p.away_goals === m.score_away;
}

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
      .select("user_id, points_earned, home_goals, away_goals, bolao_matches(score_home, score_away)")
      .eq("pool_id", poolId)
      .not("points_earned", "is", null),
  ]);

  type MemberRow = {
    user_id: string;
    profiles: { id: string; display_name: string; avatar_url: string | null };
  };
  const members = (membersRes.data ?? []) as unknown as MemberRow[];
  const preds = (predsRes.data ?? []) as unknown as LeaderboardPredRow[];

  return members
    .map((m) => {
      const userPreds = preds.filter((p) => p.user_id === m.user_id);
      const total = userPreds.reduce((s, p) => s + (p.points_earned ?? 0), 0);
      const exact = userPreds.filter(isExactScore).length;
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
      .select("user_id, points_earned, home_goals, away_goals, bolao_matches(round_label, utc_date, score_home, score_away)")
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
    home_goals: number;
    away_goals: number;
    bolao_matches: { round_label: string; utc_date: string | null; score_home: number | null; score_away: number | null } | null;
  };

  const members = (membersRes.data ?? []) as unknown as MemberRow2[];
  const preds = (predsRes.data ?? []) as unknown as PredRow[];

  // Coleta rodadas únicas e ordena pela data do último jogo de cada rodada
  const roundLastDate = new Map<string, string>();
  for (const p of preds) {
    const label = p.bolao_matches?.round_label;
    const date = p.bolao_matches?.utc_date;
    if (!label || !date) continue;
    const current = roundLastDate.get(label);
    if (!current || date > current) roundLastDate.set(label, date);
  }
  const rounds = [...roundLastDate.keys()].sort((a, b) => {
    const da = roundLastDate.get(a)!;
    const db = roundLastDate.get(b)!;
    return da < db ? -1 : da > db ? 1 : 0;
  });

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
          exact_scores: userPreds.filter(isExactScore).length,
        };
      })
      .sort((a, b) => b.total_points - a.total_points);

    return { round_label: round, entries };
  });
}

// ── Variação de posição ──────────────────────────────────────
// Ranking de competição padrão (1224): pontuações iguais = mesma posição.
function competitionRanks(
  totals: { userId: string; total: number }[],
): Map<string, number> {
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const ranks = new Map<string, number>();
  let rank = 0;
  let prevTotal: number | null = null;
  sorted.forEach((e, i) => {
    if (prevTotal === null || e.total !== prevTotal) {
      rank = i + 1;
      prevTotal = e.total;
    }
    ranks.set(e.userId, rank);
  });
  return ranks;
}

// Calcula quantas posições cada usuário subiu (+) ou desceu (−) na
// classificação geral em relação à última partida/rodada finalizada.
// Retorna apenas usuários cuja posição variou (delta ≠ 0).
export function computePositionVariations(
  entries: LeaderboardEntry[],
  allUserPredictions: Map<string, UserPredictionDetail[]>,
  matches: Pick<
    BolaoMatch,
    "id" | "status" | "utc_date" | "round_label" | "score_home" | "score_away"
  >[],
  mode: VariationMode,
): Map<string, number> {
  const result = new Map<string, number>();
  if (mode === "off" || entries.length === 0) return result;

  const finished = matches.filter(
    (m) =>
      m.status === "FINISHED" && m.score_home !== null && m.score_away !== null,
  );
  if (finished.length === 0) return result;

  // Última partida finalizada (por data)
  const last = finished.reduce((a, b) =>
    new Date(b.utc_date).getTime() > new Date(a.utc_date).getTime() ? b : a,
  );

  // Partidas a excluir para obter a classificação "anterior"
  const excluded = new Set<string>(
    mode === "match"
      ? [last.id]
      : finished
          .filter((m) => m.round_label === last.round_label)
          .map((m) => m.id),
  );

  const current = entries.map((e) => ({
    userId: e.user_id,
    total: e.total_points,
  }));
  const previous = entries.map((e) => {
    const preds = allUserPredictions.get(e.user_id) ?? [];
    const removed = preds.reduce(
      (s, p) => (excluded.has(p.match_id) ? s + (p.points_earned ?? 0) : s),
      0,
    );
    return { userId: e.user_id, total: e.total_points - removed };
  });

  const currRanks = competitionRanks(current);
  const prevRanks = competitionRanks(previous);

  for (const e of entries) {
    const delta =
      (prevRanks.get(e.user_id) ?? 0) - (currRanks.get(e.user_id) ?? 0);
    if (delta !== 0) result.set(e.user_id, delta);
  }
  return result;
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
// Snapshot consolidado (stale-while-revalidate)
// ══════════════════════════════════════════════════════════════

export interface BolaoSnapshot {
  pool: BolaoPool | null;
  rounds: RoundGroup[];
  members: BolaoPoolMember[];
  leaderboard: LeaderboardEntry[];
  roundLeaderboards: RoundLeaderboard[];
  // Map não serializa em JSON → guardamos como pares e reconstruímos no consumidor.
  userPredictions: [string, UserPredictionDetail[]][];
}

// Busca tudo o que a BolaoDetailPage precisa em uma única chamada agregada.
export async function fetchBolaoSnapshot(
  poolId: string,
  userId: string,
): Promise<BolaoSnapshot> {
  const [pool, rounds, members, leaderboard, roundLeaderboards, preds] =
    await Promise.all([
      fetchPoolById(poolId, userId),
      fetchMatchesForPool(poolId, userId),
      fetchPoolMembers(poolId),
      fetchLeaderboard(poolId),
      fetchRoundLeaderboards(poolId),
      fetchAllUserPredictions(poolId),
    ]);
  return {
    pool,
    rounds,
    members,
    leaderboard,
    roundLeaderboards,
    userPredictions: Array.from(preds.entries()),
  };
}

// Assinatura barata para detectar se o snapshot mudou de fato (evita re-render
// e regravação de cache quando a revalidação retorna dados idênticos).
// NÃO inclui is_locked (depende do relógio) nem datas voláteis irrelevantes.
export function snapshotSignature(s: BolaoSnapshot): string {
  const matches = s.rounds
    .flatMap((r) => r.matches)
    .map(
      (m) =>
        `${m.id}:${m.status}:${m.score_home}:${m.score_away}:${m.utc_date}:${m.updated_at}`,
    );
  const board = s.leaderboard.map((e) => `${e.user_id}:${e.total_points}`);
  const preds = s.userPredictions.flatMap(([u, ps]) =>
    ps.map(
      (p) =>
        `${u}:${p.match_id}:${p.pred_home}-${p.pred_away}:${p.points_earned}`,
    ),
  );
  return [
    s.pool?.scoring_model,
    s.pool?.variation_mode,
    s.pool?.goal_base,
    s.pool?.member_count,
    ...matches,
    ...board,
    ...preds,
  ].join("|");
}

// Recalcula is_locked a partir do relógio atual — necessário ao reidratar de um
// cache antigo, onde um jogo pode ter fechado desde a última gravação.
export function withRecomputedLocks(rounds: RoundGroup[]): RoundGroup[] {
  return rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => ({
      ...m,
      is_locked: isMatchLocked(m.utc_date, m.status, m.home_team, m.away_team),
    })),
  }));
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
