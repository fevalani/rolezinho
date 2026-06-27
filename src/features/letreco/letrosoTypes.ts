export type LetrosoTileStatus =
  | "absent"
  | "present"
  | "solo"         // letra correta isolada (não adjacente a outras corretas)
  | "block_start"  // início de bloco de letras corretas consecutivas
  | "block_mid"    // meio do bloco
  | "block_end"    // fim do bloco
  | "cap_s"        // início do grupo esquerdo da cápsula (começo da palavra)
  | "cap_s_end"    // fim do grupo esquerdo da cápsula
  | "cap_e"        // início do grupo direito da cápsula (fim da palavra)
  | "cap_e_end";   // fim do grupo direito da cápsula

export type GameStatus = "playing" | "won" | "lost";

export interface LetrosoGame {
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

export interface LetrosoLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: GameStatus;
  attempts: number;
  score: number;
  finished_at: string | null;
}

export interface LetrosoOverallEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  totalScore: number;
  games: number;
  wins: number;
}
