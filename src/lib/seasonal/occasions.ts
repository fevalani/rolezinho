// ═══════════════════════════════════════════
// Ocasiões — temas criados pelo admin (sem código)
//
// O admin escolhe o dia, o título, o emoji principal e os demais emojis; o tema se monta
// sozinho: cores a partir do emoji principal (emojiColor.ts) e decoração com os emojis
// (occasionAssets.ts). Esta parte é lógica pura, sem rede nem DOM.
// ═══════════════════════════════════════════

import {
  isInWindow,
  isValidMd,
  toMd,
  type SeasonalTheme,
  type ThemeWindow,
} from "./themes";

export interface Occasion {
  id: string;
  title: string;
  /** Emoji de destaque: selo da Home, logo, títulos e cores do tema. */
  emoji: string;
  /** Demais emojis (ou letras) da faixa decorativa. */
  extras: string[];
  /** Dia da comemoração, "MM-DD" (vale todo ano). */
  dayMd: string;
  /** Quantos dias antes do dia o tema já entra no ar (0 = só no dia). */
  daysBefore: number;
  /** Título do selo com as letras levemente fora do lugar. */
  jumble: boolean;
  enabled: boolean;
}

export const OCCASION_LIMITS = {
  title: 60,
  emoji: 12,
  /** Quantos emojis extras cabem na faixa. */
  extras: 8,
  maxDaysBefore: 30,
} as const;

/** Prefixo do id do tema que representa uma ocasião (ex.: "oc:3f2a…"). */
export const OCCASION_THEME_PREFIX = "oc:";
/** Valor de `data-season` quando uma ocasião está no ar. */
export const OCCASION_SEASON = "ocasiao";

// ─── Texto → emojis ───────────────────────────────────────────

interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
const SegmenterCtor = (
  Intl as unknown as {
    Segmenter?: new (l: string, o: { granularity: "grapheme" }) => GraphemeSegmenter;
  }
).Segmenter;
const segmenter = SegmenterCtor ? new SegmenterCtor("pt-BR", { granularity: "grapheme" }) : null;

/** Quebra um texto em "caracteres" visíveis (emoji composto conta como um só). */
export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/**
 * "🎉 🎈,🎊" ou "🎉🎈🎊" → ["🎉","🎈","🎊"]. Espaços e vírgulas só separam;
 * cada emoji (ou letra) vira um item. Limita à quantidade que cabe na faixa.
 */
export function parseExtras(text: string): string[] {
  return graphemes(text)
    .filter((g) => g.trim() !== "" && g !== ",")
    .slice(0, OCCASION_LIMITS.extras);
}

// ─── Datas ────────────────────────────────────────────────────

const at = (md: string) =>
  new Date(2028, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5))); // 2028: bissexto

/** "MM-DD" do dia `n` dias antes de `dayMd` (volta o ano se preciso). */
export function daysBefore(dayMd: string, n: number): string {
  const d = at(dayMd);
  d.setDate(d.getDate() - n);
  return toMd(d);
}

/** Janela em que a ocasião fica no ar: de `daysBefore` dias antes até o dia. */
export function occasionWindow(o: Pick<Occasion, "dayMd" | "daysBefore">): ThemeWindow {
  return { start: daysBefore(o.dayMd, o.daysBefore), end: o.dayMd };
}

export function isOccasionActive(o: Occasion, date = new Date()): boolean {
  return o.enabled && isInWindow(date, occasionWindow(o));
}

// ─── Validação ────────────────────────────────────────────────

export type OccasionInput = Partial<Omit<Occasion, "id" | "extras">> & {
  extras?: string[] | string;
};

/** Limpa e valida o que o admin digitou. Devolve o erro em português ou a ocasião pronta. */
export function normalizeOccasion(
  input: OccasionInput,
): { error: string; occasion?: undefined } | { error?: undefined; occasion: Omit<Occasion, "id"> } {
  const title = (input.title ?? "").trim().slice(0, OCCASION_LIMITS.title);
  if (!title) return { error: "Escreva um título." };
  const emoji = graphemes((input.emoji ?? "").trim())
    .join("")
    .slice(0, OCCASION_LIMITS.emoji);
  if (!emoji) return { error: "Escolha o emoji principal." };
  if (!input.dayMd || !isValidMd(input.dayMd)) return { error: "Escolha o dia da comemoração." };
  const days = Math.round(Number(input.daysBefore ?? 0));
  if (!Number.isFinite(days) || days < 0 || days > OCCASION_LIMITS.maxDaysBefore) {
    return { error: `Os dias de antecedência vão de 0 a ${OCCASION_LIMITS.maxDaysBefore}.` };
  }
  const extras = Array.isArray(input.extras)
    ? input.extras.slice(0, OCCASION_LIMITS.extras)
    : parseExtras(input.extras ?? "");
  return {
    occasion: {
      title,
      emoji,
      extras,
      dayMd: input.dayMd,
      daysBefore: days,
      jumble: !!input.jumble,
      enabled: input.enabled ?? true,
    },
  };
}

// ─── Ocasião → tema ───────────────────────────────────────────

export const occasionThemeId = (id: string) => `${OCCASION_THEME_PREFIX}${id}`;
export const isOccasionThemeId = (id: string | null | undefined) =>
  !!id && id.startsWith(OCCASION_THEME_PREFIX);

/** Faz a ocasião se comportar como um tema comum (Home, banner, pré-visualização). */
export function occasionToTheme(o: Occasion): SeasonalTheme {
  const w = occasionWindow(o);
  return {
    id: occasionThemeId(o.id),
    name: o.title,
    emoji: o.emoji,
    occasion: o.title,
    jumble: o.jumble,
    occasionMdOverride: o.dayMd,
    datesFor: () => ({ ...w, occasionMd: o.dayMd }),
    description: "Ocasião criada por você: cores a partir do emoji principal e faixa com os demais emojis.",
    swatches: [],
    decorations: [],
    occasionData: o,
  };
}
