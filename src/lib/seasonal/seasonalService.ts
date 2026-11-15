import { supabase } from "@/lib/supabase";

export interface ThemeRecord {
  approved: boolean;
  /** Janela definida pelo admin ("MM-DD"); null = usa a padrão do tema. */
  start: string | null;
  end: string | null;
}

/** theme_id -> registro. Falha silenciosa: sem tabela/rede = nada aprovado. */
export async function fetchThemeRecords(): Promise<Record<string, ThemeRecord>> {
  try {
    // Tenta com as colunas de período; se a migração das datas ainda não
    // rodou, cai para só a aprovação (nada quebra).
    let { data, error } = await supabase
      .from("seasonal_theme_approvals")
      .select("theme_id, approved, start_md, end_md");
    if (error) {
      const fallback = await supabase
        .from("seasonal_theme_approvals")
        .select("theme_id, approved");
      data = fallback.data as typeof data;
      error = fallback.error;
    }
    if (error || !data) return {};
    return Object.fromEntries(
      data.map((r) => [
        r.theme_id as string,
        {
          approved: !!r.approved,
          start: (r as { start_md?: string | null }).start_md ?? null,
          end: (r as { end_md?: string | null }).end_md ?? null,
        },
      ]),
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

/** Define o período do tema; start/end null = volta ao padrão do tema. */
export async function setWindow(
  themeId: string,
  start: string | null,
  end: string | null,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("seasonal_theme_approvals").upsert({
    theme_id: themeId,
    start_md: start,
    end_md: end,
    approved_by: userId,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}
