import { supabase } from "@/lib/supabase";
import type {
  GameStatus,
  LeaderboardEntry,
  LetrecoGame,
  LetrecoStats,
  OverallEntry,
} from "./letrecoTypes";
import { MAX_ATTEMPTS } from "./letrecoLogic";

// ══════════════════════════════════════════════════════════════
// Partida do dia
// ══════════════════════════════════════════════════════════════

function mapGameRow(d: Record<string, unknown>): LetrecoGame {
  return {
    id: d.id as string,
    user_id: d.user_id as string,
    game_date: d.game_date as string,
    guesses: (d.guesses as string[]) ?? [],
    status: d.status as GameStatus,
    attempts: Number(d.attempts ?? 0),
    score: Number(d.score ?? 0),
    finished_at: (d.finished_at as string | null) ?? null,
    created_at: d.created_at as string,
    profile: d.profiles as LetrecoGame["profile"],
  };
}

/** Busca a partida do jogador num dia (null se ainda não jogou). */
export async function getTodayGame(
  userId: string,
  gameDate: string,
): Promise<LetrecoGame | null> {
  const { data } = await supabase
    .from("letreco_games")
    .select("*")
    .eq("user_id", userId)
    .eq("game_date", gameDate)
    .maybeSingle();

  return data ? mapGameRow(data as Record<string, unknown>) : null;
}

/**
 * Persiste o estado da partida (upsert por user_id + game_date).
 * Chamado após cada palpite e ao terminar.
 */
export async function saveGame(
  userId: string,
  gameDate: string,
  fields: {
    guesses: string[];
    status: GameStatus;
    attempts: number;
    score: number;
  },
): Promise<{ error: string | null }> {
  const finished_at =
    fields.status === "playing" ? null : new Date().toISOString();

  const { error } = await supabase.from("letreco_games").upsert(
    {
      user_id: userId,
      game_date: gameDate,
      guesses: fields.guesses,
      status: fields.status,
      attempts: fields.attempts,
      score: fields.score,
      finished_at,
    },
    { onConflict: "user_id,game_date" },
  );

  return { error: error?.message ?? null };
}

// ══════════════════════════════════════════════════════════════
// Ranking do dia
// ══════════════════════════════════════════════════════════════

/**
 * Ranking do dia: pontos desc, depois menos tentativas, depois quem
 * terminou mais cedo. Só entram partidas finalizadas (won/lost).
 */
export async function getDailyLeaderboard(
  gameDate: string,
): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from("letreco_games")
    .select("user_id, status, attempts, score, finished_at, profiles(display_name, avatar_url)")
    .eq("game_date", gameDate)
    .neq("status", "playing");

  const rows = (data ?? []) as Record<string, unknown>[];

  const entries: LeaderboardEntry[] = rows.map((r) => {
    const profile = r.profiles as
      | { display_name: string; avatar_url: string | null }
      | null;
    return {
      user_id: r.user_id as string,
      display_name: profile?.display_name ?? "Jogador",
      avatar_url: profile?.avatar_url ?? null,
      status: r.status as GameStatus,
      attempts: Number(r.attempts ?? 0),
      score: Number(r.score ?? 0),
      finished_at: (r.finished_at as string | null) ?? null,
    };
  });

  return entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.attempts !== b.attempts) return a.attempts - b.attempts;
    return (a.finished_at ?? "").localeCompare(b.finished_at ?? "");
  });
}

/**
 * Ranking geral: soma de pontos de cada jogador em todos os dias.
 * Ordena por pontos desc, depois mais vitórias, depois mais jogos.
 */
export async function getOverallLeaderboard(): Promise<OverallEntry[]> {
  const { data } = await supabase
    .from("letreco_games")
    .select("user_id, status, score, profiles(display_name, avatar_url)")
    .neq("status", "playing");

  const rows = (data ?? []) as Record<string, unknown>[];
  const byUser = new Map<string, OverallEntry>();

  for (const r of rows) {
    const userId = r.user_id as string;
    const profile = r.profiles as
      | { display_name: string; avatar_url: string | null }
      | null;
    const entry =
      byUser.get(userId) ??
      ({
        user_id: userId,
        display_name: profile?.display_name ?? "Jogador",
        avatar_url: profile?.avatar_url ?? null,
        totalScore: 0,
        games: 0,
        wins: 0,
      } as OverallEntry);

    entry.totalScore += Number(r.score ?? 0);
    entry.games += 1;
    if (r.status === "won") entry.wins += 1;
    byUser.set(userId, entry);
  }

  return Array.from(byUser.values()).sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.games - a.games;
  });
}

// ══════════════════════════════════════════════════════════════
// Estatísticas pessoais
// ══════════════════════════════════════════════════════════════

/** Estatísticas acumuladas do jogador (vitórias, streak, distribuição). */
export async function getUserStats(userId: string): Promise<LetrecoStats> {
  const { data } = await supabase
    .from("letreco_games")
    .select("game_date, status, attempts, score")
    .eq("user_id", userId)
    .neq("status", "playing")
    .order("game_date", { ascending: true });

  const rows = (data ?? []) as {
    game_date: string;
    status: GameStatus;
    attempts: number;
    score: number;
  }[];

  const distribution = new Array(MAX_ATTEMPTS).fill(0) as number[];
  let wins = 0;
  let totalScore = 0;

  for (const r of rows) {
    totalScore += Number(r.score ?? 0);
    if (r.status === "won") {
      wins++;
      const idx = Math.min(Math.max(r.attempts - 1, 0), MAX_ATTEMPTS - 1);
      distribution[idx]++;
    }
  }

  // Streak de vitórias em dias consecutivos, contando a partir do dia mais recente
  const wonDays = rows
    .filter((r) => r.status === "won")
    .map((r) => r.game_date)
    .sort();

  const maxStreak = longestConsecutive(wonDays);
  const currentStreak = currentConsecutive(wonDays);

  const played = rows.length;
  return {
    played,
    wins,
    winRate: played === 0 ? 0 : Math.round((wins / played) * 100),
    currentStreak,
    maxStreak,
    totalScore,
    distribution,
  };
}

/** Diferença em dias entre duas datas "YYYY-MM-DD" */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

function longestConsecutive(days: string[]): number {
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = dayDiff(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function currentConsecutive(days: string[]): number {
  if (days.length === 0) return 0;
  let run = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (dayDiff(days[i - 1], days[i]) === 1) run++;
    else break;
  }
  return run;
}
