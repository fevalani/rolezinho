import { supabase } from "@/lib/supabase";
import type { FlagMap } from "./featureFlagsLogic";

// Tabela: feature_flags — migration: supabase/feature_flags_migration.sql

/** Chaves definidas pelo admin. Falha silenciosa (sem tabela/rede = vale o padrão do código). */
export async function fetchFeatureFlags(): Promise<FlagMap> {
  try {
    const { data, error } = await supabase.from("feature_flags").select("feature_id, enabled");
    if (error || !Array.isArray(data)) return {};
    const out: FlagMap = {};
    for (const r of data as { feature_id: string; enabled: boolean }[]) out[r.feature_id] = r.enabled === true;
    return out;
  } catch {
    return {};
  }
}

export async function setFeatureFlag(featureId: string, enabled: boolean, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("feature_flags")
    .upsert({ feature_id: featureId, enabled, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "feature_id" });
  return { error: error?.message ?? null };
}

/** Volta ao padrão do código (apaga a chave). */
export async function clearFeatureFlag(featureId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("feature_flags").delete().eq("feature_id", featureId);
  return { error: error?.message ?? null };
}
