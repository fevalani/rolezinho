import { supabase } from "@/lib/supabase";
import type {
  GameStatus,
  Word500Game,
  Word500LeaderboardEntry,
  Word500OverallEntry,
} from "./word500Types";

// Tabela: word500_games
// MIGRATION PENDENTE — criar via supabase/word500_migration.sql

function mapRow(d: Record<string, unknown>): Word500Game {
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
    profile: d.profiles as Word500Game["profile"],
  };
}

export async function getWord500TodayGame(
  userId: string,
  gameDate: string,
): Promise<Word500Game | null> {
  try {
    const { data, error } = await supabase
      .from("word500_games")
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

export async function saveWord500Game(
  userId: string,
  gameDate: string,
  fields: { guesses: string[]; status: GameStatus; attempts: number; score: number },
): Promise<{ error: string | null }> {
  try {
    const finished_at = fields.status === "playing" ? null : new Date().toISOString();
    const { error } = await supabase.from("word500_games").upsert(
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

export async function getWord500DailyLeaderboard(
  gameDate: string,
): Promise<Word500LeaderboardEntry[]> {
  try {
    const { data } = await supabase
      .from("word500_games")
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

export async function getWord500OverallEntries(): Promise<Word500OverallEntry[]> {
  try {
    const { data } = await supabase
      .from("word500_games")
      .select("user_id, status, score, profiles(display_name, avatar_url)")
      .neq("status", "playing");

    const rows = (data ?? []) as Record<string, unknown>[];
    const byUser = new Map<string, Word500OverallEntry>();

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

    return Array.from(byUser.values()).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.games - a.games;
    });
  } catch {
    return [];
  }
}
