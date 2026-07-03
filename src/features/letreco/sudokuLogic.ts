import poolRawFacil from "./sudoku_puzzles_facil.txt?raw";
import poolRawMedio from "./sudoku_puzzles_medio.txt?raw";
import poolRawDificil from "./sudoku_puzzles_dificil.txt?raw";
import type { SudokuDifficulty, SudokuOfDay } from "./sudokuTypes";

// ─── Dificuldades ───────────────────────────────────────────────────────
// Ver docs/letreco-sudoku-jogo-diario.md §3.2 e §4

export const SUDOKU_DIFFICULTIES: Record<
  SudokuDifficulty,
  { label: string; clues: number; scoreMultiplier: number }
> = {
  facil: { label: "Fácil", clues: 44, scoreMultiplier: 0.7 },
  medio: { label: "Médio", clues: 34, scoreMultiplier: 1.0 },
  dificil: { label: "Difícil", clues: 28, scoreMultiplier: 1.35 },
};

export const SUDOKU_DIFFICULTY_ORDER: SudokuDifficulty[] = ["facil", "medio", "dificil"];

// ─── Pontuação ────────────────────────────────────────────────────────

export const BASE_SCORE = 1000;
export const TIME_PENALTY_PER_MINUTE = 20;
export const MISTAKE_PENALTY = 40;
export const MIN_SCORE = 50;

export function sudokuPointsFor(
  elapsedSeconds: number,
  mistakes: number,
  difficulty: SudokuDifficulty,
): number {
  const raw =
    BASE_SCORE -
    (elapsedSeconds / 60) * TIME_PENALTY_PER_MINUTE -
    mistakes * MISTAKE_PENALTY;
  const multiplier = SUDOKU_DIFFICULTIES[difficulty].scoreMultiplier;
  return Math.max(MIN_SCORE, Math.round(raw * multiplier));
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

// ─── Pools de puzzles por dificuldade (sudoku_puzzles_*.txt) ──────────
// Cada linha: "<puzzle81>:<solucao81>", pré-verificado com solução única
// (script scripts/generate_sudoku_puzzles.py, offline).

interface PoolEntry {
  puzzle: string;
  solution: string;
}

function parsePool(raw: string): PoolEntry[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [puzzle, solution] = line.split(":");
      return { puzzle, solution };
    })
    .filter((e) => e.puzzle?.length === 81 && e.solution?.length === 81);
}

export const SUDOKU_POOLS: Record<SudokuDifficulty, PoolEntry[]> = {
  facil: parsePool(poolRawFacil),
  medio: parsePool(poolRawMedio),
  dificil: parsePool(poolRawDificil),
};

// ─── RNG determinístico (mesmo padrão de letreco/letrosoLogic) ────────

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededShuffleIndices(length: number, seed: number): number[] {
  const rng = mulberry32(seed);
  return shuffleArray(
    Array.from({ length }, (_, i) => i),
    rng,
  );
}

const SUDOKU_POOL_SEEDS: Record<SudokuDifficulty, number> = {
  facil: 0x5d0c1,
  medio: 0x5d0c2,
  dificil: 0x5d0c3,
};

const SUDOKU_DAILY_ORDERS: Record<SudokuDifficulty, number[]> = {
  facil: seededShuffleIndices(SUDOKU_POOLS.facil.length, SUDOKU_POOL_SEEDS.facil),
  medio: seededShuffleIndices(SUDOKU_POOLS.medio.length, SUDOKU_POOL_SEEDS.medio),
  dificil: seededShuffleIndices(SUDOKU_POOLS.dificil.length, SUDOKU_POOL_SEEDS.dificil),
};

// ─── Data / dia absoluto (fuso America/Sao_Paulo) ─────────────────────

export function getSudokuGameDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDayNumber(date: Date = new Date()): number {
  const ymd = getSudokuGameDate(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// ─── Scramble determinístico (grupo de simetrias que preserva unicidade) ──
// Ver docs/letreco-sudoku-jogo-diario.md §2.2

function buildAxisPermutation(rng: () => number): number[] {
  const bandOrder = shuffleArray([0, 1, 2], rng);
  const perm: number[] = [];
  for (const band of bandOrder) {
    const within = shuffleArray([0, 1, 2], rng);
    for (const w of within) perm.push(band * 3 + w);
  }
  return perm;
}

function applyGridTransform(
  str81: string,
  rowPerm: number[],
  colPerm: number[],
  digitMap: number[],
  transpose: boolean,
): string {
  const rows: string[] = [];
  for (let r = 0; r < 9; r++) rows.push(str81.slice(r * 9, r * 9 + 9));

  let out: string[][] = Array.from({ length: 9 }, () => new Array(9).fill("0"));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const ch = rows[rowPerm[r]][colPerm[c]];
      out[r][c] = ch === "0" ? "0" : String(digitMap[Number(ch) - 1]);
    }
  }

  if (transpose) {
    const t: string[][] = Array.from({ length: 9 }, () => new Array(9).fill("0"));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) t[c][r] = out[r][c];
    out = t;
  }

  return out.map((row) => row.join("")).join("");
}

export function getSudokuOfDay(
  difficulty: SudokuDifficulty,
  date: Date = new Date(),
): SudokuOfDay {
  const pool = SUDOKU_POOLS[difficulty];
  if (pool.length === 0) return { puzzle: "0".repeat(81), solution: "1".repeat(81) };

  const day = getDayNumber(date);
  const order = SUDOKU_DAILY_ORDERS[difficulty];
  const poolIdx = order[((day % pool.length) + pool.length) % pool.length];
  const base = pool[poolIdx];

  const rng = mulberry32((SUDOKU_POOL_SEEDS[difficulty] ^ day) >>> 0);
  const rowPerm = buildAxisPermutation(rng);
  const colPerm = buildAxisPermutation(rng);
  const digitMap = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  const transpose = rng() < 0.5;

  return {
    puzzle: applyGridTransform(base.puzzle, rowPerm, colPerm, digitMap, transpose),
    solution: applyGridTransform(base.solution, rowPerm, colPerm, digitMap, transpose),
  };
}

// ─── Estado do tabuleiro ───────────────────────────────────────────────

export function isGivenCell(puzzle: string, index: number): boolean {
  return puzzle[index] !== "0";
}

export function isBoardComplete(board: string): boolean {
  return board.length === 81 && !board.includes("0");
}

/** Preenche uma célula editável se o dígito bater com o gabarito; senão não altera o board. */
export function applyGuess(
  board: string,
  solution: string,
  index: number,
  digit: number,
): { board: string; correct: boolean } {
  const correct = solution[index] === String(digit);
  if (!correct) return { board, correct: false };
  const next = board.slice(0, index) + String(digit) + board.slice(index + 1);
  return { board: next, correct: true };
}

// ─── Compartilhamento ───────────────────────────────────────────────────

export function buildSudokuShareText(
  gameDate: string,
  difficulty: SudokuDifficulty,
  elapsedSeconds: number,
  mistakes: number,
  score: number,
): string {
  const [y, m, d] = gameDate.split("-");
  return [
    `🧩 Sudoku do dia ${d}/${m}/${y} · ${SUDOKU_DIFFICULTIES[difficulty].label}`,
    `⏱️ ${formatElapsed(elapsedSeconds)} · ❌ ${mistakes} erro${mistakes === 1 ? "" : "s"} · ${score} pts`,
  ].join("\n");
}
