import { describe, it, expect } from "vitest";
import {
  SUDOKU_POOLS,
  SUDOKU_DIFFICULTIES,
  SUDOKU_DIFFICULTY_ORDER,
  getSudokuOfDay,
  getSudokuGameDate,
  isGivenCell,
  isBoardComplete,
  applyGuess,
  sudokuPointsFor,
  formatElapsed,
  buildSudokuShareText,
  BASE_SCORE,
  MIN_SCORE,
} from "@/features/letreco/sudokuLogic";

function assertValidSolution(solution: string) {
  const g = (r: number, c: number) => Number(solution[r * 9 + c]);
  for (let r = 0; r < 9; r++) {
    const row = Array.from({ length: 9 }, (_, c) => g(r, c)).sort();
    expect(row).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  for (let c = 0; c < 9; c++) {
    const col = Array.from({ length: 9 }, (_, r) => g(r, c)).sort();
    expect(col).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const box = [];
      for (let r = br; r < br + 3; r++)
        for (let c = bc; c < bc + 3; c++) box.push(g(r, c));
      expect(box.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  }
}

describe("SUDOKU_POOLS", () => {
  it("todas as dificuldades têm pool com puzzles válidos", () => {
    for (const diff of SUDOKU_DIFFICULTY_ORDER) {
      const pool = SUDOKU_POOLS[diff];
      expect(pool.length).toBeGreaterThan(10);
      for (const { puzzle, solution } of pool) {
        expect(puzzle).toHaveLength(81);
        expect(solution).toHaveLength(81);
        assertValidSolution(solution);
        const clues = puzzle.split("").filter((ch) => ch !== "0").length;
        expect(clues).toBe(SUDOKU_DIFFICULTIES[diff].clues);
        for (let i = 0; i < 81; i++) {
          if (puzzle[i] !== "0") expect(puzzle[i]).toBe(solution[i]);
        }
      }
    }
  });
});

describe("getSudokuOfDay", () => {
  it("é determinístico por data e produz uma solução válida", () => {
    const d = new Date("2026-06-17T12:00:00Z");
    const a = getSudokuOfDay("medio", d);
    const b = getSudokuOfDay("medio", new Date("2026-06-17T23:00:00Z"));
    expect(a).toEqual(b);
    assertValidSolution(a.solution);
    for (let i = 0; i < 81; i++) {
      if (a.puzzle[i] !== "0") expect(a.puzzle[i]).toBe(a.solution[i]);
    }
  });

  it("muda de um dia para o outro", () => {
    const a = getSudokuOfDay("medio", new Date("2026-06-17T12:00:00Z"));
    const b = getSudokuOfDay("medio", new Date("2026-06-18T12:00:00Z"));
    expect(a).not.toEqual(b);
  });

  it("dificuldades diferentes têm quantidades de pistas diferentes", () => {
    const d = new Date("2026-06-17T12:00:00Z");
    const facil = getSudokuOfDay("facil", d);
    const medio = getSudokuOfDay("medio", d);
    const dificil = getSudokuOfDay("dificil", d);
    const clues = (p: string) => p.split("").filter((ch) => ch !== "0").length;
    expect(clues(facil.puzzle)).toBe(SUDOKU_DIFFICULTIES.facil.clues);
    expect(clues(medio.puzzle)).toBe(SUDOKU_DIFFICULTIES.medio.clues);
    expect(clues(dificil.puzzle)).toBe(SUDOKU_DIFFICULTIES.dificil.clues);
  });
});

describe("getSudokuGameDate", () => {
  it("usa fuso America/Sao_Paulo (YYYY-MM-DD)", () => {
    const d = getSudokuGameDate(new Date("2026-06-17T12:00:00Z"));
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isGivenCell / applyGuess / isBoardComplete", () => {
  const puzzle = "1" + "0".repeat(80);
  const solution = "1" + "2".repeat(80);

  it("célula com pista não é editável", () => {
    expect(isGivenCell(puzzle, 0)).toBe(true);
    expect(isGivenCell(puzzle, 1)).toBe(false);
  });

  it("aceita dígito certo e rejeita errado", () => {
    const wrong = applyGuess(puzzle, solution, 1, 5);
    expect(wrong.correct).toBe(false);
    expect(wrong.board).toBe(puzzle);

    const right = applyGuess(puzzle, solution, 1, 2);
    expect(right.correct).toBe(true);
    expect(right.board[1]).toBe("2");
  });

  it("detecta tabuleiro completo", () => {
    expect(isBoardComplete(solution)).toBe(true);
    expect(isBoardComplete(puzzle)).toBe(false);
  });
});

describe("sudokuPointsFor", () => {
  it("pontua o máximo sem tempo/erros no médio (multiplicador 1x)", () => {
    expect(sudokuPointsFor(0, 0, "medio")).toBe(BASE_SCORE);
  });
  it("penaliza tempo e erros, nunca abaixo do piso", () => {
    expect(sudokuPointsFor(60, 0, "medio")).toBeLessThan(BASE_SCORE);
    expect(sudokuPointsFor(0, 1, "medio")).toBeLessThan(BASE_SCORE);
    expect(sudokuPointsFor(100000, 100, "dificil")).toBe(MIN_SCORE);
  });
  it("dificuldade maior multiplica a pontuação pra cima", () => {
    const facil = sudokuPointsFor(120, 1, "facil");
    const medio = sudokuPointsFor(120, 1, "medio");
    const dificil = sudokuPointsFor(120, 1, "dificil");
    expect(facil).toBeLessThan(medio);
    expect(dificil).toBeGreaterThan(medio);
  });
});

describe("formatElapsed", () => {
  it("formata mm:ss", () => {
    expect(formatElapsed(5)).toBe("0:05");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(600)).toBe("10:00");
  });
});

describe("buildSudokuShareText", () => {
  it("gera texto de compartilhamento sem revelar a solução", () => {
    const text = buildSudokuShareText("2026-06-17", "dificil", 125, 2, 700);
    expect(text).toContain("17/06/2026");
    expect(text).toContain("Difícil");
    expect(text).toContain("2:05");
    expect(text).toContain("700 pts");
  });
});
