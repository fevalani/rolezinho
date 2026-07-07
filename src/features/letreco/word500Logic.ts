// ═══════════════════════════════════════════
// Word500 — Lógica pura (sem rede, testável)
//
// Variante Mastermind do Wordle: o feedback de cada tentativa é só a
// CONTAGEM de verdes/amarelos/vermelhos, nunca por posição — o jogador
// precisa cruzar informação entre tentativas para deduzir a palavra.
// Reaproveita o mesmo dicionário de 5 letras do Letreco (pool de respostas
// e validação), só com uma palavra-do-dia própria (seed diferente) para
// não dar spoiler grátis a quem já jogou Letreco no mesmo dia.
// ═══════════════════════════════════════════

import { WORD_LIST, isValidWord, normalize } from "./letrecoLogic";
import type { GuessCounts } from "./word500Types";

export { WORD_LIST, isValidWord, normalize };

/** Tamanho da palavra (mesmo padrão do gênero) */
export const WORD_LENGTH = 5;

/** Tentativas por jogador por dia (conforme a spec do Word500) */
export const WORD500_MAX_ATTEMPTS = 8;

/**
 * Pontuação por nº da tentativa do acerto (índice 0 = acertou de primeira).
 * Fica num único lugar para ajuste fácil.
 */
export const WORD500_SCORE_BY_ATTEMPT = [
  130, 110, 90, 75, 60, 45, 30, 15,
] as const;

/** Pontos pelo nº da tentativa do acerto (1-indexed). Fora da faixa → 0. */
export function word500PointsFor(attempt: number): number {
  return WORD500_SCORE_BY_ATTEMPT[attempt - 1] ?? 0;
}

/**
 * Compara um palpite com a resposta e retorna só as CONTAGENS de verdes
 * (posição certa) e amarelos (letra certa, posição errada), tratando letras
 * repetidas em duas passadas (clássico do Wordle) para não contar a mesma
 * ocorrência da resposta duas vezes.
 */
export function scoreGuessCounts(guess: string, answer: string): GuessCounts {
  const g = normalize(guess);
  const a = normalize(answer);

  const remaining: Record<string, number> = {};
  for (const ch of a) remaining[ch] = (remaining[ch] ?? 0) + 1;

  let green = 0;
  const matchedGuess = new Array(g.length).fill(false);

  // 1ª passada — verdes
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      green++;
      matchedGuess[i] = true;
      remaining[g[i]]--;
    }
  }

  // 2ª passada — amarelos pelo que sobrou
  let yellow = 0;
  for (let i = 0; i < g.length; i++) {
    if (matchedGuess[i]) continue;
    const ch = g[i];
    if ((remaining[ch] ?? 0) > 0) {
      yellow++;
      remaining[ch]--;
    }
  }

  const red = g.length - green - yellow;
  return { green, yellow, red };
}

// ─── Palavra do dia (determinística pela data) ──────────────────

/**
 * PRNG determinístico (mulberry32). Mesma seed → mesma sequência em
 * qualquer dispositivo, garantindo a mesma palavra para todos.
 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates determinístico — devolve uma permutação fixa dos índices */
function seededShuffle(length: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Ordem própria (seed diferente do Letreco) — mesmo pool de palavras, mas
// palavra do dia distinta, para não dar spoiler entre os dois jogos.
const WORD500_DAILY_ORDER = seededShuffle(WORD_LIST.length, 0x77d5);

/** Data da partida ("YYYY-MM-DD") no fuso America/Sao_Paulo */
export function getWord500GameDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDayNumber(date: Date = new Date()): number {
  const ymd = getWord500GameDate(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** A palavra secreta do dia (igual para todos, diferente da do Letreco). */
export function getWord500WordOfDay(date: Date = new Date()): string {
  if (WORD_LIST.length === 0) return "";
  const day = getDayNumber(date);
  const idx = WORD500_DAILY_ORDER[((day % WORD_LIST.length) + WORD_LIST.length) % WORD_LIST.length];
  return WORD_LIST[idx];
}

// ─── Compartilhamento em emojis (sem spoiler de posição) ────────

/**
 * Gera o resultado em squares por CONTAGEM (verdes, depois amarelos, depois
 * vermelhos) — não correlaciona com posição real, então não vaza mais
 * informação do que o próprio jogo já revelou.
 */
export function buildWord500ShareText(
  guesses: string[],
  answer: string,
  won: boolean,
  gameDate: string,
): string {
  const tries = won ? `${guesses.length}/${WORD500_MAX_ATTEMPTS}` : `X/${WORD500_MAX_ATTEMPTS}`;
  const header = `Word500 ${gameDate} ${tries}`;
  const grid = guesses
    .map((g) => {
      const { green, yellow, red } = scoreGuessCounts(g, answer);
      return "🟩".repeat(green) + "🟨".repeat(yellow) + "⬛".repeat(red);
    })
    .join("\n");
  return `${header}\n${grid}`;
}
