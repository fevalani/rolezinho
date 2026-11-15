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

import type { Occasion } from "./occasions";

export interface SeasonalTheme {
  /** Também é o valor de data-season e o theme_id no banco. */
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Motivo exibido na Home sobre a foto do grupo (ex.: "Natal"). */
  occasion: string;
  /** Datas do tema num dado ano, "MM-DD": período padrão (`start`/`end`) e data
   *  comemorativa (`occasionMd`, que independe do período). Temas de data fixa
   *  devolvem sempre o mesmo valor (ver `fixedDates`); temas móveis, como a
   *  Páscoa, calculam. O admin pode sobrescrever o período em /temas (salvo em
   *  seasonal_theme_approvals.start_md/end_md, como datas FIXAS). Se o fim for
   *  anterior ao início, o período atravessa a virada do ano (ex.: 12-29 a 01-02). */
  datesFor: (year: number) => ThemeDates;
  /** A data muda de ano para ano (ex.: Páscoa). Só informativo para a tela de admin. */
  movable?: boolean;
  /** Cores de amostra para a tela de admin. */
  swatches: string[];
  /** Decorações usadas, para a tela de admin. */
  decorations: string[];
  /** O título do selo da Home é desenhado com as letras levemente "embaralhadas"
   *  (só visual: o texto continua legível e acessível). */
  jumble?: boolean;
  /** Dia comemorativo fixo ("MM-DD"); vale no lugar do calculado por `datesFor`. */
  occasionMdOverride?: string;
  /** Preenchido quando o tema é uma ocasião criada pelo admin (ver occasions.ts). */
  occasionData?: Occasion;
}

export interface ThemeWindow {
  start: string; // "MM-DD"
  end: string; // "MM-DD"
}

export interface ThemeDates extends ThemeWindow {
  occasionMd: string; // "MM-DD" da data comemorativa
}

/** Datas iguais todo ano. */
const fixedDates =
  (start: string, end: string, occasionMd: string) => (): ThemeDates => ({
    start,
    end,
    occasionMd,
  });

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

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "12-25" -> "25 de dezembro" */
export const formatMdLong = (md: string) =>
  `${Number(md.slice(3, 5))} de ${MONTH_NAMES[Number(md.slice(0, 2)) - 1]}`;

/** A data cai dentro da janela (inclusive)? Suporta virada de ano. */
export function isInWindow(date: Date, w: ThemeWindow): boolean {
  const md = toMd(date);
  return w.start <= w.end
    ? md >= w.start && md <= w.end
    : md >= w.start || md <= w.end;
}

/** Domingo de Páscoa (calendário gregoriano — algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Páscoa: no ar de 14 dias antes até o próprio domingo. */
const easterDates = (year: number): ThemeDates => {
  const easter = easterSunday(year);
  return {
    start: toMd(addDays(easter, -14)),
    end: toMd(easter),
    occasionMd: toMd(easter),
  };
};

/** Período padrão do tema no ano. */
export const defaultWindowFor = (
  theme: SeasonalTheme,
  year = new Date().getFullYear(),
): ThemeWindow => {
  const { start, end } = theme.datesFor(year);
  return { start, end };
};

/** Data comemorativa a exibir: a próxima ocorrência a partir de `today`
 *  (Páscoa deste ano já passou? mostra a do ano que vem). */
export function occasionMdFor(theme: SeasonalTheme, today = new Date()): string {
  if (theme.occasionMdOverride) return theme.occasionMdOverride;
  const year = today.getFullYear();
  const md = theme.datesFor(year).occasionMd;
  if (!theme.movable || md >= toMd(today)) return md;
  return theme.datesFor(year + 1).occasionMd;
}

/** Janela efetiva = a do admin (se houver e for válida) ou a padrão do tema. */
export function effectiveWindow(
  theme: SeasonalTheme,
  override?: { start?: string | null; end?: string | null } | null,
  year = new Date().getFullYear(),
): ThemeWindow {
  const def = defaultWindowFor(theme, year);
  const start =
    override?.start && isValidMd(override.start) ? override.start : def.start;
  const end =
    override?.end && isValidMd(override.end) ? override.end : def.end;
  return { start, end };
}

export const SEASONAL_THEMES: SeasonalTheme[] = [
  {
    id: "natal",
    name: "Natal",
    emoji: "🎄",
    occasion: "Natal",
    datesFor: fixedDates("12-01", "12-26", "12-25"),
    description:
      "Verde-pinheiro e dourado, com gorro de Papai Noel, meias, guirlanda e luzes.",
    swatches: ["#0b1f17", "#e3b95c", "#d6293a", "#1f6b45"],
    decorations: [
      "Gorro na logo e no avatar do menu",
      "Guirlanda sob o cabeçalho",
      "Luzes no topo da Home",
      "Meias nos títulos das categorias",
    ],
  },
  {
    id: "republica",
    name: "Proclamação da República",
    emoji: "🇧🇷",
    occasion: "Proclamação da República",
    datesFor: fixedDates("11-15", "11-15", "11-15"),
    description:
      "Azul-marinho e amarelo da bandeira, com barrete frígio, bandeirinhas, estrelas e a bandeira do Brasil.",
    swatches: ["#081529", "#f2d22e", "#009c3b", "#002776"],
    decorations: [
      "Barrete frígio na logo e no avatar do menu",
      "Bandeirinhas verde, amarelo e azul sob o cabeçalho",
      "Fio de estrelas no topo da Home",
      "Bandeira do Brasil nos títulos das categorias",
    ],
  },
  {
    id: "anonovo",
    name: "Ano Novo",
    emoji: "🎆",
    occasion: "Ano Novo",
    // Período atravessa a virada do ano (fim anterior ao início)
    datesFor: fixedDates("12-29", "01-02", "01-01"),
    description:
      "Noite violeta e dourado champanhe, com chapéu de festa, serpentinas, brilhos e taça.",
    swatches: ["#0a0816", "#f0cf7a", "#c9ccd6", "#c43f8f"],
    decorations: [
      "Chapéu de festa na logo e no avatar do menu",
      "Serpentinas sob o cabeçalho",
      "Fio de brilhos no topo da Home",
      "Taça de champanhe nos títulos das categorias",
    ],
  },
  {
    id: "pascoa",
    name: "Páscoa",
    emoji: "🐰",
    occasion: "Páscoa",
    movable: true,
    // Data móvel: no ar 14 dias antes do domingo de Páscoa, até ele
    datesFor: easterDates,
    description:
      "Chocolate e rosa-doce, com orelhas de coelho, ovos pintados, fio de flores e um ovo nos títulos.",
    swatches: ["#140c08", "#f5a9c4", "#fff7c2", "#9fe0c8"],
    decorations: [
      "Orelhas de coelho na logo e no avatar do menu",
      "Ovos de Páscoa pendurados sob o cabeçalho",
      "Fio de flores no topo da Home",
      "Ovo pintado nos títulos das categorias",
    ],
  },
];

export function getTheme(id: string | null | undefined) {
  return SEASONAL_THEMES.find((t) => t.id === id) ?? null;
}
