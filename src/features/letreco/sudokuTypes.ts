// ═══════════════════════════════════════════
// Sudoku — Jogo diário (3ª modalidade de Jogos Diários)
// ═══════════════════════════════════════════

/** Estado de uma partida do dia */
export type GameStatus = "playing" | "won";

/** Dificuldade escolhida pelo jogador ao começar a partida do dia */
export type SudokuDifficulty = "facil" | "medio" | "dificil";

/** Puzzle do dia: strings de 81 chars, row-major, '0' = célula vazia no puzzle */
export interface SudokuOfDay {
  puzzle: string;
  solution: string;
}

/** Linha do banco `sudoku_games` (uma partida por jogador por dia) */
export interface SudokuGameRow {
  id: string;
  user_id: string;
  game_date: string; // "YYYY-MM-DD" (fuso America/Sao_Paulo)
  difficulty: SudokuDifficulty;
  board: string; // 81 chars, estado atual (autosave)
  mistakes: number;
  elapsed_seconds: number;
  status: GameStatus;
  score: number;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

/** Linha do ranking diário */
export interface SudokuLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: GameStatus;
  difficulty: SudokuDifficulty;
  mistakes: number;
  elapsed_seconds: number;
  score: number;
  finished_at: string | null;
}

/** Linha do ranking geral (pontuação acumulada de todos os dias) */
export interface SudokuOverallEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  totalScore: number;
  games: number;
  wins: number;
}
