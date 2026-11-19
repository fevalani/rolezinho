import { useState } from "react";
import { SUDOKU_DIFFICULTIES, formatElapsed } from "../sudokuLogic";
import type { GameStatus, SudokuDifficulty } from "../sudokuTypes";

interface SudokuHeaderProps {
  gameDate: string;
  difficulty: SudokuDifficulty;
  elapsedSeconds: number;
  mistakes: number;
  ranked: boolean;
  status: GameStatus;
  manualPaused: boolean;
  onTogglePause: () => void;
  onToggleRules: () => void;
  onToggleRanked: () => void;
  onNewPractice: () => void;
  onShowResult: () => void;
}

/** Cabeçalho da partida: título, tempo/erros, botão de pausa e menu "⋯". */
export function SudokuHeader({
  gameDate,
  difficulty,
  elapsedSeconds,
  mistakes,
  ranked,
  status,
  manualPaused,
  onTogglePause,
  onToggleRules,
  onToggleRanked,
  onNewPractice,
  onShowResult,
}: SudokuHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="px-4 pb-3 flex items-center justify-between relative">
      <div>
        <p className="text-xs text-[var(--text-muted)]">
          Sudoku do dia · {gameDate.split("-").reverse().join("/")} ·{" "}
          {SUDOKU_DIFFICULTIES[difficulty].label}
        </p>
        <p className="text-[0.65rem] text-[var(--text-muted)] opacity-60">
          ⏱️ {formatElapsed(elapsedSeconds)} · ❌ {mistakes} erro
          {mistakes === 1 ? "" : "s"}
        </p>
        {!ranked && (
          <p className="text-[0.6rem] text-[var(--gold)] opacity-80 mt-0.5">
            🎓 Modo treino — não conta pro ranking, pode jogar quantas vezes
            quiser
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status === "playing" && (
          <button
            onClick={onTogglePause}
            aria-label={manualPaused ? "Retomar partida" : "Pausar partida"}
            title={manualPaused ? "Retomar" : "Pausar"}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-sm font-bold leading-none bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.08)] transition-all active:scale-95"
          >
            {manualPaused ? "▶️" : "⏸️"}
          </button>
        )}

        <button
          onClick={() => setShowMenu((v) => !v)}
          aria-label="Mais opções"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-lg font-bold leading-none bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.08)] transition-all"
        >
          ⋯
        </button>
      </div>
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-4 top-full mt-1 z-50 w-56 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[var(--bg-elevated)] shadow-lg p-2 flex flex-col gap-1.5">
            <button
              onClick={() => {
                onToggleRules();
                setShowMenu(false);
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] transition-all"
            >
              ℹ️ Regras
            </button>

            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.04)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Treino
              </span>
              <button
                role="switch"
                aria-checked={!ranked}
                onClick={() => {
                  onToggleRanked();
                  setShowMenu(false);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  ranked ? "bg-[rgba(255,255,255,0.15)]" : "bg-[var(--green)]"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    ranked ? "translate-x-0.5" : "translate-x-[1.375rem]"
                  }`}
                />
              </button>
            </div>

            {!ranked && (
              <button
                onClick={() => {
                  onNewPractice();
                  setShowMenu(false);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(201,165,90,0.12)] text-[var(--gold)] transition-all"
              >
                🔁 Novo puzzle
              </button>
            )}
            {ranked && status !== "playing" && (
              <button
                onClick={() => {
                  onShowResult();
                  setShowMenu(false);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(201,165,90,0.12)] text-[var(--gold)] transition-all"
              >
                📊 Resultado
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
