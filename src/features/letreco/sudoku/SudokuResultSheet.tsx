import { SudokuLeaderboard } from "./SudokuLeaderboard";
import type { GameStatus, SudokuLeaderboardEntry } from "../sudokuTypes";

interface SudokuResultSheetProps {
  status: GameStatus;
  shareLabel: string;
  leaderboard: SudokuLeaderboardEntry[];
  meId: string | undefined;
  onShare: () => void;
  onClose: () => void;
}

/** Modal de resultado: compartilhar + placar do dia. */
export function SudokuResultSheet({
  status,
  shareLabel,
  leaderboard,
  meId,
  onShare,
  onClose,
}: SudokuResultSheetProps) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[88dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {status === "won" ? "Resolvido! 🧩" : "Resultado de hoje"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        <button
          onClick={onShare}
          className="w-full mb-4 py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] transition-all"
        >
          📋 {shareLabel}
        </button>

        <p className="text-xs text-[var(--text-muted)] mb-3">Placar do dia</p>
        <SudokuLeaderboard entries={leaderboard} meId={meId} />
      </div>
    </>
  );
}
