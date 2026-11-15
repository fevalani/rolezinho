import { supabase } from "@/lib/supabase";
import type { Occasion } from "./occasions";

// Tabela: seasonal_occasions
// Migration: supabase/seasonal_occasions_migration.sql

type Row = Record<string, unknown>;

function fromRow(r: Row): Occasion {
  return {
    id: r.id as string,
    title: (r.title as string) ?? "",
    emoji: (r.emoji as string) ?? "",
    extras: Array.isArray(r.extras) ? (r.extras as string[]) : [],
    dayMd: (r.day_md as string) ?? "",
    daysBefore: Number(r.days_before ?? 0),
    jumble: !!r.jumble,
    enabled: r.enabled !== false,
  };
}

const toRow = (o: Omit<Occasion, "id">) => ({
  title: o.title,
  emoji: o.emoji,
  extras: o.extras,
  day_md: o.dayMd,
  days_before: o.daysBefore,
  jumble: o.jumble,
  enabled: o.enabled,
  updated_at: new Date().toISOString(),
});

/** Todas as ocasiões. Falha silenciosa (sem tabela/rede = nenhuma ocasião). */
export async function fetchOccasions(): Promise<Occasion[]> {
  try {
    const { data, error } = await supabase
      .from("seasonal_occasions")
      .select("*")
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Row[]).map(fromRow);
  } catch {
    return [];
  }
}

/** Cria (sem id) ou atualiza (com id) uma ocasião. */
export async function saveOccasionRow(
  o: Omit<Occasion, "id"> & { id?: string },
  userId: string,
): Promise<{ occasion: Occasion | null; error: string | null }> {
  try {
    const { id, ...fields } = o;
    const query = id
      ? supabase.from("seasonal_occasions").update(toRow(fields)).eq("id", id)
      : supabase.from("seasonal_occasions").insert({ ...toRow(fields), created_by: userId });
    const { data, error } = await query.select().single();
    if (error) return { occasion: null, error: error.message };
    return { occasion: fromRow(data as Row), error: null };
  } catch (e) {
    return { occasion: null, error: String(e) };
  }
}

export async function deleteOccasionRow(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from("seasonal_occasions").delete().eq("id", id);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: String(e) };
  }
}
