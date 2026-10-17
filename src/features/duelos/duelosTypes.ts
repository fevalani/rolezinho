export interface DuelRanking {
  id: string;
  owner_id: string;
  title: string;
  icon: string;
  created_at: string;
}

export interface DuelItem {
  id: string;
  ranking_id: string;
  name: string;
  position: number;
}

export interface DuelComparisonRow {
  id: string;
  winner_id: string;
  loser_id: string;
  user_id: string;
  created_at: string;
}

export interface DuelParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  comparisons: DuelComparisonRow[];
  finished: boolean;
  /** Ordem total (melhor primeiro); vazia enquanto não terminou. */
  order: string[];
}

export interface DuelRankingDetail {
  ranking: DuelRanking;
  items: DuelItem[];
  participants: DuelParticipant[];
}

export type DuelMyStatus = "not_started" | "in_progress" | "finished";

export interface DuelRankingSummary {
  ranking: DuelRanking;
  itemCount: number;
  participantCount: number;
  finishedCount: number;
  myStatus: DuelMyStatus;
}

export const DEFAULT_DUEL_ICON = "⚔️";

export const DUEL_ICONS = [
  "⚔️",
  "🎬",
  "🍕",
  "🎵",
  "🎮",
  "📚",
  "⚽",
  "🍔",
  "🍺",
  "✈️",
  "🐶",
  "⭐",
];
