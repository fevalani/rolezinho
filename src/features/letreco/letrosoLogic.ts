import wordsRaw from "./words_letroso.txt?raw";
import { normalize } from "./letrecoLogic";
import type { LetrosoTileStatus } from "./letrosoTypes";

export { normalize };

export const MAX_LETROSO_ATTEMPTS = 6;

// Pontuação 2× Letreco
export const LETROSO_SCORE_BY_ATTEMPT = [200, 140, 100, 60, 30, 10] as const;

export function letrosoPointsFor(attempt: number): number {
  return LETROSO_SCORE_BY_ATTEMPT[attempt - 1] ?? 0;
}

// ─── Lista de palavras ───────────────────────────────────────────

export const LETROSO_WORDS: string[] = Array.from(
  new Set(
    wordsRaw
      .split(/\r?\n/)
      .map((w) => normalize(w))
      .filter((w) => w.length >= 6 && w.length <= 10),
  ),
);

// Conjunto para validação rápida (por tamanho)
const LETROSO_BY_LENGTH = new Map<number, Set<string>>();
for (const w of LETROSO_WORDS) {
  if (!LETROSO_BY_LENGTH.has(w.length)) LETROSO_BY_LENGTH.set(w.length, new Set());
  LETROSO_BY_LENGTH.get(w.length)!.add(w);
}

export function isValidLetrosoWord(word: string, length: number): boolean {
  return LETROSO_BY_LENGTH.get(length)?.has(normalize(word)) ?? false;
}

// ─── Palavra do dia ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(length: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const LETROSO_DAILY_ORDER = seededShuffle(LETROSO_WORDS.length, 0x4f3a);

export function getLetrosoGameDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDayNumber(date: Date = new Date()): number {
  const ymd = getLetrosoGameDate(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function getLetrosoWordOfDay(date: Date = new Date()): string {
  if (LETROSO_WORDS.length === 0) return "";
  const day = getDayNumber(date);
  const idx = LETROSO_DAILY_ORDER[((day % LETROSO_WORDS.length) + LETROSO_WORDS.length) % LETROSO_WORDS.length];
  return LETROSO_WORDS[idx];
}

// ─── Scoring com agrupamento visual ─────────────────────────────

function scoreWordle(guess: string, answer: string): ("correct" | "present" | "absent")[] {
  const g = normalize(guess);
  const a = normalize(answer);
  const result: ("correct" | "present" | "absent")[] = new Array(g.length).fill("absent");
  const remaining: Record<string, number> = {};
  for (const ch of a) remaining[ch] = (remaining[ch] ?? 0) + 1;

  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      remaining[g[i]]--;
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === "correct") continue;
    const ch = g[i];
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = "present";
      remaining[ch]--;
    }
  }
  return result;
}

/**
 * Avalia o palpite e retorna o status visual de cada letra,
 * incluindo agrupamento em blocos e cápsulas.
 *
 * Regras do Letroso:
 * - Letras corretas isoladas → "solo"
 * - Letras corretas consecutivas → "block_start/mid/end"
 * - Grupos corretos no início E no fim da palavra → "cápsula":
 *     grupo inicial: "cap_s" / "cap_s_end"
 *     grupo final: "cap_e" / "cap_e_end"
 */
export function scoreLetrosoGuess(guess: string, answer: string): LetrosoTileStatus[] {
  const raw = scoreWordle(guess, answer);
  const n = raw.length;
  const result: LetrosoTileStatus[] = raw.map((s) =>
    s === "present" ? "present" : s === "absent" ? "absent" : ("solo" as LetrosoTileStatus),
  );

  // Encontra runs de letras "correct"
  const runs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < n) {
    if (raw[i] === "correct") {
      let j = i;
      while (j < n && raw[j] === "correct") j++;
      runs.push({ start: i, end: j - 1 });
      i = j;
    } else {
      i++;
    }
  }

  if (runs.length === 0) return result;

  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];
  const isCapsule =
    runs.length >= 2 &&
    firstRun.start === 0 &&
    lastRun.end === n - 1;

  for (let r = 0; r < runs.length; r++) {
    const { start, end } = runs[r];
    const len = end - start + 1;
    const isCapLeft = isCapsule && r === 0;
    const isCapRight = isCapsule && r === runs.length - 1;

    if (isCapLeft) {
      for (let p = start; p <= end; p++) {
        result[p] = p === start ? "cap_s" : p === end ? "cap_s_end" : "block_mid";
      }
    } else if (isCapRight) {
      for (let p = start; p <= end; p++) {
        result[p] = p === start ? "cap_e" : p === end ? "cap_e_end" : "block_mid";
      }
    } else if (len === 1) {
      result[start] = "solo";
    } else {
      for (let p = start; p <= end; p++) {
        result[p] = p === start ? "block_start" : p === end ? "block_end" : "block_mid";
      }
    }
  }

  return result;
}

// ─── Teclado — status agregado (compatível com Letreco) ─────────

export function aggregateLetrosoKeyStatuses(
  guesses: string[],
  answer: string,
): Record<string, "correct" | "present" | "absent"> {
  const rank = { absent: 0, present: 1, correct: 2 } as const;
  const map: Record<string, "correct" | "present" | "absent"> = {};
  for (const guess of guesses) {
    const raw = scoreWordle(guess, answer);
    const g = normalize(guess);
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      const st = raw[i];
      if (!map[ch] || rank[st] > rank[map[ch]]) map[ch] = st;
    }
  }
  return map;
}

// ─── Compartilhamento ────────────────────────────────────────────

function emojiForTile(s: LetrosoTileStatus): string {
  if (s === "absent") return "⬛";
  if (s === "present") return "🟨";
  return "🟩";
}

export function buildLetrosoShareText(
  guesses: string[],
  answer: string,
  won: boolean,
  gameDate: string,
): string {
  const tries = won ? `${guesses.length}/${MAX_LETROSO_ATTEMPTS}` : `X/${MAX_LETROSO_ATTEMPTS}`;
  const header = `Letroso ${gameDate} ${tries} (${answer.length} letras)`;
  const grid = guesses
    .map((g) => scoreLetrosoGuess(g, answer).map(emojiForTile).join(""))
    .join("\n");
  return `${header}\n${grid}`;
}
