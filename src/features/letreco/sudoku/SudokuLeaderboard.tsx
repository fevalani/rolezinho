import { Avatar } from "@/components/Avatar";
import { SUDOKU_DIFFICULTIES, formatElapsed } from "../sudokuLogic";
import type { SudokuLeaderboardEntry } from "../sudokuTypes";

export function SudokuLeaderboard({
  entries,
  meId,
}: {
  entries: SudokuLeaderboardEntry[];
  meId: string | undefined;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--text-muted)] py-6">
        Ninguém terminou ainda hoje. Seja o primeiro! 🏆
      </p>
    );
  }
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((e, i) => {
        const isMe = e.user_id === meId;
        return (
          <div
            key={e.user_id}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${isMe
              ? "bg-[rgba(201,165,90,0.1)] border-[rgba(201,165,90,0.3)]"
              : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.05)]"
              }`}
          >
            <span className="w-6 text-center text-sm font-bold text-[var(--text-muted)]">
              {medal[i] ?? i + 1}
            </span>
            <Avatar url={e.avatar_url} name={e.display_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {e.display_name.split(" ")[0]}
                {isMe && <span className="text-[var(--gold)]"> (você)</span>}
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)]">
                {SUDOKU_DIFFICULTIES[e.difficulty].label} · ⏱️{" "}
                {formatElapsed(e.elapsed_seconds)} · ❌ {e.mistakes}
              </p>
            </div>
            <span className="text-sm font-bold text-[var(--gold)] shrink-0">
              {e.score} pts
            </span>
          </div>
        );
      })}
    </div>
  );
}
