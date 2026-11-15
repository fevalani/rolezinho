import { supabase } from "@/lib/supabase";

/** theme_id -> aprovado. Falha silenciosa: sem tabela/rede = nada aprovado. */
export async function fetchApprovals(): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await supabase
      .from("seasonal_theme_approvals")
      .select("theme_id, approved");
    if (error || !data) return {};
    return Object.fromEntries(
      data.map((r) => [r.theme_id as string, !!r.approved]),
    );
  } catch {
    return {};
  }
}

export async function setApproval(
  themeId: string,
  approved: boolean,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("seasonal_theme_approvals").upsert({
    theme_id: themeId,
    approved,
    approved_by: userId,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}
