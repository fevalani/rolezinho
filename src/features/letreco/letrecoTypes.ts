// ═══════════════════════════════════════════
// Letreco — Jogo da palavra do dia
// ═══════════════════════════════════════════

/** Status de cada letra de um palpite */
export type LetterStatus = "correct" | "present" | "absent";

/** Estado de uma partida do dia */
export type GameStatus = "playing" | "won" | "lost";

/** Linha do banco `letreco_games` (uma partida por jogador por dia) */
export interface LetrecoGame {
  id: string;
  user_id: string;
  game_date: string; // "YYYY-MM-DD" (fuso America/Sao_Paulo)
  guesses: string[]; // palpites na ordem, normalizados (maiúsculas, sem acento)
  status: GameStatus;
  attempts: number; // nº de palpites usados
  score: number;
  finished_at: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

/** Linha do ranking diário */
export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
}

/** Linha do ranking geral (pontuação acumulada de todos os dias) */
export interface OverallEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  totalScore: number;
  games: number;
  wins: number;
}

/** Estatísticas pessoais acumuladas */
export interface LetrecoStats {
  played: number;
  wins: number;
  winRate: number; // 0-100
  currentStreak: number;
  maxStreak: number;
  totalScore: number;
  /** distribuição de vitórias por nº da tentativa do acerto (índice 0 = 1ª tentativa) */
  distribution: number[];
}
