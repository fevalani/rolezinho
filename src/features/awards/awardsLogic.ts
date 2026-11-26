// Regra pura do Awards (sem rede): limites, permissões, validação, cédula e resultado.
import {
  MAX_CATEGORIES_PER_USER,
  MAX_NOMINEES_PER_USER_PER_CATEGORY,
  type AwardsCategory,
  type AwardsNominee,
  type AwardsPhase,
  type AwardsResults,
  type MyVotes,
} from "./awardsTypes";

export const PHASE_LABEL: Record<AwardsPhase, string> = {
  hidden: "Oculto",
  nominations: "Indicações abertas",
  voting: "Votação aberta",
  closed: "Encerrado",
};

export const PHASES: AwardsPhase[] = ["hidden", "nominations", "voting", "closed"];

/** A edição aparece para o grupo (Home e /awards) em qualquer fase menos `hidden`. */
export const isEditionVisible = (phase: AwardsPhase) => phase !== "hidden";

/** Quantas vagas faltam. Admin não tem limite (`Infinity`). */
export function remainingQuota(used: number, max: number, isAdmin = false): number {
  if (isAdmin) return Infinity;
  return Math.max(0, max - used);
}

export const countOwned = (items: { createdBy: string }[], userId: string | null | undefined) =>
  userId ? items.filter((i) => i.createdBy === userId).length : 0;

export const categoryQuota = (categories: AwardsCategory[], userId: string | null | undefined, isAdmin: boolean) =>
  remainingQuota(countOwned(categories, userId), MAX_CATEGORIES_PER_USER, isAdmin);

export const nomineeQuota = (nominees: AwardsNominee[], userId: string | null | undefined, isAdmin: boolean) =>
  remainingQuota(countOwned(nominees, userId), MAX_NOMINEES_PER_USER_PER_CATEGORY, isAdmin);

/** Categoria nova só na fase `nominations` (admin do awards pode também nas outras, para corrigir). */
export const canNominate = (phase: AwardsPhase, isAdmin: boolean) => phase === "nominations" || isAdmin;

/** Fora da cédula, cada um só vê as categorias que criou; admin do awards vê todas. */
export const visibleCategories = (categories: AwardsCategory[], userId: string | null | undefined, isAdmin: boolean) =>
  isAdmin ? categories : categories.filter((c) => !!userId && c.createdBy === userId);

export const approvedCategories = (categories: AwardsCategory[]) => categories.filter((c) => c.approved);

const isOwnerNominating = (category: AwardsCategory, userId: string | null | undefined, phase: AwardsPhase) =>
  !!userId && category.createdBy === userId && phase === "nominations";

/** Renomear/apagar a categoria: dono na indicação enquanto não aprovada; admin sempre. */
export function canEditCategory(
  category: AwardsCategory,
  userId: string | null | undefined,
  isAdmin: boolean,
  phase: AwardsPhase,
): boolean {
  return isAdmin || (!category.approved && isOwnerNominating(category, userId, phase));
}

/** Adicionar/editar/apagar indicados: dono da categoria na indicação (mesmo aprovada); admin sempre. */
export function canManageNominees(
  category: AwardsCategory,
  userId: string | null | undefined,
  isAdmin: boolean,
  phase: AwardsPhase,
): boolean {
  return isAdmin || isOwnerNominating(category, userId, phase);
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateCategory(title: string): ValidationResult {
  const t = title.trim();
  if (!t) return { ok: false, error: "Dê um nome para a categoria." };
  if (t.length > 80) return { ok: false, error: "O nome da categoria passa de 80 caracteres." };
  return { ok: true };
}

/** Indicado precisa de texto e/ou imagem. */
export function validateNominee(label: string, hasImage: boolean): ValidationResult {
  const t = label.trim();
  if (!t && !hasImage) return { ok: false, error: "Informe um nome ou uma imagem." };
  if (t.length > 80) return { ok: false, error: "O nome passa de 80 caracteres." };
  return { ok: true };
}

export const nomineeName = (n: Pick<AwardsNominee, "label">) => n.label?.trim() || "Sem nome";

export const sortCategories = (list: AwardsCategory[]) =>
  [...list].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "pt-BR"));

export function groupNominees(nominees: AwardsNominee[]): Record<string, AwardsNominee[]> {
  const out: Record<string, AwardsNominee[]> = {};
  for (const n of nominees) (out[n.categoryId] ??= []).push(n);
  return out;
}

// ─── Cédula ─────────────────────────────────────────────────────────────────

/** Só entram na cédula categorias aprovadas com pelo menos 2 indicados (com 1 não há o que escolher). */
export const ballotCategories = (categories: AwardsCategory[], byCategory: Record<string, AwardsNominee[]>) =>
  sortCategories(approvedCategories(categories)).filter((c) => (byCategory[c.id]?.length ?? 0) >= 2);

export interface BallotProgress {
  voted: number;
  total: number;
  complete: boolean;
  missing: string[]; // ids das categorias sem voto
}

export function ballotProgress(categoryIds: string[], votes: MyVotes): BallotProgress {
  const missing = categoryIds.filter((id) => !votes[id]);
  return {
    voted: categoryIds.length - missing.length,
    total: categoryIds.length,
    complete: categoryIds.length > 0 && missing.length === 0,
    missing,
  };
}

/** Próxima categoria (índice) sem voto depois de `from`; -1 se não houver. */
export function nextUnvoted(categoryIds: string[], votes: MyVotes, from: number): number {
  for (let i = from + 1; i < categoryIds.length; i++) if (!votes[categoryIds[i]]) return i;
  return -1;
}

export const clampStep = (i: number, len: number) => Math.max(0, Math.min(len, i));

// ─── Resultado ──────────────────────────────────────────────────────────────

export interface RankedNominee {
  nominee: AwardsNominee;
  votes: number;
  pct: number;
  isWinner: boolean;
}

/** Ranking da categoria; empate no topo vira vários vencedores. Sem votos, ninguém vence. */
export function rankCategory(nominees: AwardsNominee[], results: AwardsResults, categoryId: string): RankedNominee[] {
  const votes = new Map((results[categoryId] ?? []).map((r) => [r.nomineeId, r.votes]));
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const rows = nominees
    .map((nominee) => ({ nominee, votes: votes.get(nominee.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || nomineeName(a.nominee).localeCompare(nomineeName(b.nominee), "pt-BR"));
  const top = rows[0]?.votes ?? 0;
  return rows.map((r) => ({
    ...r,
    pct: total ? Math.round((r.votes / total) * 100) : 0,
    isWinner: top > 0 && r.votes === top,
  }));
}
