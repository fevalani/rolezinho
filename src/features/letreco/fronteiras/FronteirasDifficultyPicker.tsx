import { FRONTEIRAS_DIFFICULTIES, FRONTEIRAS_DIFFICULTY_ORDER } from "../fronteirasLogic";
import type { FronteirasDifficulty } from "../fronteirasTypes";

/** Escolha do nível do dia — igual ao Sudoku: vale o dia inteiro e vem antes do mapa. */
export function FronteirasDifficultyPicker({
  gameDate,
  onPick,
}: {
  gameDate: string;
  onPick: (d: FronteirasDifficulty) => void;
}) {
  return (
    <div className="flex flex-col px-4 py-6 gap-4 max-w-[420px] mx-auto w-full">
      <div>
        <p className="text-xs text-[var(--text-muted)]">
          Fronteiras do dia · {gameDate.split("-").reverse().join("/")}
        </p>
        <h2
          className="text-lg font-bold text-[var(--gold)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Escolha a dificuldade
        </h2>
        <p className="text-[0.7rem] text-[var(--text-muted)] mt-1">
          Vale pro dia inteiro — só muda amanhã. O mapa e os países do dia aparecem depois
          da escolha.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {FRONTEIRAS_DIFFICULTY_ORDER.map((diff) => {
          const cfg = FRONTEIRAS_DIFFICULTIES[diff];
          return (
            <button
              key={diff}
              onClick={() => onPick(diff)}
              className="text-left px-4 py-3 rounded-xl border bg-[var(--bg-card)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(201,165,90,0.4)] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)]">{cfg.label}</span>
                <span className="text-xs font-bold text-[var(--gold)]">
                  ×{cfg.scoreMultiplier.toFixed(2).replace(/\.?0+$/, "")}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{cfg.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
