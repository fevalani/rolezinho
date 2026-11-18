import type { AdminUser } from "./adminTypes";

/**
 * Motivo pelo qual um admin NÃO pode ser removido pela tela (ou null se pode).
 * O banco também barra remover o último (gatilho); isto evita o erro e explica.
 */
export function removeBlockReason(adminIds: string[], targetId: string, selfId: string | undefined): string | null {
  if (targetId === selfId) return "Você não pode remover a si mesmo.";
  if (adminIds.length <= 1) return "É o único administrador.";
  return null;
}

/** Usuários que ainda não são admin, filtrados pela busca (nome ou e-mail). */
export function adminCandidates(users: AdminUser[], adminIds: string[], query: string): AdminUser[] {
  const ids = new Set(adminIds);
  const q = query.trim().toLocaleLowerCase("pt-BR");
  return users.filter(
    (u) =>
      !ids.has(u.id) &&
      (!q || u.displayName.toLocaleLowerCase("pt-BR").includes(q) || u.email.toLocaleLowerCase("pt-BR").includes(q)),
  );
}

// ── Usuários: versão instalada e última abertura ──

/** "web 0.0.90" ou "1.0.2 (12) · web 0.0.90" → "0.0.90" (a versão do código web carregado). */
export function parseWebVersion(appVersion: string | null): string | null {
  const m = /web\s+(\d+\.\d+\.\d+)/.exec(appVersion ?? "");
  return m ? m[1] : null;
}

/** <0 se a < b, 0 se iguais, >0 se a > b (compara 0.0.9 < 0.0.10 como números). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** O usuário abriu o app pela última vez numa versão web mais antiga que a atual? (sem dados: não alarma) */
export function isOutdated(u: AdminUser, currentVersion: string | undefined): boolean {
  const v = parseWebVersion(u.appVersion);
  return !!v && !!currentVersion && compareVersions(v, currentVersion) < 0;
}

/** "hoje", "ontem", "há 5 dias", "nunca abriu". */
export function lastSeenLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nunca abriu";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "nunca abriu";
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/** Mais recentes primeiro; quem nunca abriu vai para o fim. */
export function sortByLastSeen(users: AdminUser[]): AdminUser[] {
  const t = (u: AdminUser) => (u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : -Infinity);
  return [...users].sort((a, b) => t(b) - t(a) || a.displayName.localeCompare(b.displayName, "pt-BR"));
}

export function filterUsers(users: AdminUser[], query: string): AdminUser[] {
  const q = query.trim().toLocaleLowerCase("pt-BR");
  return q ? users.filter((u) => u.displayName.toLocaleLowerCase("pt-BR").includes(q) || u.email.toLocaleLowerCase("pt-BR").includes(q)) : users;
}

export function summarizeUsers(users: AdminUser[], currentVersion: string | undefined, now: Date = new Date()) {
  const week = 7 * 86_400_000;
  return {
    total: users.length,
    activeLast7d: users.filter((u) => u.lastSeenAt && now.getTime() - new Date(u.lastSeenAt).getTime() <= week).length,
    outdated: users.filter((u) => isOutdated(u, currentVersion)).length,
    neverSeen: users.filter((u) => !u.lastSeenAt).length,
  };
}
