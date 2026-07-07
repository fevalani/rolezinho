export type GameStatus = "playing" | "won" | "lost";

export interface GuessCounts {
  green: number;
  yellow: number;
  red: number;
}

export interface Word500Game {
  id: string;
  user_id: string;
  game_date: string;
  guesses: string[];
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

export interface Word500LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
}

export interface Word500OverallEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  totalScore: number;
  games: number;
  wins: number;
}
