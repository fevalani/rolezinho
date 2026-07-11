import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  WORD_LENGTH,
  WORD500_MAX_ATTEMPTS,
  getWord500WordOfDay,
  getWord500GameDate,
  normalize,
  isValidWord,
  scoreGuessCounts,
  word500PointsFor,
  buildWord500ShareText,
} from "./word500Logic";
import {
  getWord500TodayGame,
  getWord500DailyLeaderboard,
} from "./word500Service";
import type { GameStatus, Word500LeaderboardEntry } from "./word500Types";

const INPUT_SENTINEL = ".";

const MARK_CYCLE: (CellMark | undefined)[] = [
  undefined,
  "green",
  "yellow",
  "red",
];

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

// ─── Grade ────────────────────────────────────────────────────────

/** Marcação pessoal do jogador numa letra já enviada — não vem do jogo,
 * é só uma anotação visual pra ajudar a lembrar a dedução (verde/amarelo/
 * vermelho), ciclada por clique. */
export type CellMark = "green" | "yellow" | "red";

function tileClasses(kind: "empty" | "filled" | "submitted"): string {
  switch (kind) {
    case "submitted":
      return "bg-[var(--bg-elevated)] border-[var(--bg-elevated)] text-[var(--text-primary)]";
    case "filled":
      return "bg-transparent border-[rgba(201,165,90,0.45)] text-[var(--text-primary)]";
    default:
      return "bg-transparent border-[rgba(255,255,255,0.1)] text-[var(--text-primary)]";
  }
}

function markClasses(mark: CellMark | undefined): string {
  switch (mark) {
    case "green":
      return "bg-[var(--green)] border-[var(--green)] text-white";
    case "yellow":
      return "bg-[var(--gold)] border-[var(--gold)] text-[var(--bg-abyss)]";
    case "red":
      return "bg-[var(--red)] border-[var(--red)] text-white";
    default:
      return tileClasses("submitted");
  }
}

function Word500Grid({
  guesses,
  answer,
  cells,
  cursor,
  active,
  shake,
  marks,
  onCellClick,
  onMarkCell,
}: {
  guesses: string[];
  answer: string;
  cells: string[];
  cursor: number;
  active: boolean;
  shake: boolean;
  marks: Record<string, CellMark>;
  onCellClick: (index: number) => void;
  onMarkCell: (row: number, col: number) => void;
}) {
  const rows = [];
  for (let r = 0; r < WORD500_MAX_ATTEMPTS; r++) {
    const submitted = guesses[r];
    const isCurrent = r === guesses.length;
    const editable = isCurrent && active;
    const counts = submitted ? scoreGuessCounts(submitted, answer) : null;

    const cellEls = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      let letter = "";
      let cls = tileClasses("empty");
      let extra = "";
      const isCursor = editable && c === cursor;

      if (submitted) {
        letter = submitted[c] ?? "";
        cls = markClasses(marks[`${r}-${c}`]);
        extra = "letreco-flip";
      } else if (isCurrent) {
        letter = cells[c] ?? "";
        cls = letter ? tileClasses("filled") : tileClasses("empty");
        if (isCursor) extra = "letreco-cursor";
        else if (letter && active) extra = "letreco-pop";
      }

      cellEls.push(
        <div
          key={c}
          onClick={
            submitted
              ? () => onMarkCell(r, c)
              : editable
                ? () => onCellClick(c)
                : undefined
          }
          className={`flex items-center justify-center aspect-square w-8 h-8 rounded-md border-2 text-lg font-bold uppercase select-none ${cls} ${extra} ${
            editable || submitted ? "cursor-pointer" : ""
          }`}
          style={
            extra === "letreco-flip"
              ? { animationDelay: `${c * 0.12}s` }
              : undefined
          }
        >
          {letter}
        </div>,
      );
    }

    rows.push(
      <div
        key={r}
        className={`flex items-center justify-center gap-3 ${isCurrent && shake ? "anim-shake" : ""}`}
      >
        <div className="flex gap-1.5">{cellEls}</div>
        <div className="flex flex-row gap-1 items-start gap-0.5 text-xs font-bold tabular-nums w-14 shrink-0">
          {counts && (
            <>
              <span className="bg-[var(--green)] px-2 py-1 rounded-[4px] text-white text-sm">
                {counts.green}
              </span>
              <span className="bg-[var(--gold)] px-2 py-1 rounded-[4px] text-white text-sm">
                {counts.yellow}
              </span>
              <span className="bg-[var(--red)] px-2 py-1 rounded-[4px] text-white text-sm">
                {counts.red}
              </span>
            </>
          )}
        </div>
      </div>,
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[320px] mx-auto">
      {rows}
    </div>
  );
}

