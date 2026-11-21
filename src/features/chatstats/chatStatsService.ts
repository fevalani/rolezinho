import { supabase } from "@/lib/supabase";
import { parseChatStats } from "./chatStatsLogic";
import type { ChatStats } from "./chatStatsTypes";

// Tabelas: chat_stats_snapshots / chat_stats_viewers — migration: supabase/chat_stats_migration.sql
// Quem pode ler é decidido pela RLS (lista de quem vê + admin); aqui não há regra de permissão.

type Row = Record<string, unknown>;

function fromRow(r: Row): ChatStats | null {
  const cfg = (r.config && typeof r.config === "object" ? r.config : {}) as Row;
  return parseChatStats({ ...cfg, slug: r.slug, isActive: r.is_active === true }).stats;
}

/** Snapshot pelo slug, ou, sem slug, o mais recente ativo que o usuário pode ver (a RLS filtra o resto). */
export async function fetchChatStats(slug?: string): Promise<ChatStats | null> {
  try {
    const base = supabase.from("chat_stats_snapshots").select("*");
    const { data, error } = slug
      ? await base.eq("slug", slug).limit(1)
      : await base.eq("is_active", true).order("slug", { ascending: false }).limit(1);
    if (error || !data?.length) return null;
    return fromRow((data as Row[])[0]);
  } catch {
    return null;
  }
}

/** Todos os snapshots (rascunhos só aparecem para o admin, via RLS). */
export async function fetchChatStatsList(): Promise<ChatStats[]> {
  try {
    const { data, error } = await supabase.from("chat_stats_snapshots").select("*").order("slug", { ascending: false });
    if (error || !data) return [];
    return (data as Row[]).map(fromRow).filter((s): s is ChatStats => s !== null);
  } catch {
    return [];
  }
}

export async function saveChatStats(stats: ChatStats): Promise<{ error: string | null }> {
  const { slug, isActive, ...config } = stats;
  const { error } = await supabase
    .from("chat_stats_snapshots")
    .upsert({ slug, config, is_active: isActive, updated_at: new Date().toISOString() }, { onConflict: "slug" });
  return { error: error?.message ?? null };
}

export async function deleteChatStats(slug: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("chat_stats_snapshots").delete().eq("slug", slug);
  return { error: error?.message ?? null };
}

async function safeRows(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  try {
    const { data, error } = await p;
    return error || !Array.isArray(data) ? [] : (data as Row[]);
  } catch {
    return [];
  }
}

/** Quem pode ver o snapshot (ids dos perfis). Só o admin lê a lista toda (RLS). */
export async function fetchChatStatsViewers(slug: string): Promise<string[]> {
  const rows = await safeRows(supabase.from("chat_stats_viewers").select("user_id").eq("slug", slug));
  return rows.map((r) => r.user_id as string);
}

export async function fetchChatStatsViewerCounts(): Promise<Record<string, number>> {
  const rows = await safeRows(supabase.from("chat_stats_viewers").select("slug"));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.slug as string] = (out[r.slug as string] ?? 0) + 1;
  return out;
}

/** Grava a lista de quem vê (só aplica a diferença; falha de leitura não apaga nada). */
export async function saveChatStatsViewers(slug: string, userIds: string[]): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.from("chat_stats_viewers").select("user_id").eq("slug", slug);
    if (error) return { error: error.message };
    const current = new Set(((data ?? []) as Row[]).map((r) => r.user_id as string));
    const wanted = new Set(userIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));
    if (removed.length) {
      const { error: e } = await supabase.from("chat_stats_viewers").delete().eq("slug", slug).in("user_id", removed);
      if (e) return { error: e.message };
    }
    if (added.length) {
      const { error: e } = await supabase
        .from("chat_stats_viewers")
        .upsert(added.map((user_id) => ({ slug, user_id })), { onConflict: "slug,user_id" });
      if (e) return { error: e.message };
    }
    return { error: null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
