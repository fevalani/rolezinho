import { supabase } from "@/lib/supabase";
import type { AdminUser } from "./adminTypes";

// Tabelas: app_admins, profiles — migration: supabase/admin_roles_migration.sql
// (única porta de acesso do painel ao Supabase)

type Row = Record<string, unknown>;

async function rows(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  try {
    const { data, error } = await p;
    return error || !Array.isArray(data) ? [] : (data as Row[]);
  } catch {
    return [];
  }
}

/** Todos os perfis (a RLS de profiles decide o que vem). */
export async function fetchUsers(): Promise<AdminUser[]> {
  const list = await rows(
    supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url, app_version, app_last_seen_at, created_at")
      .order("display_name", { ascending: true }),
  );
  return list.map((r) => ({
    id: r.id as string,
    displayName: ((r.display_name as string) ?? "").trim() || "Sem nome",
    email: (r.email as string) ?? "",
    avatarUrl: (r.avatar_url as string | null) ?? null,
    appVersion: (r.app_version as string | null) ?? null,
    lastSeenAt: (r.app_last_seen_at as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));
}

/** Ids dos administradores. */
export async function fetchAdminIds(): Promise<string[]> {
  return (await rows(supabase.from("app_admins").select("user_id"))).map((r) => r.user_id as string);
}

export async function addAdmin(userId: string, addedBy: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("app_admins").insert({ user_id: userId, added_by: addedBy });
  return { error: error?.message ?? null };
}

/** O banco recusa remover o último admin (mensagem vem do gatilho). */
export async function removeAdmin(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("app_admins").delete().eq("user_id", userId);
  return { error: error?.message ?? null };
}
