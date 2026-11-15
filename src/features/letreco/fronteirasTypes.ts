export type GameStatus = "playing" | "won" | "lost";

/** País do mapa: path SVG já projetado (viewBox do `world.json`) + vizinhos por código ISO. */
export interface FronteirasCountry {
  iso: string;
  name: string;
  d: string;
  borders: string[];
}

export interface FronteirasWorld {
  width: number;
  height: number;
  countries: FronteirasCountry[];
}

/** Cor do palpite: distância (em fronteiras) até o caminho mais curto. */
export type GuessColor = "green" | "orange" | "red" | "darkred";

export interface FronteirasGame {
  id: string;
  user_id: string;
  game_date: string;
  guesses: string[];
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
  created_at: string;
}

export interface FronteirasLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
}

export interface FronteirasOverallEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  totalScore: number;
  games: number;
  wins: number;
}
