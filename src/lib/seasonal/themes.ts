/**
 * Temas sazonais — LISTA ÚNICA de todos os temas do app.
 *
 * Como funciona:
 *  - Cada tema vale numa janela de datas (`isActive`).
 *  - Um tema só liga sozinho para todo mundo se estiver APROVADO pelo admin
 *    (tabela `seasonal_theme_approvals`, tela /temas). Rascunho nunca liga.
 *  - O visual (cores + decorações) mora em src/styles/seasons/<id>.css, ativado
 *    pelo atributo `data-season="<id>"` no <html>. As decorações são desenhadas
 *    em CSS a partir de pontos marcados nos componentes com `data-decor="..."`
 *    (hat, stocking, garland, lights) — o tema decide o que cada ponto vira.
 *  - SVGs ficam em public/seasons/<id>/.
 *
 * Para criar um tema novo: adicionar uma entrada aqui, um arquivo CSS em
 * src/styles/seasons/ (importado em src/main.tsx) e os SVGs em public/seasons/.
 */

export interface SeasonalTheme {
  /** Também é o valor de data-season e o theme_id no banco. */
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Janela padrão (anual), "MM-DD". O admin pode sobrescrever em /temas
   *  (valores salvos em seasonal_theme_approvals.start_md/end_md). Se o fim for
   *  anterior ao início, a janela atravessa a virada do ano (ex.: 12-29 a 01-02). */
  defaultStart: string;
  defaultEnd: string;
  /** Cores de amostra para a tela de admin. */
  swatches: string[];
  /** Decorações usadas, para a tela de admin. */
  decorations: string[];
}

export interface ThemeWindow {
  start: string; // "MM-DD"
  end: string; // "MM-DD"
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "MM-DD" de uma data local */
export const toMd = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isValidMd = (s: string) => {
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const mo = Number(m[1]);
  const da = Number(m[2]);
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31;
};

/** "12-01" -> "01/12" */
export const formatMd = (md: string) => `${md.slice(3, 5)}/${md.slice(0, 2)}`;

/** A data cai dentro da janela (inclusive)? Suporta virada de ano. */
export function isInWindow(date: Date, w: ThemeWindow): boolean {
  const md = toMd(date);
  return w.start <= w.end
    ? md >= w.start && md <= w.end
    : md >= w.start || md <= w.end;
}

/** Janela efetiva = a do admin (se houver e for válida) ou a padrão do tema. */
export function effectiveWindow(
  theme: SeasonalTheme,
  override?: { start?: string | null; end?: string | null } | null,
): ThemeWindow {
  const start =
    override?.start && isValidMd(override.start)
      ? override.start
      : theme.defaultStart;
  const end =
    override?.end && isValidMd(override.end) ? override.end : theme.defaultEnd;
  return { start, end };
}

export const SEASONAL_THEMES: SeasonalTheme[] = [
  {
    id: "natal",
    name: "Natal",
    emoji: "🎄",
    description:
      "Verde-pinheiro e dourado, com gorro de Papai Noel, meias, guirlanda e luzes.",
    defaultStart: "12-01",
    defaultEnd: "12-26",
    swatches: ["#0b1f17", "#e3b95c", "#d6293a", "#1f6b45"],
    decorations: [
      "Gorro na logo e no avatar do menu",
      "Guirlanda sob o cabeçalho",
      "Luzes no topo da Home",
      "Meias nos títulos das categorias",
    ],
  },
];

export function getTheme(id: string | null | undefined) {
  return SEASONAL_THEMES.find((t) => t.id === id) ?? null;
}
