import { supabase } from "@/lib/supabase";
import type {
  GameStatus,
  LetrosoGame,
  LetrosoLeaderboardEntry,
  LetrosoOverallEntry,
} from "./letrosoTypes";
import { MAX_LETROSO_ATTEMPTS } from "./letrosoLogic";
import type { OverallEntry } from "./letrecoTypes";

// Tabela: letroso_games
// MIGRATION PENDENTE — criar via supabase/letroso_migration.sql

function mapRow(d: Record<string, unknown>): LetrosoGame {
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
    profile: d.profiles as LetrosoGame["profile"],
  };
}

export async function getLetrosoTodayGame(
  userId: string,
  gameDate: string,
): Promise<LetrosoGame | null> {
  try {
    const { data, error } = await supabase
      .from("letroso_games")
      .select("*")
      .eq("user_id", userId)
      .eq("game_date", gameDate)
      .maybeSingle();

    if (error) return null;
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function saveLetrosoGame(
  userId: string,
  gameDate: string,
  fields: { guesses: string[]; status: GameStatus; attempts: number; score: number },
): Promise<{ error: string | null }> {
  try {
    const finished_at = fields.status === "playing" ? null : new Date().toISOString();
    const { error } = await supabase.from("letroso_games").upsert(
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
  } catch (e) {
    return { error: String(e) };
  }
}

export async function getLetrosoDailyLeaderboard(
  gameDate: string,
): Promise<LetrosoLeaderboardEntry[]> {
  try {
    const { data } = await supabase
      .from("letroso_games")
      .select("user_id, status, attempts, score, finished_at, profiles(display_name, avatar_url)")
      .eq("game_date", gameDate)
      .neq("status", "playing");

    const rows = (data ?? []) as Record<string, unknown>[];
    return rows
      .map((r) => {
        const profile = r.profiles as { display_name: string; avatar_url: string | null } | null;
        return {
          user_id: r.user_id as string,
          display_name: profile?.display_name ?? "Jogador",
          avatar_url: profile?.avatar_url ?? null,
          status: r.status as GameStatus,
          attempts: Number(r.attempts ?? 0),
          score: Number(r.score ?? 0),
          finished_at: (r.finished_at as string | null) ?? null,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.attempts !== b.attempts) return a.attempts - b.attempts;
        return (a.finished_at ?? "").localeCompare(b.finished_at ?? "");
      });
  } catch {
    return [];
  }
}

export async function getLetrosoOverallEntries(): Promise<LetrosoOverallEntry[]> {
  try {
    const { data } = await supabase
      .from("letroso_games")
      .select("user_id, status, score, profiles(display_name, avatar_url)")
      .neq("status", "playing");

    const rows = (data ?? []) as Record<string, unknown>[];
    const byUser = new Map<string, LetrosoOverallEntry>();

    for (const r of rows) {
      const userId = r.user_id as string;
      const profile = r.profiles as { display_name: string; avatar_url: string | null } | null;
      const entry = byUser.get(userId) ?? {
        user_id: userId,
        display_name: profile?.display_name ?? "Jogador",
        avatar_url: profile?.avatar_url ?? null,
        totalScore: 0,
        games: 0,
        wins: 0,
      };
      entry.totalScore += Number(r.score ?? 0);
      entry.games += 1;
      if (r.status === "won") entry.wins += 1;
      byUser.set(userId, entry);
    }

    return Array.from(byUser.values());
  } catch {
    return [];
  }
}

/**
 * Ranking geral combinado: Letreco + Letroso (pontos já são 2× no score do Letroso).
 * Retorna OverallEntry para manter compatibilidade com o componente existente.
 */
export async function getCombinedOverallLeaderboard(): Promise<OverallEntry[]> {
  const [letrecoResult, letrosoResult] = await Promise.allSettled([
    supabase
      .from("letreco_games")
      .select("user_id, status, score, profiles(display_name, avatar_url)")
      .neq("status", "playing"),
    supabase
      .from("letroso_games")
      .select("user_id, status, score, profiles(display_name, avatar_url)")
      .neq("status", "playing"),
  ]);

  const letrecoData = letrecoResult.status === "fulfilled" ? letrecoResult.value : { data: null };
  const letrosoData = letrosoResult.status === "fulfilled" ? letrosoResult.value : { data: null };

  const byUser = new Map<string, OverallEntry>();

  const processRows = (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const userId = r.user_id as string;
      const profile = r.profiles as { display_name: string; avatar_url: string | null } | null;
      const entry = byUser.get(userId) ?? {
        user_id: userId,
        display_name: profile?.display_name ?? "Jogador",
        avatar_url: profile?.avatar_url ?? null,
        totalScore: 0,
        games: 0,
        wins: 0,
      };
      entry.totalScore += Number(r.score ?? 0);
      entry.games += 1;
      if (r.status === "won") entry.wins += 1;
      byUser.set(userId, entry);
    }
  };

  processRows((letrecoData.data ?? []) as Record<string, unknown>[]);
  processRows(((letrosoData as { data: unknown[] }).data ?? []) as Record<string, unknown>[]);

  return Array.from(byUser.values()).sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.games - a.games;
  });
}

export { MAX_LETROSO_ATTEMPTS };
