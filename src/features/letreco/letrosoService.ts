import { supabase } from "@/lib/supabase";
import { cachedQuery, readCache, writeCache } from "@/lib/localCache";
import { isNetworkErrorMessage, isOnline } from "@/lib/online";
import { fetchMyGameRow, saveMyGameRow } from "@/lib/offlineGames";
import { LETROSO_WORDS, normalize } from "./letrosoLogic";
import { isValidWord } from "./letrecoLogic";
import type {
  GameStatus,
  LetrosoGame,
  LetrosoLeaderboardEntry,
  LetrosoOverallEntry,
} from "./letrosoTypes";
import type { OverallEntry } from "./letrecoTypes";

// ─── Validação server-side ───────────────────────────────────────────

// As respostas do dia saem de words_letroso.txt, mas o dicionário do banco é outro:
// uma resposta ausente dele seria recusada como "palavra não encontrada".
const ANSWER_POOL = new Set(LETROSO_WORDS);

const VALIDATED_KEY = "letroso:validated-words";
const MAX_REMEMBERED = 3000;

function rememberValid(word: string): void {
  const known = readCache<string[]>(VALIDATED_KEY) ?? [];
  if (known.includes(word)) return;
  writeCache(VALIDATED_KEY, [...known, word].slice(-MAX_REMEMBERED));
}

/**
 * Valida o palpite. Online: pelo dicionário do banco (e lembra as palavras aceitas).
 * Sem rede: aceita as respostas do jogo, as já validadas antes neste aparelho e as
 * palavras de 5 letras do dicionário local do Letreco.
 */
export async function validateLetrosoWord(word: string): Promise<boolean> {
  const w = normalize(word);
  if (ANSWER_POOL.has(w)) return true;
  if ((readCache<string[]>(VALIDATED_KEY) ?? []).includes(w)) return true;
  const offlineGuess = () => isValidWord(w);
  if (!isOnline()) return offlineGuess();
  try {
    const { data, error } = await supabase.rpc("validate_letroso_word", { p_word: w });
    if (error) return isNetworkErrorMessage(error.message) ? offlineGuess() : false;
    if (data === true) rememberValid(w);
    return data === true;
  } catch (e) {
    return isNetworkErrorMessage(e) ? offlineGuess() : false;
  }
}

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
    const row = await fetchMyGameRow("letroso_games", userId, gameDate);
    return row ? mapRow(row) : null;
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
    const { error } = await saveMyGameRow("letroso_games", userId, gameDate, {
        guesses: fields.guesses,
        status: fields.status,
        attempts: fields.attempts,
        score: fields.score,
        finished_at,
      });
    return { error };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function getLetrosoDailyLeaderboard(
  gameDate: string,
): Promise<LetrosoLeaderboardEntry[]> {
  try {
    const { data } = await cachedQuery(`lb:getLetrosoDailyLeaderboard:${gameDate}`, () =>
      supabase
        .from("letroso_games")
        .select("user_id, status, attempts, score, finished_at, profiles(display_name, avatar_url)")
        .eq("game_date", gameDate)
        .neq("status", "playing"),
    );

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
    const { data } = await cachedQuery(`lb:getLetrosoOverallEntries`, () =>
      supabase
        .from("letroso_games")
        .select("user_id, status, score, profiles(display_name, avatar_url)")
        .neq("status", "playing"),
    );

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

