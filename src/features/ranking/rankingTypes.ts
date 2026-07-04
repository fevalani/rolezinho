export interface RankingTable {
  id: string;
  title: string;
  icon: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_TABLE_ICON = "🏆";

/** Opções de emoji oferecidas ao criar/editar uma tabela */
export const RANKING_ICONS = [
  "🏆",
  "🎾",
  "⚽",
  "🏀",
  "🏐",
  "🏈",
  "🎱",
  "🎳",
  "🏓",
  "🏸",
  "♟️",
  "🃏",
  "🎮",
  "🎲",
  "🥊",
  "🏹",
];

export interface RankingCategory {
  id: string;
  table_id: string;
  name: string;
  points_per_unit: number;
  display_order: number;
  created_at: string;
}

/** Pessoa da tabela — pode ser um usuário do app (profile_id) ou nome livre (external_name) */
export interface RankingEntry {
  id: string;
  table_id: string;
  profile_id: string | null;
  display_name: string;
  avatar_url: string | null;
  is_app_user: boolean;
  /** category_id -> valor lançado */
  values: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export type PendingEditStatus = "pending" | "approved" | "rejected";

export interface RankingPendingEdit {
  id: string;
  entry_id: string;
  category_id: string;
  previous_value: number;
  new_value: number;
  proposed_by: string;
  proposed_by_name: string;
  status: PendingEditStatus;
  approved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface RankingTableDetail {
  table: RankingTable;
  categories: RankingCategory[];
  entries: RankingEntry[];
  pendingEdits: RankingPendingEdit[];
}

export interface RankingTableSummary {
  table: RankingTable;
  entryCount: number;
  leaderName: string | null;
  leaderPoints: number | null;
}

/** Categorias semeadas ao criar uma tabela nova — o admin pode editar/remover/adicionar depois */
export const DEFAULT_CATEGORIES: { name: string; points_per_unit: number }[] = [
  { name: "Vitória", points_per_unit: 3 },
  { name: "Empate", points_per_unit: 1 },
  { name: "Derrota", points_per_unit: 0 },
];
