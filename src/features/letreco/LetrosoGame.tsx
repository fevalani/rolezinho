import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  getLetrosoWordOfDay,
  getLetrosoGameDate,
  normalize,
  isValidLetrosoWord,
  scoreLetrosoGuess,
  aggregateLetrosoKeyStatuses,
  letrosoPointsFor,
  buildLetrosoShareText,
} from "./letrosoLogic";
import {
  getLetrosoTodayGame,
  saveLetrosoGame,
  getLetrosoDailyLeaderboard,
} from "./letrosoService";
import type { GameStatus, LetrosoLeaderboardEntry, LetrosoTileStatus } from "./letrosoTypes";

const INPUT_SENTINEL = ".";

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

// ─── Tiles ────────────────────────────────────────────────────────

function tileStyle(status: LetrosoTileStatus | "empty" | "filled"): {
  bg: string;
  border: string;
  text: string;
  radius: string;
  ring?: string;
} {
  switch (status) {
    case "absent":
      return {
        bg: "bg-[var(--bg-elevated)]",
        border: "border-[var(--bg-elevated)]",
        text: "text-[var(--text-secondary)]",
        radius: "rounded-md",
      };
    case "present":
      return {
        bg: "bg-[var(--gold)]",
        border: "border-[var(--gold)]",
        text: "text-[var(--bg-abyss)]",
        radius: "rounded-md",
      };
    case "filled":
      return {
        bg: "bg-transparent",
        border: "border-[rgba(201,165,90,0.45)]",
        text: "text-[var(--text-primary)]",
        radius: "rounded-md",
      };
    case "empty":
      return {
        bg: "bg-transparent",
        border: "border-[rgba(255,255,255,0.1)]",
        text: "text-[var(--text-primary)]",
        radius: "rounded-md",
      };
    case "solo":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-md",
      };
    case "block_start":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-l-md rounded-r-none",
      };
    case "block_mid":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-none",
      };
    case "block_end":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-r-md rounded-l-none",
      };
    case "cap_s":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-l-md rounded-r-none",
        ring: "ring-2 ring-[var(--green)] ring-offset-1 ring-offset-[var(--bg-abyss)]",
      };
    case "cap_s_end":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-r-none rounded-l-none",
        ring: "ring-2 ring-[var(--green)] ring-offset-1 ring-offset-[var(--bg-abyss)]",
      };
    case "cap_e":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-l-none rounded-r-none",
        ring: "ring-2 ring-[var(--green)] ring-offset-1 ring-offset-[var(--bg-abyss)]",
      };
    case "cap_e_end":
      return {
        bg: "bg-[var(--green)]",
        border: "border-[var(--green)]",
        text: "text-white",
        radius: "rounded-r-md rounded-l-none",
        ring: "ring-2 ring-[var(--green)] ring-offset-1 ring-offset-[var(--bg-abyss)]",
      };
  }
}

function tileFontSize(len: number): string {
  if (len <= 6) return "text-xl";
  if (len <= 8) return "text-base";
  return "text-sm";
}

// ─── Grade ────────────────────────────────────────────────────────

