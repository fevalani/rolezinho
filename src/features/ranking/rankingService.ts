import { supabase } from "@/lib/supabase";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_TABLE_ICON,
  type RankingCategory,
  type RankingEntry,
  type RankingPendingEdit,
  type RankingTable,
  type RankingTableDetail,
  type RankingTableSummary,
} from "./rankingTypes";
import { sortEntries } from "./rankingLogic";

// ─── Helpers de mapeamento ──────────────────────────────────────────────────

function mapTable(row: Record<string, unknown>): RankingTable {
  return {
    id: row.id as string,
    title: row.title as string,
    icon: (row.icon as string) ?? DEFAULT_TABLE_ICON,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapCategory(row: Record<string, unknown>): RankingCategory {
  return {
    id: row.id as string,
    table_id: row.table_id as string,
    name: row.name as string,
    points_per_unit: Number(row.points_per_unit),
    display_order: row.display_order as number,
    created_at: row.created_at as string,
  };
}

function mapPendingEdit(row: Record<string, unknown>): RankingPendingEdit {
  const profile = row.profiles as Record<string, unknown> | null;
  return {
    id: row.id as string,
    entry_id: row.entry_id as string,
    category_id: row.category_id as string,
    previous_value: Number(row.previous_value),
    new_value: Number(row.new_value),
    proposed_by: row.proposed_by as string,
    proposed_by_name: (profile?.display_name as string) ?? "Alguém",
    status: row.status as RankingPendingEdit["status"],
    approved_by: row.approved_by as string | null,
    created_at: row.created_at as string,
    resolved_at: row.resolved_at as string | null,
  };
}

function buildEntries(
  entryRows: Record<string, unknown>[],
  valueRows: Record<string, unknown>[],
): RankingEntry[] {
  const valuesByEntry = new Map<string, Record<string, number>>();
  for (const v of valueRows) {
    const entryId = v.entry_id as string;
    if (!valuesByEntry.has(entryId)) valuesByEntry.set(entryId, {});
    valuesByEntry.get(entryId)![v.category_id as string] = Number(v.value);
  }

  return entryRows.map((e) => {
    const profile = e.profiles as Record<string, unknown> | null;
    const isAppUser = e.profile_id !== null && profile !== null;
    return {
      id: e.id as string,
      table_id: e.table_id as string,
      profile_id: e.profile_id as string | null,
      display_name: isAppUser
        ? (profile!.display_name as string)
        : ((e.external_name as string) ?? "?"),
      avatar_url: isAppUser ? (profile!.avatar_url as string | null) : null,
      is_app_user: isAppUser,
      values: valuesByEntry.get(e.id as string) ?? {},
      created_at: e.created_at as string,
      updated_at: e.updated_at as string,
    };
  });
}

/** Lista de perfis do app, pra oferecer como opção ao adicionar pessoa numa tabela */
export async function fetchAllProfiles(): Promise<
  { id: string; display_name: string; avatar_url: string | null }[]
> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .order("display_name", { ascending: true });
  return data ?? [];
}

// ─── Tabelas ────────────────────────────────────────────────────────────────

export async function fetchAllTables(): Promise<RankingTableSummary[]> {
  const { data: tableRows } = await supabase
    .from("ranking_tables")
    .select("*")
    .order("created_at", { ascending: false });

  const tables = ((tableRows ?? []) as Record<string, unknown>[]).map(mapTable);
  if (tables.length === 0) return [];

  const tableIds = tables.map((t) => t.id);

  const [categoriesRes, entriesRes] = await Promise.all([
    supabase.from("ranking_categories").select("*").in("table_id", tableIds),
    supabase
      .from("ranking_entries")
      .select("*, profiles:profile_id(id, display_name, avatar_url)")
      .in("table_id", tableIds),
  ]);

  const categories = ((categoriesRes.data ?? []) as Record<string, unknown>[]).map(mapCategory);
  const entryRows = (entriesRes.data ?? []) as Record<string, unknown>[];
  const entryIds = entryRows.map((e) => e.id as string);

  const { data: valueRows } = entryIds.length
    ? await supabase.from("ranking_entry_values").select("*").in("entry_id", entryIds)
    : { data: [] };

  const entries = buildEntries(entryRows, (valueRows ?? []) as Record<string, unknown>[]);

  return tables.map((table) => {
    const tableCategories = categories.filter((c) => c.table_id === table.id);
    const tableEntries = entries.filter((e) => e.table_id === table.id);
    const sorted = sortEntries(tableEntries, tableCategories);
    const leader = sorted[0];
    const leaderPoints = leader
      ? tableCategories.reduce((sum, c) => sum + (leader.values[c.id] ?? 0) * c.points_per_unit, 0)
      : null;

    return {
      table,
      entryCount: tableEntries.length,
      leaderName: leader?.display_name ?? null,
      leaderPoints,
    };
  });
}

export async function fetchTableDetail(tableId: string): Promise<RankingTableDetail | null> {
  const [tableRes, categoriesRes, entriesRes] = await Promise.all([
    supabase.from("ranking_tables").select("*").eq("id", tableId).maybeSingle(),
    supabase
      .from("ranking_categories")
      .select("*")
      .eq("table_id", tableId)
      .order("display_order", { ascending: true }),
    supabase
      .from("ranking_entries")
      .select("*, profiles:profile_id(id, display_name, avatar_url)")
      .eq("table_id", tableId),
  ]);

  if (!tableRes.data) return null;

  const categories = ((categoriesRes.data ?? []) as Record<string, unknown>[]).map(mapCategory);
  const entryRows = (entriesRes.data ?? []) as Record<string, unknown>[];
  const entryIds = entryRows.map((e) => e.id as string);

  const [valuesRes, pendingRes] = await Promise.all([
    entryIds.length
      ? supabase.from("ranking_entry_values").select("*").in("entry_id", entryIds)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? supabase
          .from("ranking_pending_edits")
          .select("*, profiles:proposed_by(display_name)")
          .in("entry_id", entryIds)
          .eq("status", "pending")
      : Promise.resolve({ data: [] }),
  ]);

  const entries = buildEntries(entryRows, (valuesRes.data ?? []) as Record<string, unknown>[]);
  const pendingEdits = ((pendingRes.data ?? []) as Record<string, unknown>[]).map(mapPendingEdit);

  return {
    table: mapTable(tableRes.data as Record<string, unknown>),
    categories,
    entries,
    pendingEdits,
  };
}

export async function createTable(
  userId: string,
  title: string,
  icon: string = DEFAULT_TABLE_ICON,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("ranking_tables")
    .insert({ title, icon, created_by: userId })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };

  const tableId = (data as { id: string }).id;
  const { error: catError } = await supabase.from("ranking_categories").insert(
    DEFAULT_CATEGORIES.map((c, i) => ({
      table_id: tableId,
      name: c.name,
      points_per_unit: c.points_per_unit,
      display_order: i,
    })),
  );

  if (catError) return { data: null, error: catError.message };
  return { data: tableId, error: null };
}

