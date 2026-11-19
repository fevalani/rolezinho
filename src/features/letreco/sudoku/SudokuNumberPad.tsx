import { isDigitComplete } from "../sudokuLogic";

interface SudokuNumberPadProps {
  board: string;
  selected: number | null;
  pencilMode: boolean;
  isPaused: boolean;
  onTogglePencil: () => void;
  onDigit: (digit: number) => void;
}

/** Botão de rascunho + teclado numérico 1–9 (dígito já completo fica desabilitado). */
export function SudokuNumberPad({
  board,
  selected,
  pencilMode,
  isPaused,
  onTogglePencil,
  onDigit,
}: SudokuNumberPadProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onTogglePencil}
        disabled={isPaused}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 disabled:opacity-50 ${
          pencilMode
            ? "bg-[rgba(201,165,90,0.18)] text-[var(--gold)] border-[rgba(201,165,90,0.4)]"
            : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border-[rgba(255,255,255,0.08)]"
        }`}
      >
        ✏️ Rascunho {pencilMode ? "ativo" : "desligado"}
      </button>
      <div className="flex justify-center gap-1.5 flex-wrap max-w-[420px] mx-auto w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const complete = isDigitComplete(board, d);
          return (
            <button
              key={d}
              onClick={() => onDigit(d)}
              disabled={isPaused || selected === null || complete}
              className={`w-10 h-10 rounded-md text-base font-bold border active:scale-95 disabled:opacity-40 transition-all ${
                pencilMode
                  ? "bg-transparent text-[var(--gold)] border-[rgba(201,165,90,0.4)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