function LetrosoGrid({
  guesses,
  currentInput,
  active,
  answer,
  shake,
  onTapInput,
}: {
  guesses: string[];
  currentInput: string;
  active: boolean;
  answer: string;
  shake: boolean;
  onTapInput: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 mx-auto w-full" style={{ maxWidth: 380 }}>
      {/* Linhas submetidas */}
      {guesses.map((guess, r) => {
        const statuses = scoreLetrosoGuess(guess, answer);
        const wl = guess.length;
        const fs = tileFontSize(wl);

        return (
          <div key={r} className="flex gap-1 justify-center">
            {guess.split("").map((letter, c) => {
              const styleKey = statuses[c];
              const s = tileStyle(styleKey);

              const isInBlock =
                statuses[c] === "block_mid" ||
                statuses[c] === "block_end" ||
                statuses[c] === "cap_s_end" ||
                statuses[c] === "cap_e_end" ||
                statuses[c] === "cap_e";
              const rightIsBlock =
                c < wl - 1 &&
                (statuses[c] === "block_start" ||
                  statuses[c] === "block_mid" ||
                  statuses[c] === "cap_s" ||
                  statuses[c] === "cap_s_end" ||
                  statuses[c] === "cap_e");

              return (
                <div
                  key={c}
                  className={[
                    "w-8 h-8 flex items-center justify-center border-2 font-bold uppercase select-none letreco-flip",
                    fs,
                    s.bg,
                    s.border,
                    s.text,
                    s.radius,
                    s.ring ?? "",
                  ].join(" ")}
                  style={{
                    animationDelay: `${c * 0.1}s`,
                    ...(isInBlock ? { marginLeft: "-2px" } : {}),
                    ...(rightIsBlock ? { marginRight: "-2px" } : {}),
                  }}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Linha de input atual */}
      {active && (
        <div
          className={`flex gap-1 justify-center ${shake ? "anim-shake" : ""}`}
          onClick={onTapInput}
        >
          {currentInput.length === 0 ? (
            // Placeholder com cursor piscando
            <div className="w-8 h-8 flex items-center justify-center border-2 border-[rgba(255,255,255,0.1)] rounded-md letreco-cursor" />
          ) : (
            <>
              {currentInput.split("").map((letter, c) => {
                const s = tileStyle("filled");
                return (
                  <div
                    key={c}
                    className={[
                      "w-8 h-8 flex items-center justify-center border-2 font-bold uppercase select-none letreco-pop",
                      tileFontSize(currentInput.length),
                      s.bg, s.border, s.text, s.radius,
                    ].join(" ")}
                  >
                    {letter}
                  </div>
                );
              })}
              {/* Cursor no fim */}
              {currentInput.length < 10 && (
                <div className="w-8 h-8 flex items-center justify-center border-2 border-[rgba(255,255,255,0.1)] rounded-md letreco-cursor" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Teclado ──────────────────────────────────────────────────────

function keyClasses(status: "correct" | "present" | "absent" | undefined): string {
  switch (status) {
    case "correct": return "bg-[var(--green)] text-white border-[var(--green)]";
    case "present": return "bg-[var(--gold)] text-[var(--bg-abyss)] border-[var(--gold)]";
    case "absent":  return "bg-[var(--bg-deep)] text-[var(--text-muted)] border-[rgba(255,255,255,0.04)]";
    default:        return "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[rgba(255,255,255,0.08)]";
  }
}

function Keyboard({
  keyStatuses,
  onKey,
  disabled,
}: {
  keyStatuses: Record<string, "correct" | "present" | "absent">;
  onKey: (k: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[480px] mx-auto px-1">
      {KEY_ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1">
          {row.map((k) => {
            const wide = k === "ENTER" || k === "BACK";
            const label = k === "BACK" ? "⌫" : k === "ENTER" ? "↵" : k;
            return (
              <button
                key={k}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !disabled && onKey(k)}
                disabled={disabled}
                className={`h-12 rounded-md text-sm font-bold uppercase border transition-all active:scale-95 disabled:opacity-50 ${
                  wide ? "px-2 flex-[1.5] text-base" : "flex-1"
                } ${keyClasses(keyStatuses[k])}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Legenda do feedback ───────────────────────────────────────────

function FeedbackLegend() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-xs space-y-1.5">
      <p className="font-semibold text-[var(--text-secondary)] text-[0.65rem] uppercase tracking-wide mb-2">Como funciona o feedback</p>
      {[
        { color: "bg-[var(--green)] rounded-md", label: "Letra certa, sozinha" },
        {
          color: "flex",
          isBlock: true,
          label: "Bloco unido = letras consecutivas na palavra",
        },
        {
          color: "flex ring-2 ring-[var(--green)] ring-offset-1 ring-offset-[var(--bg-abyss)]",
          isBlock: true,
          isCap: true,
          label: "Cápsula = início e fim da palavra descobertos",
        },
        { color: "bg-[var(--gold)] rounded-md", label: "Letra existe, posição errada" },
        { color: "bg-[var(--bg-elevated)] rounded-md", label: "Letra não está na palavra" },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {item.isBlock ? (
            <div className={item.color}>
              {["w", item.isCap ? "·" : "x", item.isCap ? "·" : "y", "z"].map((l, j, arr) => (
                <div
                  key={j}
                  className={`w-5 h-5 flex items-center justify-center border-2 border-[var(--green)] bg-[var(--green)] text-white text-[0.55rem] font-bold uppercase ${
                    j === 0 ? "rounded-l-sm" : j === arr.length - 1 ? "rounded-r-sm" : "rounded-none"
                  } ${j > 0 ? "-ml-0.5" : ""} ${item.isCap && (j === 1 || j === 2) ? "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.1)] text-[var(--text-muted)]" : ""}`}
                >
                  {l === "·" ? "" : l}
                </div>
              ))}
            </div>
          ) : (
            <div className={`w-5 h-5 shrink-0 border-2 border-transparent ${item.color}`} />
          )}
          <span className="text-[var(--text-muted)]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Leaderboard do dia ───────────────────────────────────────────

function LetrosoLeaderboard({
  entries,
  meId,
}: {
  entries: LetrosoLeaderboardEntry[];
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
                {e.status === "won"
                  ? `Acertou em ${e.attempts} tentativa${e.attempts === 1 ? "" : "s"}`
                  : "Não acertou"}
              </p>
            </div>
            <span className="text-sm font-bold text-[var(--gold)] shrink-0">{e.score} pts</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

export function LetrosoGame() {
  const { user } = useAuth();
  const answer = useMemo(() => getLetrosoWordOfDay(), []);
  const gameDate = useMemo(() => getLetrosoGameDate(), []);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState<string>("");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LetrosoLeaderboardEntry[]>([]);
  const [showLegend, setShowLegend] = useState(false);
  const [shareLabel, setShareLabel] = useState("Compartilhar resultado");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const keyStatuses = useMemo(
    () => aggregateLetrosoKeyStatuses(guesses, answer),
    [guesses, answer],
  );

  const loadLeaderboard = useCallback(async () => {
    const lb = await getLetrosoDailyLeaderboard(gameDate);
    setLeaderboard(lb);
  }, [gameDate]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const game = await getLetrosoTodayGame(user.id, gameDate);
      if (!active) return;
      if (game) {
        setGuesses(game.guesses);
        setStatus(game.status);
        setScore(game.score);
        setCurrentInput("");
        if (game.status !== "playing") {
          setShowResult(true);
          loadLeaderboard();
        }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user, gameDate, loadLeaderboard]);

  const submitGuess = useCallback(async () => {
    if (!user || status !== "playing") return;
    const word = normalize(currentInput);
    if (word.length < 5) {
      setShake(true);
      flashToast("Mínimo 5 letras");
      setTimeout(() => setShake(false), 450);
      return;
    }
    if (!isValidLetrosoWord(word)) {
      setShake(true);
      flashToast("Palavra não encontrada");
      setTimeout(() => setShake(false), 450);
      return;
    }

    const newGuesses = [...guesses, word];
    const won = word === answer;
    const newStatus: GameStatus = won ? "won" : "playing";
    const newScore = won ? letrosoPointsFor(newGuesses.length) : 0;

    setGuesses(newGuesses);
    setCurrentInput("");
    setStatus(newStatus);
    setScore(newScore);

    await saveLetrosoGame(user.id, gameDate, {
      guesses: newGuesses,
      status: newStatus,
      attempts: newGuesses.length,
      score: newScore,
    });

    if (newStatus === "won") {
      setTimeout(() => {
        setShowResult(true);
        loadLeaderboard();
      }, word.length * 120 + 200);
    }
  }, [user, status, currentInput, guesses, answer, gameDate, flashToast, loadLeaderboard]);

  const handleKey = useCallback(
    (k: string) => {
      if (status !== "playing") return;
      if (k === "ENTER") {
        submitGuess();
      } else if (k === "BACK") {
        setCurrentInput((prev) => prev.slice(0, -1));
      } else if (/^[A-Z]$/.test(k)) {
        setCurrentInput((prev) => (prev.length < 10 ? prev + k : prev));
      }
    },
    [status, submitGuess],
  );

  const resetInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = INPUT_SENTINEL;
    el.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
  }, []);

  const focusInput = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      el.value = INPUT_SENTINEL;
      el.focus({ preventScroll: true });
      el.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
    }
  }, []);

  const handleNativeInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const val = e.currentTarget.value;
      if (val.length > INPUT_SENTINEL.length) {
        for (const ch of val.slice(INPUT_SENTINEL.length)) {
          if (/[a-zA-Z]/.test(ch)) handleKey(ch.toUpperCase());
        }
      } else if (val.length < INPUT_SENTINEL.length) {
        handleKey("BACK");
      }
      resetInput();
    },
    [handleKey, resetInput],
  );

  const handleNativeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") { handleKey("ENTER"); e.preventDefault(); }
    },
    [handleKey],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === inputRef.current) return;
      const key = e.key;
      if (key === "Enter") handleKey("ENTER");
      else if (key === "Backspace") handleKey("BACK");
      else if (/^[a-zA-Z]$/.test(key)) handleKey(key.toUpperCase());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const handleShare = async () => {
    const text = buildLetrosoShareText(guesses, answer, status === "won", gameDate);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShareLabel("Copiado! ✓");
        setTimeout(() => setShareLabel("Compartilhar resultado"), 2000);
      }
    } catch { /* cancelled */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-16">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-muted)]">
            Palavra do dia · {gameDate.split("-").reverse().join("/")}
          </p>
          <p className="text-[0.65rem] text-[var(--text-muted)] opacity-60">
            5 a 10 letras · tentativas ilimitadas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.08)] transition-all"
          >
            ℹ️ Regras
          </button>
          {status !== "playing" && (
            <button
              onClick={() => { setShowResult(true); loadLeaderboard(); }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
            >
              📊 Resultado
            </button>
          )}
        </div>
      </div>

      {/* Legenda colapsável */}
      {showLegend && (
        <div className="px-4 mb-3">
          <FeedbackLegend />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.1)] text-sm font-semibold text-[var(--text-primary)] shadow-lg anim-fade">
          {toast}
        </div>
      )}

      <input
        ref={inputRef}
        defaultValue={INPUT_SENTINEL}
        onInput={handleNativeInput}
        onKeyDown={handleNativeKeyDown}
        onFocus={resetInput}
        readOnly={status !== "playing"}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="enter"
        style={{ fontSize: 16, caretColor: "transparent" }}
        className="absolute -z-10 opacity-0 left-0 top-0 w-40 h-12 border-0 bg-transparent"
      />

      {/* Jogo */}
      <div className="flex-1 flex flex-col gap-5 px-4 py-2">
        <LetrosoGrid
          guesses={guesses}
          currentInput={currentInput}
          active={status === "playing"}
          answer={answer}
          shake={shake}
          onTapInput={focusInput}
        />

        {status === "playing" ? (
          <Keyboard keyStatuses={keyStatuses} onKey={handleKey} disabled={false} />
        ) : (
          <div className="flex flex-col items-center gap-3 max-w-[480px] mx-auto w-full">
            <div
              className={`w-full text-center rounded-xl py-4 px-4 border ${
                status === "won"
                  ? "bg-[rgba(58,186,122,0.1)] border-[rgba(58,186,122,0.3)]"
                  : "bg-[rgba(196,64,64,0.1)] border-[rgba(196,64,64,0.3)]"
              }`}
            >
              {status === "won" ? (
                <>
                  <p className="text-lg font-bold text-[var(--green)]">
                    Mandou bem! +{score} pts 🎉
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Em {guesses.length} tentativa{guesses.length === 1 ? "" : "s"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-[var(--red)]">Não foi dessa vez 😕</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    A palavra era{" "}
                    <span className="font-bold text-[var(--gold)] tracking-widest">{answer}</span>
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => { setShowResult(true); loadLeaderboard(); }}
              className="text-sm text-[var(--gold)] underline underline-offset-2"
            >
              Ver placar do dia
            </button>
          </div>
        )}
      </div>

      {/* Modal resultado */}
      {showResult && (
        <>
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
            onClick={() => setShowResult(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-bold text-[var(--gold)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {status === "won" ? "Arrasou! 🟩" : "Resultado de hoje"}
              </h2>
              <button
                onClick={() => setShowResult(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            </div>

            <button
              onClick={handleShare}
              className="w-full mb-4 py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] transition-all"
            >
              📋 {shareLabel}
            </button>

            <p className="text-xs text-[var(--text-muted)] mb-3">Placar do dia</p>
            <LetrosoLeaderboard
              entries={leaderboard}
              meId={user?.id}
            />
          </div>
        </>
      )}
    </div>
  );
}
