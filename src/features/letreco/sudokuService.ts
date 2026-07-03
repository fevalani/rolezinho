import { supabase } from "@/lib/supabase";
import type {
  GameStatus,
  SudokuDifficulty,
  SudokuGameRow,
  SudokuLeaderboardEntry,
  SudokuOverallEntry,
} from "./sudokuTypes";

// Tabela: sudoku_games
// MIGRATION PENDENTE — criar via supabase/sudoku_migration.sql
// (+ supabase/sudoku_difficulty_migration.sql se a tabela já existia sem a coluna difficulty)

function mapRow(d: Record<string, unknown>): SudokuGameRow {
  return {
    id: d.id as string,
    user_id: d.user_id as string,
    game_date: d.game_date as string,
    difficulty: (d.difficulty as SudokuDifficulty) ?? "medio",
    board: d.board as string,
    mistakes: Number(d.mistakes ?? 0),
    elapsed_seconds: Number(d.elapsed_seconds ?? 0),
    status: d.status as GameStatus,
    score: Number(d.score ?? 0),
    started_at: d.started_at as string,
    finished_at: (d.finished_at as string | null) ?? null,
    created_at: d.created_at as string,
    profile: d.profiles as SudokuGameRow["profile"],
  };
}

export async function getSudokuTodayGame(
  userId: string,
  gameDate: string,
): Promise<SudokuGameRow | null> {
  try {
    const { data, error } = await supabase
      .from("sudoku_games")
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

export async function saveSudokuGame(
  userId: string,
  gameDate: string,
  fields: {
    difficulty: SudokuDifficulty;
    board: string;
    mistakes: number;
    elapsed_seconds: number;
    status: GameStatus;
    score: number;
    started_at: string;
  },
): Promise<{ error: string | null }> {
  try {
    const finished_at = fields.status === "won" ? new Date().toISOString() : null;
    const { error } = await supabase.from("sudoku_games").upsert(
      {
        user_id: userId,
        game_date: gameDate,
        difficulty: fields.difficulty,
        board: fields.board,
        mistakes: fields.mistakes,
        elapsed_seconds: fields.elapsed_seconds,
        status: fields.status,
        score: fields.score,
        started_at: fields.started_at,
        finished_at,
      },
      { onConflict: "user_id,game_date" },
    );
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function getSudokuDailyLeaderboard(
  gameDate: string,
): Promise<SudokuLeaderboardEntry[]> {
  try {
    const { data } = await supabase
      .from("sudoku_games")
      .select(
        "user_id, status, difficulty, mistakes, elapsed_seconds, score, finished_at, profiles(display_name, avatar_url)",
      )
      .eq("game_date", gameDate)
      .eq("status", "won");

    const rows = (data ?? []) as Record<string, unknown>[];
    return rows
      .map((r) => {
        const profile = r.profiles as { display_name: string; avatar_url: string | null } | null;
        return {
          user_id: r.user_id as string,
          display_name: profile?.display_name ?? "Jogador",
          avatar_url: profile?.avatar_url ?? null,
          status: r.status as GameStatus,
          difficulty: (r.difficulty as SudokuDifficulty) ?? "medio",
          mistakes: Number(r.mistakes ?? 0),
          elapsed_seconds: Number(r.elapsed_seconds ?? 0),
          score: Number(r.score ?? 0),
          finished_at: (r.finished_at as string | null) ?? null,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.elapsed_seconds !== b.elapsed_seconds) return a.elapsed_seconds - b.elapsed_seconds;
        return a.mistakes - b.mistakes;
      });
  } catch {
    return [];
  }
}

export async function getSudokuOverallEntries(): Promise<SudokuOverallEntry[]> {
  try {
    const { data } = await supabase
      .from("sudoku_games")
      .select("user_id, status, score, profiles(display_name, avatar_url)")
      .eq("status", "won");

    const rows = (data ?? []) as Record<string, unknown>[];
    const byUser = new Map<string, SudokuOverallEntry>();

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
      entry.wins += 1;
      byUser.set(userId, entry);
    }

    return Array.from(byUser.values()).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.wins - a.wins;
    });
  } catch {
    return [];
  }
}
