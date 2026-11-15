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
  /** Visual genérico (paleta + decoração por variáveis CSS em generic.css): serve para
   *  qualquer ocasião — o admin troca título, emoji e dia em /temas. */
  generic?: boolean;
  /** O título do selo da Home é desenhado com as letras levemente "embaralhadas"
   *  (só visual: o texto continua legível e acessível). */
  jumble?: boolean;
  /** Dia comemorativo definido pelo admin ("MM-DD"); vale no lugar do padrão. */
  occasionMdOverride?: string;
}

/** O que o admin pode trocar num tema sem mexer no código. */
export interface ThemeOverride {
  occasion?: string | null;
  emoji?: string | null;
  occasionMd?: string | null;
}

export const MAX_OCCASION_LENGTH = 60;
export const MAX_EMOJI_LENGTH = 12;

/** Aplica o que o admin salvou (título, emoji, dia) por cima do tema do código. */
export function applyOverride(
  theme: SeasonalTheme,
  o?: ThemeOverride | null,
): SeasonalTheme {
  if (!o) return theme;
  const occasion = o.occasion?.trim().slice(0, MAX_OCCASION_LENGTH);
  const emoji = o.emoji?.trim().slice(0, MAX_EMOJI_LENGTH);
  return {
    ...theme,
    occasion: occasion || theme.occasion,
    emoji: emoji || theme.emoji,
    occasionMdOverride:
      o.occasionMd && isValidMd(o.occasionMd) ? o.occasionMd : undefined,
  };
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

/** Carnaval: de sexta a terça (terça = 47 dias antes da Páscoa). */
const carnavalDates = (year: number): ThemeDates => {
  const easter = easterSunday(year);
  const tuesday = addDays(easter, -47);
  return {
    start: toMd(addDays(easter, -51)),
    end: toMd(tuesday),
    occasionMd: toMd(tuesday),
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
  // ── Visuais genéricos: título, emoji e dia são editáveis em /temas ──
  // O que está aqui é só a sugestão inicial de ocasião de cada visual.
  {
    id: "letras",
    name: "Letras embaralhadas",
    emoji: "🔤",
    occasion: "Atenção à Dislexia",
    jumble: true,
    generic: true,
    datesFor: fixedDates("11-16", "11-16", "11-16"),
    description:
      "Verde-petróleo e âmbar, com letras espalhadas e viradas (b, d, p, q) e o título do selo levemente embaralhado. Só decoração: o texto do app continua legível.",
    swatches: ["#0b2227", "#ffb347", "#f4efe4", "#ff7a6b"],
    decorations: [
      "Letras viradas na logo e no avatar do menu",
      "Faixa de letras embaralhadas sob o cabeçalho",
      "Faixa de letras no topo da Home",
      "Par de letras nos títulos das categorias",
      "Título do selo da Home com as letras levemente fora do lugar",
    ],
  },
  {
    id: "confete",
    name: "Confete",
    emoji: "🎊",
    occasion: "Carnaval",
    movable: true,
    generic: true,
    datesFor: carnavalDates,
    description: "Roxo-festa e rosa-choque, com confete, serpentina e balões.",
    swatches: ["#1a0b2e", "#ff5ea8", "#fff5fb", "#ffd23f"],
    decorations: [
      "Máscara na logo e no avatar do menu",
      "Faixa de confete e balões sob o cabeçalho",
      "Faixa de música e brilhos no topo da Home",
      "Confete nos títulos das categorias",
    ],
  },
  {
    id: "coracao",
    name: "Corações",
    emoji: "💘",
    occasion: "Dia dos Namorados",
    generic: true,
    datesFor: fixedDates("06-09", "06-12", "06-12"),
    description: "Vinho e rosa-coral, com corações de vários tipos.",
    swatches: ["#2a0a14", "#ff6b81", "#fff0f2", "#ffb3c1"],
    decorations: [
      "Coração flechado na logo e no avatar do menu",
      "Faixa de corações sob o cabeçalho",
      "Faixa de corações e brilhos no topo da Home",
      "Coração nos títulos das categorias",
    ],
  },
  {
    id: "junina",
    name: "Bandeirinhas juninas",
    emoji: "🌽",
    occasion: "Festa Junina",
    generic: true,
    datesFor: fixedDates("06-13", "06-24", "06-24"),
    description: "Marrom-fogueira e amarelo-milho, com chapéu de palha, milho, fogueira e balões.",
    swatches: ["#2b1608", "#ffb020", "#fff6e3", "#e0562b"],
    decorations: [
      "Chapéu de palha na logo e no avatar do menu",
      "Faixa de milho, fogueira e balões sob o cabeçalho",
      "Faixa de fogos no topo da Home",
      "Fogueira nos títulos das categorias",
    ],
  },
  {
    id: "folhas",
    name: "Folhas",
    emoji: "🌳",
    occasion: "Dia da Árvore",
    generic: true,
    datesFor: fixedDates("09-14", "09-21", "09-21"),
    description: "Verde-floresta e verde-limão, com folhas, brotos e trevos.",
    swatches: ["#0a1f12", "#7bdc8a", "#eefbe9", "#c8f08f"],
    decorations: [
      "Folha na logo e no avatar do menu",
      "Faixa de folhas sob o cabeçalho",
      "Faixa de trevos e flores no topo da Home",
      "Árvore nos títulos das categorias",
    ],
  },
  {
    id: "oceano",
    name: "Oceano",
    emoji: "🌊",
    occasion: "Dia Mundial dos Oceanos",
    generic: true,
    datesFor: fixedDates("06-05", "06-08", "06-08"),
    description: "Azul-profundo e ciano, com ondas, peixes, conchas e bolhas.",
    swatches: ["#06202e", "#4cc9f0", "#e8f9ff", "#f4d35e"],
    decorations: [
      "Âncora na logo e no avatar do menu",
      "Faixa de ondas, peixes e conchas sob o cabeçalho",
      "Faixa de bolhas no topo da Home",
      "Concha nos títulos das categorias",
    ],
  },
  {
    id: "estrelas",
    name: "Céu estrelado",
    emoji: "⭐",
    occasion: "Dia do Amigo",
    generic: true,
    datesFor: fixedDates("07-13", "07-20", "07-20"),
    description: "Azul-noite e dourado, com estrelas, lua e cometas.",
    swatches: ["#0a0e2a", "#ffd86b", "#f4f6ff", "#8b9cff"],
    decorations: [
      "Estrela na logo e no avatar do menu",
      "Faixa de estrelas e lua sob o cabeçalho",
      "Faixa de cometas no topo da Home",
      "Estrela nos títulos das categorias",
    ],
  },
  {
    id: "noite",
    name: "Noite roxa",
    emoji: "🎃",
    occasion: "Halloween",
    generic: true,
    datesFor: fixedDates("10-25", "10-31", "10-31"),
    description: "Roxo-noite e laranja-abóbora, com abóboras, morcegos, teias e fantasmas.",
    swatches: ["#160d22", "#ff8a1f", "#fbeee0", "#7c4dff"],
    decorations: [
      "Abóbora na logo e no avatar do menu",
      "Faixa de teias, morcegos e abóboras sob o cabeçalho",
      "Faixa de fantasmas e velas no topo da Home",
      "Morcego nos títulos das categorias",
    ],
  },
  {
    id: "doce",
    name: "Doces",
    emoji: "🍭",
    occasion: "Dia das Crianças",
    generic: true,
    datesFor: fixedDates("10-05", "10-12", "10-12"),
    description: "Ameixa e rosa-algodão-doce, com pirulitos, balas, cupcakes e balões.",
    swatches: ["#2a1021", "#ff9ad5", "#fff0fa", "#9ad8ff"],
    decorations: [
      "Pirulito na logo e no avatar do menu",
      "Faixa de doces sob o cabeçalho",
      "Faixa de balões no topo da Home",
      "Bala nos títulos das categorias",
    ],
  },
  {
    id: "retro",
    name: "Terminal retrô",
    emoji: "💻",
    occasion: "Dia do Programador",
    generic: true,
    datesFor: fixedDates("09-13", "09-13", "09-13"),
    description: "Preto-terminal e verde-fósforo, com pixels, joystick e disquete.",
    swatches: ["#07120a", "#39ff88", "#d9ffe6", "#ffd23f"],
    decorations: [
      "Computador na logo e no avatar do menu",
      "Faixa de pixels e joysticks sob o cabeçalho",
      "Faixa de disquetes no topo da Home",
      "Alien de pixel nos títulos das categorias",
    ],
  },
];

export function getTheme(id: string | null | undefined) {
  return SEASONAL_THEMES.find((t) => t.id === id) ?? null;
}