export async function updateTable(
  tableId: string,
  updates: { title?: string; icon?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("ranking_tables").update(updates).eq("id", tableId);
  return { error: error?.message ?? null };
}

export async function deleteTable(tableId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("ranking_tables").delete().eq("id", tableId);
  return { error: error?.message ?? null };
}

// ─── Categorias ─────────────────────────────────────────────────────────────

export async function addCategory(
  tableId: string,
  name: string,
  pointsPerUnit: number,
): Promise<{ error: string | null }> {
  const [{ data: existingCategories }, { data: existingEntries }] = await Promise.all([
    supabase
      .from("ranking_categories")
      .select("display_order")
      .eq("table_id", tableId)
      .order("display_order", { ascending: false })
      .limit(1),
    supabase.from("ranking_entries").select("id").eq("table_id", tableId),
  ]);

  const nextOrder = ((existingCategories?.[0]?.display_order as number) ?? -1) + 1;

  const { data: category, error } = await supabase
    .from("ranking_categories")
    .insert({ table_id: tableId, name, points_per_unit: pointsPerUnit, display_order: nextOrder })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const entries = (existingEntries ?? []) as { id: string }[];
  if (entries.length > 0) {
    const { error: valuesError } = await supabase.from("ranking_entry_values").insert(
      entries.map((e) => ({
        entry_id: e.id,
        category_id: (category as { id: string }).id,
        value: 0,
      })),
    );
    if (valuesError) return { error: valuesError.message };
  }

  return { error: null };
}

export async function updateCategory(
  categoryId: string,
  updates: { name?: string; points_per_unit?: number },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("ranking_categories").update(updates).eq("id", categoryId);
  return { error: error?.message ?? null };
}

export async function deleteCategory(categoryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("ranking_categories").delete().eq("id", categoryId);
  return { error: error?.message ?? null };
}

export async function reorderCategories(
  orderedIds: string[],
): Promise<{ error: string | null }> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("ranking_categories")
      .update({ display_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { error: error.message };
  }
  return { error: null };
}

// ─── Pessoas ────────────────────────────────────────────────────────────────

export async function addEntry(
  tableId: string,
  input: { profileId: string } | { name: string },
): Promise<{ error: string | null }> {
  const { data: categories } = await supabase
    .from("ranking_categories")
    .select("id")
    .eq("table_id", tableId);

  const insertPayload =
    "profileId" in input
      ? { table_id: tableId, profile_id: input.profileId, external_name: null }
      : { table_id: tableId, profile_id: null, external_name: input.name };

  const { data: entry, error } = await supabase
    .from("ranking_entries")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Essa pessoa já está na tabela" };
    return { error: error.message };
  }

  const cats = (categories ?? []) as { id: string }[];
  if (cats.length > 0) {
    const { error: valuesError } = await supabase.from("ranking_entry_values").insert(
      cats.map((c) => ({
        entry_id: (entry as { id: string }).id,
        category_id: c.id,
        value: 0,
      })),
    );
    if (valuesError) return { error: valuesError.message };
  }

  return { error: null };
}

export async function deleteEntry(entryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("ranking_entries").delete().eq("id", entryId);
  return { error: error?.message ?? null };
}

// ─── Valores + fluxo de aprovação ───────────────────────────────────────────

export async function submitValue(
  entryId: string,
  categoryId: string,
  newValue: number,
): Promise<{ status: "applied" | "pending" | null; error: string | null }> {
  const { data, error } = await supabase.rpc("submit_ranking_value", {
    p_entry_id: entryId,
    p_category_id: categoryId,
    p_new_value: newValue,
  });

  if (error) return { status: null, error: error.message };
  return { status: data as "applied" | "pending", error: null };
}

export async function approvePendingEdit(pendingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("approve_ranking_edit", { p_pending_id: pendingId });
  return { error: error?.message ?? null };
}

export async function rejectPendingEdit(pendingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reject_ranking_edit", { p_pending_id: pendingId });
  return { error: error?.message ?? null };
}

// ─── Realtime ───────────────────────────────────────────────────────────────

export function subscribeRankingTable(tableId: string, onRefresh: () => void) {
  return supabase
    .channel(`ranking_table_${tableId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ranking_entries", filter: `table_id=eq.${tableId}` },
      onRefresh,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "ranking_entry_values" }, onRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "ranking_pending_edits" }, onRefresh)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ranking_categories", filter: `table_id=eq.${tableId}` },
      onRefresh,
    )
    .subscribe();
}
