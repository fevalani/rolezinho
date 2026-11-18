// ═══════════════════════════════════════════
// Fronteiras — Lógica pura (sem rede, testável)
//
// Todo dia: dois países (origem e destino). O jogador chuta países até
// formar uma cadeia de vizinhos entre os dois. Cada palpite é colorido pela
// distância (em fronteiras) até o caminho mais curto. Os dados (grafo e pool
// de pares) vêm de fronteirasData.ts; aqui as funções recebem o grafo por
// parâmetro para poderem ser testadas com grafos pequenos.
// ═══════════════════════════════════════════

import type { FronteirasCountry, GuessColor } from "./fronteirasTypes";

export type Graph = Map<string, string[]>;

/** Palpites extras além do nº de países intermediários do caminho mínimo. */
export const FRONTEIRAS_EXTRA_GUESSES = 5;
export const FRONTEIRAS_BASE_SCORE = 100;
export const FRONTEIRAS_PENALTY_PER_EXTRA = 15;
export const FRONTEIRAS_MIN_WIN_SCORE = 10;

export function buildGraph(countries: FronteirasCountry[]): Graph {
  const g: Graph = new Map();
  for (const c of countries) g.set(c.iso, [...c.borders]);
  return g;
}

/** Distância (nº de fronteiras) de `src` a cada país alcançável. */
export function bfsDistances(graph: Graph, src: string): Map<string, number> {
  const dist = new Map<string, number>([[src, 0]]);
  const queue = [src];
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h];
    for (const n of graph.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, (dist.get(cur) ?? 0) + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * União de todos os países que estão em ALGUM caminho mínimo entre `from`
 * e `to` (inclui os extremos). `null` se não houver caminho.
 */
export function shortestPathNodes(
  graph: Graph,
  from: string,
  to: string,
): Set<string> | null {
  const df = bfsDistances(graph, from);
  const dt = bfsDistances(graph, to);
  const total = df.get(to);
  if (total === undefined) return null;
  const nodes = new Set<string>();
  for (const [iso, d] of df) {
    if (dt.has(iso) && d + (dt.get(iso) as number) === total) nodes.add(iso);
  }
  return nodes;
}

/**
 * UM caminho mínimo, em ordem (origem → destino, extremos inclusos), escolhido de forma
 * determinística. Serve para mostrar um exemplo ao fim da partida. `null` se não há caminho.
 */
export function shortestPath(graph: Graph, from: string, to: string): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    for (const n of [...(graph.get(queue[h]) ?? [])].sort()) {
      if (!prev.has(n)) {
        prev.set(n, queue[h]);
        queue.push(n);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  for (let c: string | null = to; c; c = prev.get(c) ?? null) path.unshift(c);
  return path;
}

/** Países intermediários do caminho mínimo (distância − 1). `null` se não há caminho. */
export function intermediatesCount(graph: Graph, from: string, to: string): number | null {
  const d = bfsDistances(graph, from).get(to);
  return d === undefined ? null : Math.max(0, d - 1);
}

export function maxGuessesFor(intermediates: number): number {
  return intermediates + FRONTEIRAS_EXTRA_GUESSES;
}

/** Distância de cada país ao conjunto `onPath` (BFS multi-fonte). */
export function distanceToPath(graph: Graph, onPath: Set<string>): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const iso of onPath) {
    dist.set(iso, 0);
    queue.push(iso);
  }
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h];
    for (const n of graph.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, (dist.get(cur) ?? 0) + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

export function colorForDistance(distance: number | undefined): GuessColor {
  if (distance === 0) return "green";
  if (distance === 1) return "orange";
  if (distance === 2) return "red";
  return "darkred";
}

/** Cor de preenchimento (mapa e lista) de cada faixa de distância. */
export const COLOR_FILL: Record<GuessColor, string> = {
  green: "#3fa66b",
  orange: "#e8923a",
  red: "#d9534f",
  darkred: "#8a3b3b",
};

export type GuessValidation = "ok" | "unknown" | "duplicate" | "endpoint";

export function validateGuess(
  iso: string,
  guesses: string[],
  from: string,
  to: string,
  validIsos: Set<string>,
): GuessValidation {
  if (!validIsos.has(iso)) return "unknown";
  if (iso === from || iso === to) return "endpoint";
  if (guesses.includes(iso)) return "duplicate";
  return "ok";
}

/**
 * Resolvido quando os palpites (de qualquer cor) + origem/destino formam uma
 * cadeia contínua de vizinhos entre origem e destino. Qualquer rota vale, não
 * só o caminho mais curto — uma rota mais longa só rende menos pontos, porque
 * usa mais palpites (ver `fronteirasScore`).
 */
export function isSolved(
  graph: Graph,
  from: string,
  to: string,
  guesses: string[],
): boolean {
  const allowed = new Set<string>([from, to, ...guesses]);
  const seen = new Set<string>([from]);
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    for (const n of graph.get(queue[h]) ?? []) {
      if (allowed.has(n) && !seen.has(n)) {
        if (n === to) return true;
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

/**
 * Pontos: 100 se fechou com o mínimo de palpites (= nº de países intermediários do caminho
 * mais curto), −15 por palpite a mais — seja chute errado ou rota mais longa —, piso de 10.
 * Derrota = 0.
 */
export function fronteirasScore(attempts: number, optimal: number, won: boolean): number {
  if (!won) return 0;
  const wasted = Math.max(0, attempts - optimal);
  return Math.max(
    FRONTEIRAS_MIN_WIN_SCORE,
    FRONTEIRAS_BASE_SCORE - wasted * FRONTEIRAS_PENALTY_PER_EXTRA,
  );
}

// ─── Par do dia ───────────────────────────────────────────────

/** Data da partida ("YYYY-MM-DD") no fuso America/Sao_Paulo. */
export function getFronteirasGameDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayNumber(date: Date): number {
  const [y, m, d] = getFronteirasGameDate(date).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Par [origem, destino] do dia: igual para todos; pool já embaralhado offline. */
export function pairOfDay(
  pairs: [string, string][],
  date: Date = new Date(),
): [string, string] {
  const n = pairs.length;
  return pairs[((dayNumber(date) % n) + n) % n];
}

// ─── Busca de países (autocomplete) ───────────────────────────

/** Minúsculas e sem acentos: "Tchéquia" → "tchequia". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Apelidos comuns → código ISO. */
export const COUNTRY_ALIASES: Record<string, string> = {
  eua: "US",
  "estados unidos da america": "US",
  usa: "US",
  uk: "GB",
  inglaterra: "GB",
  "grã-bretanha": "GB",
  "grao-bretanha": "GB",
  "republica tcheca": "CZ",
  "costa do marfim": "CI",
  "timor leste": "TL",
  congo: "CD",
  birmania: "MM",
  suazilandia: "SZ",
  holanda: "NL",
};

export function searchCountries(
  query: string,
  countries: FronteirasCountry[],
  exclude: Set<string> = new Set(),
  limit = 6,
): FronteirasCountry[] {
  const q = fold(query);
  if (!q) return [];
  const byIso = new Map(countries.map((c) => [c.iso, c]));
  const out: FronteirasCountry[] = [];
  const seen = new Set<string>();
  const push = (c: FronteirasCountry | undefined) => {
    if (c && !exclude.has(c.iso) && !seen.has(c.iso)) {
      seen.add(c.iso);
      out.push(c);
    }
  };
  const starts = countries.filter((c) => fold(c.name).startsWith(q));
  const contains = countries.filter(
    (c) => !fold(c.name).startsWith(q) && fold(c.name).includes(q),
  );
  for (const c of starts) push(c);
  for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) {
    if (fold(alias).startsWith(q)) push(byIso.get(iso));
  }
  for (const c of contains) push(c);
  return out.slice(0, limit);
}

/** Aviso mostrado ao lado do nome de Israel. */
export const SUPOSTO_PAIS = "(suposto país)";

/** Nome em texto puro (tooltip do mapa etc.): Israel ganha o aviso. */
export function displayName(iso: string, name: string): string {
  return iso === "IL" ? `${name} ${SUPOSTO_PAIS}` : name;
}

/** Resolve o texto digitado para um país (nome exato ou apelido), ou null. */
export function resolveCountry(
  text: string,
  countries: FronteirasCountry[],
): FronteirasCountry | null {
  const q = fold(text);
  if (!q) return null;
  const exact = countries.find((c) => fold(c.name) === q);
  if (exact) return exact;
  const alias = COUNTRY_ALIASES[q] ?? COUNTRY_ALIASES[text.toLowerCase().trim()];
  return alias ? (countries.find((c) => c.iso === alias) ?? null) : null;
}

// ─── Zoom / pan do mapa ───────────────────────────────────────

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_MAP_ZOOM = 12;

export function fullViewBox(width: number, height: number): ViewBox {
  return { x: 0, y: 0, w: width, h: height };
}

/** Mantém o recorte dentro do mapa inteiro e o zoom entre 1x e MAX_MAP_ZOOM. */
export function clampViewBox(vb: ViewBox, full: ViewBox): ViewBox {
  const w = Math.min(full.w, Math.max(full.w / MAX_MAP_ZOOM, vb.w));
  const h = (w * full.h) / full.w;
  const x = Math.min(full.x + full.w - w, Math.max(full.x, vb.x));
  const y = Math.min(full.y + full.h - h, Math.max(full.y, vb.y));
  return { x, y, w, h };
}

/** Aproxima (factor > 1) ou afasta (< 1) mantendo o ponto (cx, cy) parado na tela. */
export function zoomViewBox(
  vb: ViewBox,
  factor: number,
  cx: number,
  cy: number,
  full: ViewBox,
): ViewBox {
  const w = vb.w / factor;
  const scaled = clampViewBox({ ...vb, w }, full); // só para obter o w efetivo
  const ratio = scaled.w / vb.w;
  return clampViewBox(
    { x: cx - (cx - vb.x) * ratio, y: cy - (cy - vb.y) * ratio, w: scaled.w, h: scaled.h },
    full,
  );
}

/** Arrasta o mapa por (dx, dy) em unidades do SVG. */
export function panViewBox(vb: ViewBox, dx: number, dy: number, full: ViewBox): ViewBox {
  return clampViewBox({ ...vb, x: vb.x - dx, y: vb.y - dy }, full);
}

// ─── Compartilhar ─────────────────────────────────────────────

const EMOJI: Record<GuessColor, string> = {
  green: "🟩",
  orange: "🟧",
  red: "🟥",
  darkred: "🟫",
};

/** Resultado em emojis, sem revelar os países. */
export function buildFronteirasShareText(
  colors: GuessColor[],
  won: boolean,
  gameDate: string,
  maxGuesses: number,
): string {
  const tries = won ? `${colors.length}/${maxGuesses}` : `X/${maxGuesses}`;
  return `Fronteiras ${gameDate} ${tries}\n${colors.map((c) => EMOJI[c]).join("")}`;
}
