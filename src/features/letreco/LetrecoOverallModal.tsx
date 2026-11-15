import { Avatar } from "@/components/Avatar";
import type { OverallEntry } from "./letrecoTypes";

export type GameMode = "letreco" | "letroso" | "sudoku" | "word500" | "fronteiras";

const OVERALL_TITLE: Record<GameMode, [string, string]> = {
  letreco: ["Ranking Letreco 🟩", "Letreco"],
  letroso: ["Ranking Letroso 🔠", "Letroso"],
  sudoku: ["Ranking Sudoku 🧩", "Sudoku"],
  word500: ["Ranking Word500 🎯", "Word500"],
  fronteiras: ["Ranking Fronteiras 🗺️", "Fronteiras"],
};

// ─── Ranking geral (acumulado) ────────────────────────────────

function OverallLeaderboard({
  entries,
  meId,
}: {
  entries: OverallEntry[];
  meId: string | undefined;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--text-muted)] py-6">
        Ainda não há pontuação acumulada. Bora jogar! 🟩
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
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
              isMe
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
                {e.wins} vitória{e.wins !== 1 ? "s" : ""} · {e.games} jogo
                {e.games !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-sm font-bold text-[var(--gold)] shrink-0">
              {e.totalScore} pts
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Modal do ranking geral (pontuação acumulada) do jogo selecionado. */
export function OverallRankingModal({
  gameMode,
  entries,
  meId,
  onClose,
}: {
  gameMode: GameMode;
  entries: OverallEntry[] | null;
  meId: string | undefined;
  onClose: () => void;
}) {
  const [title, short] = OVERALL_TITLE[gameMode];
  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[88dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {short} · pontuação acumulada de todos os dias
        </p>
        {entries ? (
          <OverallLeaderboard entries={entries} meId={meId} />
        ) : (
          <div className="flex justify-center py-6">
            <div className="spinner" />
          </div>
        )}
      </div>
    </>
  );
}
