// ═══════════════════════════════════════════
// Letreco — Lógica pura (sem rede, testável)
// ═══════════════════════════════════════════

import wordsRaw from "./words.txt?raw";
import type { LetterStatus } from "./letrecoTypes";

/** Tamanho da palavra (padrão do gênero) */
export const WORD_LENGTH = 5;

/** Tentativas por jogador por dia */
export const MAX_ATTEMPTS = 5;

/**
 * Pontuação por nº da tentativa do acerto (índice 0 = acertou de primeira).
 * Fica num único lugar para ajuste fácil.
 */
export const SCORE_BY_ATTEMPT = [100, 70, 50, 30, 15] as const;

/** Remove acentos e coloca em maiúsculas: "AÇÃO" → "ACAO" */
export function normalize(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Lista de palavras (secretas + dicionário de validação) lida direto do
 * `words.txt` empacotado. Já normalizada e filtrada para 5 letras.
 */
export const WORD_LIST: string[] = Array.from(
  new Set(
    wordsRaw
      .split(/\r?\n/)
      .map((w) => normalize(w))
      .filter((w) => w.length === WORD_LENGTH),
  ),
);

const WORD_SET = new Set(WORD_LIST);

/**
 * Palavras extras aprovadas pela comunidade, carregadas do banco em runtime.
 * Ampliam APENAS a validação de palpites — nunca o pool de respostas
 * (a palavra do dia continua determinística só a partir de `words.txt`).
 */
const EXTRA_WORD_SET = new Set<string>();

/** Mescla palavras aprovadas (vindas do banco) ao dicionário de validação. */
export function addRuntimeWords(words: string[]): void {
  for (const w of words) {
    const n = normalize(w);
    if (n.length === WORD_LENGTH) EXTRA_WORD_SET.add(n);
  }
}

/** Valida se o palpite existe na lista de palavras permitidas */
export function isValidWord(word: string): boolean {
  const n = normalize(word);
  return WORD_SET.has(n) || EXTRA_WORD_SET.has(n);
}

// ─── Heurística "parece uma palavra" ────────────────────────────

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

// Sequências óbvias de teclado — não são palavras, mas passariam nas
// outras regras (têm vogais, sem letras repetidas).
const KEYBOARD_RUNS = [
  "QWERT", "WERTY", "ERTYU", "RTYUI", "TYUIO", "YUIOP",
  "ASDFG", "SDFGH", "DFGHJ", "FGHJK", "GHJKL",
  "ZXCVB", "XCVBN", "CVBNM",
];

/**
 * Decide se um palpite recusado *parece* uma palavra de verdade — só então
 * vale a pena oferecer o botão de "adicionar ao dicionário" e gastar uma
 * chamada à API. Não precisa ser perfeita: filtra o lixo gritante (sequências
 * aleatórias, teclas em fila, letras repetidas demais) e deixa a API ser a
 * fonte de verdade final. Melhor pecar por tolerância do que esconder o botão
 * numa palavra real.
 */
export function isPlausibleWord(word: string): boolean {
  const w = normalize(word);
  if (w.length !== WORD_LENGTH) return false;

  // 1) precisa de pelo menos uma vogal
  let vowels = 0;
  for (const ch of w) if (VOWELS.has(ch)) vowels++;
  if (vowels === 0) return false;

  // 2) não pode ser quase tudo a mesma letra (ex.: AAAAB, AAABA)
  const counts: Record<string, number> = {};
  for (const ch of w) counts[ch] = (counts[ch] ?? 0) + 1;
  if (Math.max(...Object.values(counts)) > 3) return false;

  // 3) sem 3 letras idênticas seguidas (ex.: LLLAA)
  if (/(.)\1\1/.test(w)) return false;

  // 4) sem 3 consoantes idênticas... e sem 4 consoantes seguidas quaisquer
  //    (clusters assim não existem em português: BCDFG, MNBVC)
  if (/[^AEIOU]{4}/.test(w)) return false;

  // 5) não pode ser uma fileira do teclado
  if (KEYBOARD_RUNS.includes(w)) return false;

  return true;
}

/** Pontos pelo nº da tentativa do acerto (1-indexed). Fora da faixa → 0. */
export function pointsFor(attempt: number): number {
  return SCORE_BY_ATTEMPT[attempt - 1] ?? 0;
}

/**
 * Compara um palpite com a resposta e retorna o status de cada letra,
 * tratando letras repetidas em duas passadas (clássico do Wordle):
 * primeiro marca os verdes (posição certa), depois distribui amarelos
 * apenas pelo que sobrou de cada letra na resposta.
 */
export function scoreGuess(guess: string, answer: string): LetterStatus[] {
  const g = normalize(guess);
  const a = normalize(answer);
  const result: LetterStatus[] = new Array(g.length).fill("absent");

  // Contagem de letras ainda "disponíveis" na resposta
  const remaining: Record<string, number> = {};
  for (const ch of a) remaining[ch] = (remaining[ch] ?? 0) + 1;

  // 1ª passada — verdes
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      remaining[g[i]]--;
    }
  }

  // 2ª passada — amarelos pelo que sobrou
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
 * Agrega o melhor status já descoberto de cada letra (para o teclado virtual).
 * Prioridade: correct > present > absent.
 */
export function aggregateKeyStatuses(
  guesses: string[],
  answer: string,
): Record<string, LetterStatus> {
  const rank: Record<LetterStatus, number> = {
    absent: 0,
    present: 1,
    correct: 2,
  };
  const map: Record<string, LetterStatus> = {};
  for (const guess of guesses) {
    const statuses = scoreGuess(guess, answer);
    const g = normalize(guess);
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      const st = statuses[i];
      if (!map[ch] || rank[st] > rank[map[ch]]) map[ch] = st;
    }
  }
  return map;
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

// Ordem fixa em que as palavras do dia aparecem. Como é uma permutação
// completa, nenhuma palavra se repete antes de esgotar a lista inteira.
const DAILY_ORDER = seededShuffle(WORD_LIST.length, 0x1efa);

/**
 * "Dia número" no fuso de Brasília — dias desde a época Unix. Igual para
 * todos os jogadores no mesmo dia, independente do dispositivo.
 */
export function getDayNumber(date: Date = new Date()): number {
  // Data no fuso America/Sao_Paulo como "YYYY-MM-DD"
  const ymd = getGameDate(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Data da partida ("YYYY-MM-DD") no fuso America/Sao_Paulo */
export function getGameDate(date: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** A palavra secreta do dia (igual para todos). */
export function getWordOfDay(date: Date = new Date()): string {
  if (WORD_LIST.length === 0) return "";
  const day = getDayNumber(date);
  const idx = DAILY_ORDER[((day % WORD_LIST.length) + WORD_LIST.length) % WORD_LIST.length];
  return WORD_LIST[idx];
}

// ─── Compartilhamento em emojis (sem spoiler) ───────────────────

const EMOJI: Record<LetterStatus, string> = {
  correct: "🟩",
  present: "🟨",
  absent: "⬛",
};

/**
 * Gera o resultado em emojis para colar no chat sem revelar a palavra.
 * Ex.: "Letreco #20250617 3/5\n🟨⬛⬛🟩⬛\n..."
 */
export function buildShareText(
  guesses: string[],
  answer: string,
  won: boolean,
  gameDate: string,
): string {
  const tries = won ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  const header = `Letreco ${gameDate} ${tries}`;
  const grid = guesses
    .map((g) =>
      scoreGuess(g, answer)
        .map((s) => EMOJI[s])
        .join(""),
    )
    .join("\n");
  return `${header}\n${grid}`;
}
