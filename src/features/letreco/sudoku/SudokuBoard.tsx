import { isGivenCell } from "../sudokuLogic";
import type { GameStatus } from "../sudokuTypes";

interface SudokuBoardProps {
  puzzle: string;
  board: string;
  notes: Record<number, number[]>;
  selected: number | null;
  flashIndex: number | null;
  flashConflicts: number[];
  notesBlockMode: boolean;
  status: GameStatus;
  isPaused: boolean;
  onSelect: (index: number) => void;
  onResume: () => void;
  onToggleNotesBlockMode: () => void;
}

const BORDER_STRONG = "2px solid rgba(255,255,255,0.25)";
const BORDER_THIN = "1px solid rgba(255,255,255,0.16)";

/** Tabuleiro 9×9, com o toggle de visualização das anotações e o overlay de pausa. */
export function SudokuBoard({
  puzzle,
  board,
  notes,
  selected,
  flashIndex,
  flashConflicts,
  notesBlockMode,
  status,
  isPaused,
  onSelect,
  onResume,
  onToggleNotesBlockMode,
}: SudokuBoardProps) {
  const selRow = selected !== null ? Math.floor(selected / 9) : null;
  const selCol = selected !== null ? selected % 9 : null;
  const selBox =
    selRow !== null && selCol !== null
      ? Math.floor(selRow / 3) * 3 + Math.floor(selCol / 3)
      : null;

  return (
    <>
      <div className="flex items-center justify-center gap-2.5">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Alterar visualização do modo rascunho
        </span>
        <button
          role="switch"
          aria-checked={notesBlockMode}
          onClick={onToggleNotesBlockMode}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
            notesBlockMode ? "bg-[var(--green)]" : "bg-[rgba(255,255,255,0.15)]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
              notesBlockMode ? "translate-x-[1.375rem]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Blur no tabuleiro e overlay com botão para retomar a partida. */}
      <div
        className="relative mx-auto rounded-md overflow-hidden"
        style={{ width: "min(100%, 360px)" }}
      >
        <div
          className={`grid grid-cols-9 mx-auto border-2 border-[rgba(255,255,255,0.25)] rounded-md overflow-hidden transition-all duration-200 ${
            isPaused && status === "playing"
              ? "blur-md pointer-events-none select-none opacity-50"
              : ""
          }`}
        >
          {Array.from({ length: 81 }, (_, i) => {
            const r = Math.floor(i / 9);
            const c = i % 9;
            const given = isGivenCell(puzzle, i);
            const value = board[i];
            const cellNotes = notes[i];
            const isSelected = selected === i;
            const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
            const inPeer =
              selected !== null &&
              (r === selRow || c === selCol || box === selBox);
            const sameDigit =
              selected !== null &&
              value !== "0" &&
              value === board[selected] &&
              !isSelected;

            let bg = "bg-transparent";
            if (isSelected) bg = "bg-[rgba(201,165,90,0.28)]";
            else if (flashIndex === i || flashConflicts.includes(i))
              bg = "bg-[rgba(196,64,64,0.35)]";
            else if (sameDigit) bg = "bg-[rgba(201,165,90,0.16)]";
            else if (inPeer) bg = "bg-[rgba(255,255,255,0.04)]";

            return (
              <button
                key={i}
                onClick={() => status === "playing" && !isPaused && onSelect(i)}
                disabled={status !== "playing" || isPaused}
                className={`aspect-square flex items-center justify-center text-xl sm:text-2xl font-bold select-none transition-colors ${bg} ${
                  given ? "text-[var(--text-primary)]" : "text-[var(--gold)]"
                }`}
                style={{
                  borderTop: r % 3 === 0 ? BORDER_STRONG : BORDER_THIN,
                  borderLeft: c % 3 === 0 ? BORDER_STRONG : BORDER_THIN,
                  borderRight: c === 8 ? BORDER_STRONG : undefined,
                  borderBottom: r === 8 ? BORDER_STRONG : undefined,
                }}
              >
                {value !== "0" ? (
                  value
                ) : cellNotes && cellNotes.length > 0 ? (
                  <div
                    className={`grid grid-cols-3 grid-rows-3 w-full h-full ${
                      notesBlockMode ? "gap-[1px] p-[2px]" : ""
                    }`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
                      notesBlockMode ? (
                        <span
                          key={n}
                          className={`rounded-[2px] transition-colors ${
                            cellNotes.includes(n)
                              ? "bg-[var(--gold)]"
                              : "bg-transparent"
                          }`}
                        />
                      ) : (
                        <span
                          key={n}
                          className="flex items-center justify-center leading-none font-semibold text-[0.65rem] sm:text-xs text-[var(--text-secondary)]"
                        >
                          {cellNotes.includes(n) ? n : ""}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  ""
                )}
              </button>
            );
          })}
        </div>

        {isPaused && status === "playing" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[rgba(0,0,0,0.25)] backdrop-blur-sm">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              jogo pausado
            </p>
            <button
              onClick={onResume}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[rgba(201,165,90,0.2)] text-[var(--gold)] border border-[rgba(201,165,90,0.4)] hover:bg-[rgba(201,165,90,0.3)] transition-all active:scale-95"
            >
              ▶️ retomar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
