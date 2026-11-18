// Tabela: wrapped_editions — migration: supabase/wrapped_migration.sql

export type CustomSlideType =
  | "intro"
  | "custom_ranking"
  | "highlight"
  | "quote"
  | "media";

export type AutoMetricKey =
  | "summary"
  | "top_music"
  | "top_cultura"
  | "games"
  | "dice"
  | "bolao"
  | "agenda"
  | "peak_weekday"
  | "top_members"
  | "top_players"
  | "top_music_members"
  | "top_cultura_members"
  | "top_dice_members"
  | "top_bolao_members"
  | "top_agenda_members";

export interface WrappedTheme {
  primary?: string;
  secondary?: string;
  background?: string;
}

export interface WrappedItem {
  rank: number;
  label: string;
  sublabel?: string;
  imageUrl?: string;
}

/** Slide já validado/normalizado (saída de `parseEdition`). */
export interface WrappedSlideConfig {
  position: number;
  type: CustomSlideType | "auto_user_stats";
  metricKey?: AutoMetricKey;
  title?: string;
  description?: string;
  imageUrl?: string;
  backgroundImageUrl?: string;
  items?: WrappedItem[];
}

export interface WrappedEdition {
  slug: string;
  pageTitle: string;
  subtitle?: string;
  theme?: WrappedTheme;
  isActive: boolean;
  /** Janela de exibição, "YYYY-MM-DD" (fuso de São Paulo), ambos inclusive e opcionais. */
  startsAt?: string;
  endsAt?: string;
  slides: WrappedSlideConfig[];
}

// ── dados crus do usuário (service → logic) ──

export type GameKey = "letreco" | "letroso" | "sudoku" | "word500" | "fronteiras";

export type WrappedMode = "user" | "group";

/** Linhas cruas; `user_id` só vem no modo grupo. */
export interface WrappedRaw {
  musics: { user_id?: string; pick_date: string; title: string; artist: string | null; thumbnail: string | null }[];
  culturaPosts: { user_id?: string; item_id: string; personal_rating: number | null; created_at: string }[];
  culturaItems: { id: string; title: string; cover_url: string | null; type: string; genres: string[] }[];
  dice: { user_id?: string; dice_type: string; result: number; created_at: string }[];
  games: { user_id?: string; game: GameKey; game_date: string; status: string; score: number }[];
  predictions: { user_id?: string; points_earned: number | null; created_at: string }[];
  rsvps: { user_id?: string; status: string; updated_at: string }[];
}

/** Rankings de pessoas por módulo do app (modo grupo). */
export type MemberBoards = Partial<
  Record<"players" | "music" | "cultura" | "dice" | "bolao" | "agenda", WrappedItem[]>
>;

export interface WrappedStats {
  year: number;
  totalActions: number;
  music: { total: number; top: { label: string; count: number; imageUrl?: string }[] } | null;
  cultura: {
    total: number;
    avgRating: number | null;
    topGenres: { label: string; count: number }[];
    best: { title: string; rating: number; imageUrl?: string } | null;
  } | null;
  games: {
    played: number;
    won: number;
    points: number;
    favorite: { game: GameKey; label: string; count: number };
    longestStreak: number;
  } | null;
  dice: { total: number; crits: number; fumbles: number; favoriteDice: string } | null;
  bolao: { total: number; points: number } | null;
  agenda: { confirmed: number; maybe: number } | null;
  peakWeekday: { label: string; count: number } | null;
}

// ── slide pronto para renderizar ──

export interface ResolvedSlide {
  key: string;
  kind: "intro" | "stat" | "list" | "highlight" | "quote" | "media" | "outro";
  emoji?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  backgroundImageUrl?: string;
  big?: { value: string; label: string };
  items?: WrappedItem[];
  facts?: { label: string; value: string }[];
}
