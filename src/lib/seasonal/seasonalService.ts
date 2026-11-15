import { supabase } from "@/lib/supabase";

export interface ThemeRecord {
  approved: boolean;
  /** Janela definida pelo admin ("MM-DD"); null = usa a padrão do tema. */
  start: string | null;
  end: string | null;
  /** Título/emoji/dia definidos pelo admin; null = usa o do tema no código. */
  occasion: string | null;
  emoji: string | null;
  occasionMd: string | null;
}

type Row = Record<string, unknown>;

/** theme_id -> registro. Falha silenciosa: sem tabela/rede = nada aprovado. */
export async function fetchThemeRecords(): Promise<Record<string, ThemeRecord>> {
  try {
    // Tenta com todas as colunas; se uma migration ainda não rodou, cai para o conjunto
    // anterior (nada quebra): título/emoji/dia -> período -> só a aprovação.
    const selects = [
      "theme_id, approved, start_md, end_md, custom_occasion, custom_emoji, occasion_md",
      "theme_id, approved, start_md, end_md",
      "theme_id, approved",
    ];
    let rows: Row[] | null = null;
    for (const cols of selects) {
      const { data, error } = await supabase
        .from("seasonal_theme_approvals")
        .select(cols);
      if (!error && data) {
        rows = data as unknown as Row[];
        break;
      }
    }
    if (!rows) return {};
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return Object.fromEntries(
      rows.map((r) => [
        r.theme_id as string,
        {
          approved: !!r.approved,
          start: str(r.start_md),
          end: str(r.end_md),
          occasion: str(r.custom_occasion),
          emoji: str(r.custom_emoji),
          occasionMd: str(r.occasion_md),
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

/**
 * Reaproveita um visual para outra ocasião: título, emoji, dia e período, de uma vez.
 * Tudo null = volta ao padrão do tema (código).
 */
export async function setCustomization(
  themeId: string,
  f: {
    occasion: string | null;
    emoji: string | null;
    occasionMd: string | null;
    start: string | null;
    end: string | null;
  },
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("seasonal_theme_approvals").upsert({
    theme_id: themeId,
    custom_occasion: f.occasion,
    custom_emoji: f.emoji,
    occasion_md: f.occasionMd,
    start_md: f.start,
    end_md: f.end,
    approved_by: userId,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}
