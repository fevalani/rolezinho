import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  WORD_LENGTH,
  MAX_ATTEMPTS,
  getWordOfDay,
  getGameDate,
  normalize,
  isValidWord,
  isPlausibleWord,
  addRuntimeWords,
  scoreGuess,
  aggregateKeyStatuses,
  pointsFor,
  buildShareText,
} from "./letrecoLogic";
import {
  getTodayGame,
  saveGame,
  getDailyLeaderboard,
  getOverallLeaderboard,
  getUserStats,
  getApprovedWords,
  verifyWordInDictionary,
  suggestWord,
} from "./letrecoService";
import type {
  GameStatus,
  LetterStatus,
  LeaderboardEntry,
  OverallEntry,
  LetrecoStats,
} from "./letrecoTypes";

// ─── Teclado ──────────────────────────────────────────────────

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

// Caractere "sentinela" mantido no input oculto: digitar acrescenta letras
// depois dele e o backspace o remove — assim detectamos a tecla de apagar de
// forma confiável mesmo nos teclados nativos do celular (que nem sempre
// disparam keydown com o input vazio).
const INPUT_SENTINEL = ".";

// ─── Cores dos tiles ──────────────────────────────────────────

function tileClasses(status: LetterStatus | "empty" | "filled"): string {
  switch (status) {
    case "correct":
      return "bg-[var(--green)] border-[var(--green)] text-white";
    case "present":
      return "bg-[var(--gold)] border-[var(--gold)] text-[var(--bg-abyss)]";
    case "absent":
      return "bg-[var(--bg-elevated)] border-[var(--bg-elevated)] text-[var(--text-secondary)]";
    case "filled":
      return "bg-transparent border-[rgba(201,165,90,0.45)] text-[var(--text-primary)]";
    default:
      return "bg-transparent border-[rgba(255,255,255,0.1)] text-[var(--text-primary)]";
  }
}

function keyClasses(status: LetterStatus | undefined): string {
  switch (status) {
    case "correct":
      return "bg-[var(--green)] text-white border-[var(--green)]";
    case "present":
      return "bg-[var(--gold)] text-[var(--bg-abyss)] border-[var(--gold)]";
    case "absent":
      return "bg-[var(--bg-deep)] text-[var(--text-muted)] border-[rgba(255,255,255,0.04)]";
    default:
      return "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[rgba(255,255,255,0.08)]";
  }
}

// ─── Grade ────────────────────────────────────────────────────