// ─── Teclado (só marca letras eliminadas — sem verde/amarelo por letra) ──

function keyClasses(eliminated: boolean): string {
  return eliminated
    ? "bg-[var(--bg-deep)] text-[var(--text-muted)] border-[rgba(255,255,255,0.04)]"
    : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[rgba(255,255,255,0.08)]";
}

function Keyboard({
  eliminated,
  onKey,
  disabled,
}: {
  eliminated: Set<string>;
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
                } ${keyClasses(eliminated.has(k))}`}
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

// ─── Legenda das regras ───────────────────────────────────────────

function RulesLegend() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-xs space-y-1.5">
      <p className="font-semibold text-[var(--text-secondary)] text-[0.65rem] uppercase tracking-wide mb-2">
        Como funciona o feedback
      </p>
      <p className="text-[var(--text-muted)]">
        Ao contrário do Wordle, as letras da sua tentativa{" "}
        <strong>não mudam de cor</strong>. Cada linha só mostra 3 contagens:
      </p>
      <div className="flex items-center gap-2">
        <span>🟩</span>
        <span className="text-[var(--text-muted)]">
          Quantas letras estão certas na posição certa
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span>🟨</span>
        <span className="text-[var(--text-muted)]">
          Quantas letras existem na palavra, mas na posição errada
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span>🟥</span>
        <span className="text-[var(--text-muted)]">
          Quantas letras não pertencem à palavra
        </span>
      </div>
      <p className="text-[var(--text-muted)] pt-1">
        Cruze as contagens entre as tentativas para deduzir a palavra. O jogo não
        revela sozinho nenhuma letra — quem decide é você.
      </p>
      <p className="text-[var(--text-muted)] pt-1">
        Toque numa letra de uma tentativa já enviada pra marcar sua própria
        dedução: cicla entre neutro → 🟩 → 🟨 → 🟥. É só um lembrete visual seu,
        o jogo não confirma nem corrige essas marcações — mas assim que você
        marcar alguma ocorrência de vermelho, aquela letra fica cinza no
        teclado também.
      </p>
    </div>
  );
}

// ─── Leaderboard do dia ───────────────────────────────────────────

function Word500Leaderboard({
  entries,
  meId,
}: {
  entries: Word500LeaderboardEntry[];
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
                  ? `Acertou em ${e.attempts}/${WORD500_MAX_ATTEMPTS}`
                  : "Não acertou"}
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

// ─── Componente principal ─────────────────────────────────────────

export function Word500Game() {
  const { user } = useAuth();
  const answer = useMemo(() => getWord500WordOfDay(), []);
  const gameDate = useMemo(() => getWord500GameDate(), []);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [cells, setCells] = useState<string[]>(() =>
    new Array(WORD_LENGTH).fill(""),
  );
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Word500LeaderboardEntry[]>([]);
  const [shareLabel, setShareLabel] = useState("Compartilhar resultado");
  // Marcação pessoal (verde/amarelo/vermelho) nas letras já enviadas — só de
  // sessão, não persiste no Supabase (mesmo padrão das anotações do Sudoku).
  const [marks, setMarks] = useState<Record<string, CellMark>>({});

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

  // O teclado só cinza uma letra quando o PRÓPRIO jogador marca alguma
  // ocorrência dela de vermelho no tabuleiro — nunca automaticamente (o jogo
  // não revela elimination, só as contagens G/Y/R por linha).
  const eliminated = useMemo(() => {
    const set = new Set<string>();
    for (const [key, mark] of Object.entries(marks)) {
      if (mark !== "red") continue;
      const [row, col] = key.split("-").map(Number);
      const letter = guesses[row]?.[col];
      if (letter) set.add(letter);
    }
    return set;
  }, [marks, guesses]);

  const loadLeaderboard = useCallback(async () => {
    const lb = await getWord500DailyLeaderboard(gameDate);
    setLeaderboard(lb);
  }, [gameDate]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const game = await getWord500TodayGame(user.id, gameDate);
      if (!active) return;
      if (game) {
        setGuesses(game.guesses);
        setStatus(game.status);
        setScore(game.score);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, gameDate]);

  const submitGuess = useCallback(async () => {
    if (!user || status !== "playing") return;
    const word = cells.join("");
    if (word.length !== WORD_LENGTH || cells.some((ch) => !ch)) {
      setShake(true);
      flashToast("Faltam letras");
      setTimeout(() => setShake(false), 450);
      return;
    }
    if (!isValidWord(word)) {
      setShake(true);
      flashToast("Palavra não está na lista");
      setTimeout(() => setShake(false), 450);
      return;
    }

    const guess = normalize(word);
    const newGuesses = [...guesses, guess];
    const won = guess === answer;
    const lost = !won && newGuesses.length >= WORD500_MAX_ATTEMPTS;
    const newStatus: GameStatus = won ? "won" : lost ? "lost" : "playing";
    const newScore = won ? word500PointsFor(newGuesses.length) : 0;

    // Quando a contagem só deixa uma cor possível pra linha inteira (acerto
    // total, nenhuma letra em comum, ou anagrama sem nenhuma posição certa),
    // preenche a marcação sozinho — não faz sentido pedir pro jogador clicar
    // 5x pra chegar numa dedução que o próprio placar já entrega.
    const rowCounts = scoreGuessCounts(guess, answer);
    const rowIndex = newGuesses.length - 1;
    const autoMark: CellMark | null =
      rowCounts.green === WORD_LENGTH
        ? "green"
        : rowCounts.red === WORD_LENGTH
          ? "red"
          : rowCounts.yellow === WORD_LENGTH
            ? "yellow"
            : null;
    if (autoMark) {
      setMarks((prev) => {
        const next = { ...prev };
        for (let c = 0; c < WORD_LENGTH; c++) next[`${rowIndex}-${c}`] = autoMark;
        return next;
      });
    }

    setGuesses(newGuesses);
    setCells(new Array(WORD_LENGTH).fill(""));
    setCursor(0);
    setStatus(newStatus);
    setScore(newScore);

    // Modo teste (temporário): Word500 ainda não persiste no Supabase, de
    // propósito, pra dar pra jogar várias vezes por dia sem contar pro
    // ranking. Reativar `saveWord500Game` quando o jogo sair da fase de testes.

    if (newStatus !== "playing") {
      setTimeout(() => {
        setShowResult(true);
        loadLeaderboard();
      }, 900);
    }
  }, [user, status, cells, guesses, answer, flashToast, loadLeaderboard]);

  // Modo teste (temporário): reinicia a partida do zero pra jogar de novo no
  // mesmo dia — não salva nada, então nunca conta pro ranking.
  const resetGame = useCallback(() => {
    setGuesses([]);
    setCells(new Array(WORD_LENGTH).fill(""));
    setCursor(0);
    setStatus("playing");
    setScore(0);
    setMarks({});
    setShowResult(false);
  }, []);

  const cycleMark = useCallback((row: number, col: number) => {
    const key = `${row}-${col}`;
    setMarks((prev) => {
      const idx = MARK_CYCLE.indexOf(prev[key]);
      const next = MARK_CYCLE[(idx + 1) % MARK_CYCLE.length];
      const copy = { ...prev };
      if (next) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  }, []);

  const handleKey = useCallback(
    (k: string) => {
      if (status !== "playing") return;
      if (k === "ENTER") {
        submitGuess();
      } else if (k === "LEFT") {
        setCursor((c) => Math.max(0, c - 1));
      } else if (k === "RIGHT") {
        setCursor((c) => Math.min(WORD_LENGTH - 1, c + 1));
      } else if (k === "BACK") {
        setCells((prev) => {
          const next = [...prev];
          if (next[cursor]) {
            next[cursor] = "";
          } else if (cursor > 0) {
            next[cursor - 1] = "";
            setCursor(cursor - 1);
          }
          return next;
        });
      } else if (/^[A-Z]$/.test(k)) {
        setCells((prev) => {
          const next = [...prev];
          next[cursor] = k;
          return next;
        });
        setCursor((c) => Math.min(c + 1, WORD_LENGTH - 1));
      }
    },
    [status, cursor, submitGuess],
  );

  const resetInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = INPUT_SENTINEL;
    el.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
  }, []);

  const handleCellClick = useCallback((index: number) => {
    setCursor(index);
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
      if (e.key === "Enter") {
        handleKey("ENTER");
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        handleKey("LEFT");
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        handleKey("RIGHT");
        e.preventDefault();
      }
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
      else if (key === "ArrowLeft") handleKey("LEFT");
      else if (key === "ArrowRight") handleKey("RIGHT");
      else if (/^[a-zA-Z]$/.test(key)) handleKey(key.toUpperCase());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const handleShare = async () => {
    const text = buildWord500ShareText(
      guesses,
      answer,
      status === "won",
      gameDate,
    );
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShareLabel("Copiado! ✓");
        setTimeout(() => setShareLabel("Compartilhar resultado"), 2000);
      }
    } catch {
      /* usuário cancelou o compartilhamento */
    }
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
            5 letras · {WORD500_MAX_ATTEMPTS} tentativas · só contagens
          </p>
          <p className="text-[0.6rem] text-[var(--gold)] opacity-80 mt-0.5">
            🧪 Modo teste — pode jogar quantas vezes quiser, não conta pro ranking
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRules((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.08)] transition-all"
          >
            ℹ️ Regras
          </button>
          <button
            onClick={resetGame}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
          >
            🔁 Nova partida
          </button>
          {status !== "playing" && (
            <button
              onClick={() => {
                setShowResult(true);
                loadLeaderboard();
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
            >
              📊 Resultado
            </button>
          )}
        </div>
      </div>

      {showRules && (
        <div className="px-4 mb-3">
          <RulesLegend />
        </div>
      )}

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

      <div className="flex-1 flex flex-col gap-5 px-4 py-2">
        <Word500Grid
          guesses={guesses}
          answer={answer}
          cells={cells}
          cursor={cursor}
          active={status === "playing"}
          shake={shake}
          marks={marks}
          onCellClick={handleCellClick}
          onMarkCell={cycleMark}
        />

        {status === "playing" ? (
          <Keyboard
            eliminated={eliminated}
            onKey={handleKey}
            disabled={false}
          />
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
                    Mandou bem! +{score} pts 🎯
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Em {guesses.length} tentativa
                    {guesses.length === 1 ? "" : "s"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-[var(--red)]">
                    Não foi dessa vez 😕
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    A palavra era{" "}
                    <span className="font-bold text-[var(--gold)] tracking-widest">
                      {answer}
                    </span>
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setShowResult(true);
                  loadLeaderboard();
                }}
                className="text-sm text-[var(--gold)] underline underline-offset-2"
              >
                Ver placar do dia
              </button>
              <button
                onClick={resetGame}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
              >
                🔁 Jogar de novo
              </button>
            </div>
          </div>
        )}
      </div>

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
                {status === "won" ? "Na mosca! 🎯" : "Resultado de hoje"}
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

            <p className="text-xs text-[var(--text-muted)] mb-3">
              Placar do dia
            </p>
            <Word500Leaderboard entries={leaderboard} meId={user?.id} />
          </div>
        </>
      )}
    </div>
  );
}
