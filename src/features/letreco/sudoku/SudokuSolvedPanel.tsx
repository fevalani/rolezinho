import { SUDOKU_DIFFICULTIES, formatElapsed } from "../sudokuLogic";
import type { SudokuDifficulty } from "../sudokuTypes";

interface SudokuSolvedPanelProps {
  difficulty: SudokuDifficulty;
  score: number;
  elapsedSeconds: number;
  mistakes: number;
  ranked: boolean;
  onShowResult: () => void;
  onNewPractice: () => void;
}

/** Faixa "Resolvido!" no lugar do teclado, com atalho para o placar (ranqueado) ou novo puzzle (treino). */
export function SudokuSolvedPanel({
  difficulty,
  score,
  elapsedSeconds,
  mistakes,
  ranked,
  onShowResult,
  onNewPractice,
}: SudokuSolvedPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 max-w-[480px] mx-auto w-full">
      <div className="w-full text-center rounded-xl py-4 px-4 border bg-[rgba(58,186,122,0.1)] border-[rgba(58,186,122,0.3)]">
        <p className="text-lg font-bold text-[var(--green)]">
          Resolvido! +{score} pts 🎉
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {SUDOKU_DIFFICULTIES[difficulty].label} ·{" "}
          {formatElapsed(elapsedSeconds)} · {mistakes} erro
          {mistakes === 1 ? "" : "s"}
        </p>
      </div>
      {ranked ? (
        <button
          onClick={onShowResult}
          className="text-sm text-[var(--gold)] underline underline-offset-2"
        >
          Ver placar do dia
        </button>
      ) : (
        <button
          onClick={onNewPractice}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
        >
          🔁 Novo puzzle
        </button>
      )}
    </div>
  );
}