function Grid({
  guesses,
  cells: current,
  cursor,
  active,
  answer,
  shake,
  onCellClick,
}: {
  guesses: string[];
  cells: string[];
  cursor: number;
  active: boolean;
  answer: string;
  shake: boolean;
  onCellClick: (index: number) => void;
}) {
  const rows = [];
  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const submitted = guesses[r];
    const isCurrent = r === guesses.length;
    const editable = isCurrent && active;

    const statuses = submitted ? scoreGuess(submitted, answer) : null;

    const cellEls = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      let letter = "";
      let cls = tileClasses("empty");
      let extra = "";
      const isCursor = editable && c === cursor;

      if (submitted) {
        letter = submitted[c] ?? "";
        cls = tileClasses(statuses![c]);
        extra = "letreco-flip";
      } else if (isCurrent) {
        letter = current[c] ?? "";
        cls = letter ? tileClasses("filled") : tileClasses("empty");
        // o cursor tem prioridade visual sobre o "pop" ao digitar
        if (isCursor) extra = "letreco-cursor";
        else if (letter && active) extra = "letreco-pop";
      }

      cellEls.push(
        <div
          key={c}
          onClick={editable ? () => onCellClick(c) : undefined}
          className={`flex items-center justify-center aspect-square rounded-md border-2 text-2xl font-bold uppercase select-none ${cls} ${extra} ${
            editable ? "cursor-pointer" : ""
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
        className={`grid grid-cols-5 gap-1.5 ${isCurrent && shake ? "anim-shake" : ""}`}
      >
        {cellEls}
      </div>,
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[320px] mx-auto">
      {rows}
    </div>
  );
}

// ─── Teclado virtual ──────────────────────────────────────────

function Keyboard({
  keyStatuses,
  onKey,
  disabled,
}: {
  keyStatuses: Record<string, LetterStatus>;
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
                // não rouba o foco do input oculto → mantém o teclado nativo aberto
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

// ─── Estatísticas ─────────────────────────────────────────────

function StatsView({ stats }: { stats: LetrecoStats }) {
  const maxDist = Math.max(1, ...stats.distribution);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Jogos", value: stats.played },
          { label: "Vitórias", value: `${stats.winRate}%` },
          { label: "Sequência", value: stats.currentStreak },
          { label: "Recorde", value: stats.maxStreak },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-xl font-bold text-[var(--gold)]">{s.value}</p>
            <p className="text-[0.6rem] text-[var(--text-muted)] uppercase tracking-wide">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
          Distribuição de acertos
        </p>
        <div className="flex flex-col gap-1.5">
          {stats.distribution.map((count, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-3">
                {i + 1}
              </span>
              <div className="flex-1 bg-[var(--bg-elevated)] rounded h-5 overflow-hidden">
                <div
                  className="h-full bg-[var(--gold-dark)] flex items-center justify-end px-2 rounded transition-all"
                  style={{
                    width: `${(count / maxDist) * 100}%`,
                    minWidth: count > 0 ? 24 : 0,
                  }}
                >
                  {count > 0 && (
                    <span className="text-[0.65rem] font-bold text-[var(--bg-abyss)]">
                      {count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-[var(--text-muted)]">
        Total acumulado:{" "}
        <span className="text-[var(--gold)] font-bold">
          {stats.totalScore} pts
        </span>
      </p>
    </div>
  );
}

// ─── Ranking do dia ───────────────────────────────────────────

function Leaderboard({
  entries,
  meId,
}: {
  entries: LeaderboardEntry[];
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
                  ? `Acertou em ${e.attempts}/${MAX_ATTEMPTS}`
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

// ─── Página ───────────────────────────────────────────────────

type Tab = "ranking" | "stats";

export function LetrecoPage() {
  const { user } = useAuth();
  // Estáveis durante a sessão (mudam só na virada do dia)
  const answer = useMemo(() => getWordOfDay(), []);
  const gameDate = useMemo(() => getGameDate(), []);

  const [guesses, setGuesses] = useState<string[]>([]);
  // Linha em edição: 5 células (cada "" ou uma letra) + posição do cursor
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
  const [showOverall, setShowOverall] = useState(false);
  const [tab, setTab] = useState<Tab>("ranking");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [overall, setOverall] = useState<OverallEntry[] | null>(null);
  const [stats, setStats] = useState<LetrecoStats | null>(null);
  const [shareLabel, setShareLabel] = useState("Compartilhar resultado");
  // Palpite recusado que *parece* palavra → oferece adicionar ao dicionário
  const [suggestable, setSuggestable] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Input oculto que abre o teclado nativo ao selecionar uma célula
  const inputRef = useRef<HTMLInputElement>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // Mostra o botão "adicionar palavra" por alguns segundos e some sozinho.
  const offerSuggestion = useCallback((word: string) => {
    setSuggestable(word);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => setSuggestable(null), 6000);
  }, []);

  const clearSuggestion = useCallback(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    setSuggestable(null);
  }, []);

  const keyStatuses = aggregateKeyStatuses(guesses, answer);

  // Carrega palavras aprovadas pela turma e mescla ao dicionário de validação.
  useEffect(() => {
    let active = true;
    (async () => {
      const words = await getApprovedWords();
      if (active && words.length > 0) addRuntimeWords(words);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Limpa timers ao desmontar
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    },
    [],
  );

  const loadResultData = useCallback(async () => {
    if (!user) return;
    const [lb, st] = await Promise.all([
      getDailyLeaderboard(gameDate),
      getUserStats(user.id),
    ]);
    setLeaderboard(lb);
    setStats(st);
  }, [user, gameDate]);

  const openOverall = useCallback(async () => {
    setShowOverall(true);
    setOverall(null);
    const lb = await getOverallLeaderboard();
    setOverall(lb);
  }, []);

  // Carrega a partida do dia
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const game = await getTodayGame(user.id, gameDate);
      if (!active) return;
      if (game) {
        setGuesses(game.guesses);
        setStatus(game.status);
        setScore(game.score);
        if (game.status !== "playing") {
          setShowResult(true);
          loadResultData();
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, gameDate, loadResultData]);

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
      // Se o palpite parece uma palavra real, oferece adicioná-la ao dicionário
      const candidate = normalize(word);
      if (isPlausibleWord(candidate)) offerSuggestion(candidate);
      return;
    }

    const guess = normalize(word);
    const newGuesses = [...guesses, guess];
    const won = guess === answer;
    const lost = !won && newGuesses.length >= MAX_ATTEMPTS;
    const newStatus: GameStatus = won ? "won" : lost ? "lost" : "playing";
    const newScore = won ? pointsFor(newGuesses.length) : 0;

    setGuesses(newGuesses);
    setCells(new Array(WORD_LENGTH).fill(""));
    setCursor(0);
    setStatus(newStatus);
    setScore(newScore);

    await saveGame(user.id, gameDate, {
      guesses: newGuesses,
      status: newStatus,
      attempts: newGuesses.length,
      score: newScore,
    });

    if (newStatus !== "playing") {
      // espera o flip da última linha antes de mostrar o resultado
      setTimeout(() => {
        setShowResult(true);
        loadResultData();
      }, 900);
    }
  }, [
    user,
    status,
    cells,
    guesses,
    answer,
    gameDate,
    flashToast,
    loadResultData,
    offerSuggestion,
  ]);

  // Valida a palavra numa API pública e, existindo, grava no dicionário da turma.
  const handleSuggestWord = useCallback(async () => {
    if (!user || !suggestable || suggesting) return;
    const word = suggestable;
    setSuggesting(true);
    const exists = await verifyWordInDictionary(word);
    if (!exists) {
      flashToast("Não encontrei essa palavra no dicionário 🤔");
      setSuggesting(false);
      clearSuggestion();
      return;
    }
    const { error } = await suggestWord(user.id, word);
    if (error) {
      flashToast("Não consegui salvar agora 😕");
    } else {
      addRuntimeWords([word]);
      flashToast("Palavra adicionada! Pode usar ✅");
    }
    setSuggesting(false);
    clearSuggestion();
  }, [user, suggestable, suggesting, flashToast, clearSuggestion]);

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
            // limpa a célula atual, mantendo o cursor onde está
            next[cursor] = "";
          } else if (cursor > 0) {
            // célula vazia → apaga a anterior e recua o cursor
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
        // avança o cursor para a próxima célula (até a última)
        setCursor((c) => Math.min(c + 1, WORD_LENGTH - 1));
      }
    },
    [status, cursor, submitGuess],
  );

  // Recoloca a sentinela e o cursor no fim do input oculto
  const resetInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = INPUT_SENTINEL;
    el.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
  }, []);

  // Clicar numa célula seleciona o cursor e abre o teclado nativo
  const handleCellClick = useCallback(
    (index: number) => {
      setCursor(index);
      const el = inputRef.current;
      if (el) {
        el.value = INPUT_SENTINEL;
        // .focus() dentro do gesto do toque é o que faz o teclado nativo subir
        el.focus({ preventScroll: true });
        el.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
      }
    },
    [],
  );

  // Entrada vinda do teclado NATIVO (mobile) através do input oculto.
  // Comparamos o valor com a sentinela: letras acrescentadas → digita;
  // sentinela removida → backspace.
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

  // Enter e setas não alteram o valor do input → tratados no keydown dele
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
      // Backspace/letras seguem para o onInput (via sentinela)
    },
    [handleKey],
  );

  // Teclado físico (web). Ignora quando o input oculto está focado — nesse
  // caso os handlers do próprio input cuidam da digitação (evita duplicar).
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
    const text = buildShareText(guesses, answer, status === "won", gameDate);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
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
      <div className="flex items-center justify-center pt-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-[var(--bg-abyss)] flex flex-col"
      style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Letreco 🟩
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Palavra do dia · {gameDate.split("-").reverse().join("/")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openOverall}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
          >
            🏆 Ranking
          </button>
          {status !== "playing" && (
            <button
              onClick={() => {
                setShowResult(true);
                loadResultData();
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
            >
              📊 Resultado
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.1)] text-sm font-semibold text-[var(--text-primary)] shadow-lg anim-fade">
          {toast}
        </div>
      )}

      {/* Input que abre o teclado nativo ao clicar numa célula.
          IMPORTANTE: o WebView do Android só sobe o IME para um input
          "de verdade" — focável e com área real. Por isso NÃO usamos
          aria-hidden / tabIndex=-1 / pointer-events-none / tamanho 1px
          (qualquer um deles faz o Chromium tratar o campo como invisível
          e suprimir o teclado). Ele fica invisível por opacity-0 e atrás
          do fundo da página (-z-10), sem atrapalhar o toque nas células;
          fontSize 16px evita o zoom automático ao focar. */}
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
      <div className="flex-1 flex flex-col gap-6 px-4 py-4">
        <Grid
          guesses={guesses}
          cells={cells}
          cursor={cursor}
          active={status === "playing"}
          answer={answer}
          shake={shake}
          onCellClick={handleCellClick}
        />

        {/* Palpite recusado que parece palavra → oferece adicionar ao dicionário */}
        {status === "playing" && suggestable && (
          <div className="flex items-center justify-center gap-2 -mt-2 anim-fade">
            <span className="text-xs text-[var(--text-muted)]">
              <span className="font-bold text-[var(--text-secondary)] tracking-widest">
                {suggestable}
              </span>{" "}
              não está na lista
            </span>
            <button
              onClick={handleSuggestWord}
              disabled={suggesting}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.35)] hover:bg-[rgba(201,165,90,0.25)] transition-all active:scale-95 disabled:opacity-60"
            >
              {suggesting ? "Verificando…" : "+ Adicionar palavra"}
            </button>
          </div>
        )}

        {status === "playing" ? (
          <Keyboard
            keyStatuses={keyStatuses}
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
                    Acertou! +{score} pts 🎉
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Em {guesses.length} de {MAX_ATTEMPTS} tentativas
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
            <button
              onClick={() => {
                setShowResult(true);
                loadResultData();
              }}
              className="text-sm text-[var(--gold)] underline underline-offset-2"
            >
              Ver placar do dia
            </button>
          </div>
        )}
      </div>

      {/* Modal de resultado */}
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
                {status === "won" ? "Mandou bem! 🟩" : "Resultado de hoje"}
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

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {(
                [
                  { id: "ranking", label: "Placar do dia" },
                  { id: "stats", label: "Minhas stats" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    tab === t.id
                      ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)] text-[var(--gold)]"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-secondary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "ranking" ? (
              <Leaderboard entries={leaderboard} meId={user?.id} />
            ) : stats ? (
              <StatsView stats={stats} />
            ) : (
              <div className="flex justify-center py-6">
                <div className="spinner" />
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de ranking geral (acumulado) */}
      {showOverall && (
        <>
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
            onClick={() => setShowOverall(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2
                className="text-lg font-bold text-[var(--gold)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Ranking geral 🏆
              </h2>
              <button
                onClick={() => setShowOverall(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Pontuação acumulada de todos os dias
            </p>

            {overall ? (
              <OverallLeaderboard entries={overall} meId={user?.id} />
            ) : (
              <div className="flex justify-center py-6">
                <div className="spinner" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
