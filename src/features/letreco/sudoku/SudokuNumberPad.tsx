import { useRef } from "react";
import { isDigitComplete } from "../sudokuLogic";
import { hapticTap } from "@/lib/haptics";

/** Tempo de pressão para travar um número no rascunho. */
export const LOCK_PRESS_MS = 450;

interface SudokuNumberPadProps {
  board: string;
  selected: number | null;
  pencilMode: boolean;
  isPaused: boolean;
  /** Número travado (só no rascunho): tocar numa célula já anota ele. */
  lockedDigit?: number | null;
  onLockDigit?: (digit: number | null) => void;
  onTogglePencil: () => void;
  onDigit: (digit: number) => void;
}

/** Botão de rascunho + teclado numérico 1–9 (dígito já completo fica desabilitado). */
export function SudokuNumberPad({
  board,
  selected,
  pencilMode,
  isPaused,
  lockedDigit = null,
  onLockDigit,
  onTogglePencil,
  onDigit,
}: SudokuNumberPadProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  // Toque longo (só no rascunho): trava o número; de novo no mesmo, destrava.
  const startPress = (d: number) => {
    longPressed.current = false;
    if (!pencilMode || !onLockDigit) return;
    cancelPress();
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onLockDigit(lockedDigit === d ? null : d);
      void hapticTap();
    }, LOCK_PRESS_MS);
  };

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
              onClick={() => {
                // o clique que encerra um toque longo não conta como toque curto
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                onDigit(d);
              }}
              onPointerDown={() => startPress(d)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => pencilMode && e.preventDefault()}
              aria-pressed={pencilMode ? lockedDigit === d && !complete : undefined}
              disabled={isPaused || complete || (selected === null && !pencilMode)}
              className={`w-10 h-10 rounded-md text-base font-bold border active:scale-95 disabled:opacity-40 transition-all select-none touch-manipulation ${
                pencilMode && lockedDigit === d && !complete
                  ? "bg-[rgba(201,165,90,0.25)] text-[var(--gold)] border-[var(--gold)] ring-2 ring-[rgba(201,165,90,0.5)]"
                  : pencilMode
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
