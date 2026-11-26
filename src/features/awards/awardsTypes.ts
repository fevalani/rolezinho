// Tabelas: awards_editions / awards_categories / awards_nominees / awards_votes / awards_viewers / awards_admins
// Migration: supabase/awards_migration.sql

/** Fases da edição; quem troca é um admin do awards. `hidden` só os admins enxergam. */
export type AwardsPhase = "hidden" | "nominations" | "voting" | "closed";

/** Limites por pessoa (o banco impõe; a tela só reflete). Admin do awards é isento. */
export const MAX_CATEGORIES_PER_USER = 5;
export const MAX_NOMINEES_PER_USER_PER_CATEGORY = 10;

/** Quem vê a edição (fora a fase `hidden`): todos, ou só as pessoas escolhidas por um admin. */
export type AwardsAudience = "all" | "selected";

export interface AwardsEdition {
  slug: string;
  title: string;
  subtitle: string | null;
  phase: AwardsPhase;
  audience: AwardsAudience;
}

export interface AwardsUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AwardsCategory {
  id: string;
  editionSlug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  createdBy: string;
  /** Aprovada por um admin do awards: entra na aba "Aprovadas" e na cédula. */
  approved: boolean;
}

export interface AwardsNominee {
  id: string;
  categoryId: string;
  label: string | null;
  imageUrl: string | null;
  createdBy: string;
}

/** categoryId → nomineeId escolhido pelo usuário. */
export type MyVotes = Record<string, string>;

export interface NomineeResult {
  nomineeId: string;
  votes: number;
}

/** categoryId → ranking (do mais votado para o menos). */
export type AwardsResults = Record<string, NomineeResult[]>;
