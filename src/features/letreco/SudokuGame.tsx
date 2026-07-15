import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  getSudokuOfDay,
  getSudokuPracticePuzzle,
  getSudokuGameDate,
  isGivenCell,
  isBoardComplete,
  applyGuess,
  sudokuPointsFor,
  formatElapsed,
  buildSudokuShareText,
  getPeers,
  findConflictingPeers,
  isDigitComplete,
  SUDOKU_DIFFICULTIES,
  SUDOKU_DIFFICULTY_ORDER,
} from "./sudokuLogic";
import {
  getSudokuTodayGame,
  saveSudokuGame,
  getSudokuDailyLeaderboard,
} from "./sudokuService";
import type {
  GameStatus,
  SudokuDifficulty,
  SudokuLeaderboardEntry,
} from "./sudokuTypes";

// ─── Leaderboard do dia ────────────────────────────────────────────

function SudokuLeaderboard({
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

// ─── Regras ─────────────────────────────────────────────────────────

function SudokuRules() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-xs space-y-1.5">
      <p className="font-semibold text-[var(--text-secondary)] text-[0.65rem] uppercase tracking-wide mb-2">
        Como pontua
      </p>
      <p className="text-[var(--text-muted)]">
        Sem limite de tempo nem de tentativas — mas cada erro e cada minuto
        corrido custam pontos. Número errado pisca vermelho e some, tenta de
        novo.
      </p>
      <p className="text-[var(--text-muted)]">
        Começa com 1000 pts, -20 por minuto corrido, -40 por erro (mínimo 50 pts
        pra quem termina) — depois multiplica pela dificuldade escolhida.
      </p>
      <p className="text-[var(--text-muted)]">
        ✏️ <strong className="text-[var(--text-secondary)]">Rascunho</strong>:
        liga o modo de anotar candidatos numa célula sem marcar valor definitivo
        — não conta como erro nem preenche a célula.
      </p>
    </div>
  );
}

// ─── Seletor de dificuldade ─────────────────────────────────────────

function DifficultyPicker({
  gameDate,
  onPick,
}: {
  gameDate: string;
  onPick: (d: SudokuDifficulty) => void;
}) {
  return (
    <div className="flex flex-col px-4 py-6 gap-4 max-w-[420px] mx-auto w-full">
      <div>
        <p className="text-xs text-[var(--text-muted)]">
          Sudoku do dia · {gameDate.split("-").reverse().join("/")}
        </p>
        <h2
          className="text-lg font-bold text-[var(--gold)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Escolha a dificuldade
        </h2>
        <p className="text-[0.7rem] text-[var(--text-muted)] mt-1">
          Vale pro dia inteiro — só muda amanhã.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {SUDOKU_DIFFICULTY_ORDER.map((diff) => {
          const cfg = SUDOKU_DIFFICULTIES[diff];
          return (
            <button
              key={diff}
              onClick={() => onPick(diff)}
              className="text-left px-4 py-3 rounded-xl border bg-[var(--bg-card)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(201,165,90,0.4)] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)]">
                  {cfg.label}
                </span>
                <span className="text-xs font-bold text-[var(--gold)]">
                  ×{cfg.scoreMultiplier.toFixed(2).replace(/\.?0+$/, "")}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {cfg.clues} pistas no tabuleiro
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────

export function SudokuGame() {
  const { user } = useAuth();
  const gameDate = useMemo(() => getSudokuGameDate(), []);

  const [difficulty, setDifficulty] = useState<SudokuDifficulty | null>(null);
  const [puzzle, setPuzzle] = useState("");
  const [solution, setSolution] = useState("");
  const [board, setBoard] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [score, setScore] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [flashConflicts, setFlashConflicts] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [pencilMode, setPencilMode] = useState(false);
  const [notesBlockMode, setNotesBlockMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [leaderboard, setLeaderboard] = useState<SudokuLeaderboardEntry[]>([]);
  const [shareLabel, setShareLabel] = useState("Compartilhar resultado");

  // Modo ranqueado (persiste, 1 partida/dia) vs treino (efêmero, ilimitado,
  // puzzle diferente do ranqueado do dia dentro do mesmo pool da dificuldade
  // já escolhida — Sudoku não tem outro pool de puzzles no projeto).
  const [ranked, setRanked] = useState(true);
  const rankedSnapshot = useRef<{
    puzzle: string;
    solution: string;
    board: string;
    mistakes: number;
    status: GameStatus;
    score: number;
    elapsedSeconds: number;
    notes: Record<number, number[]>;
    startedAtIso: string;
    startedAtMs: number;
  } | null>(null);

  const startedAtIso = useRef<string>("");
  const startedAtMs = useRef<number>(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (conflictTimer.current) clearTimeout(conflictTimer.current);
    },
    [],
  );

  const loadLeaderboard = useCallback(async () => {
    const lb = await getSudokuDailyLeaderboard(gameDate);
    setLeaderboard(lb);
  }, [gameDate]);

  // Chave de armazenamento local do rascunho — sobrevive a reload, outra aba ou trocar de app
  const notesStorageKey = useMemo(
    () => (user ? `sudoku-notes:${user.id}:${gameDate}` : null),
    [user, gameDate],
  );

  // Carrega a partida do dia (se já escolheu dificuldade hoje)
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const game = await getSudokuTodayGame(user.id, gameDate);
      if (!active) return;
      if (game) {
        const { puzzle: p, solution: s } = getSudokuOfDay(game.difficulty);
        setDifficulty(game.difficulty);
        setPuzzle(p);
        setSolution(s);
        setBoard(game.board);
        setMistakes(game.mistakes);
        setStatus(game.status);
        setScore(game.score);
        startedAtIso.current = game.started_at;
        startedAtMs.current = Date.parse(game.started_at);
        if (game.status === "won") {
          setElapsedSeconds(game.elapsed_seconds);
        }
        try {
          const raw = localStorage.getItem(
            `sudoku-notes:${user.id}:${gameDate}`,
          );
          if (raw) setNotes(JSON.parse(raw));
        } catch {
          /* localStorage indisponível — segue sem rascunho salvo */
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, gameDate]);

  // Salva o rascunho a cada alteração, para não perder ao trocar de aba/app.
  // Só sincroniza no ranqueado — anotações do treino são efêmeras e não
  // podem sobrescrever o rascunho salvo da partida ranqueada do dia.
  useEffect(() => {
    if (!notesStorageKey || !difficulty || !ranked) return;
    try {
      if (Object.keys(notes).length === 0)
        localStorage.removeItem(notesStorageKey);
      else localStorage.setItem(notesStorageKey, JSON.stringify(notes));
    } catch {
      /* localStorage indisponível — rascunho fica só na sessão atual */
    }
  }, [notes, notesStorageKey, difficulty, ranked]);

  // Cronômetro (recalcula a partir de started_at — sobrevive a reload)
  useEffect(() => {
    if (loading || status !== "playing" || !difficulty) return;
    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loading, status, difficulty]);

  const startNewGame = useCallback(
    (diff: SudokuDifficulty) => {
      const { puzzle: p, solution: s } = getSudokuOfDay(diff);
      const iso = new Date().toISOString();
      startedAtIso.current = iso;
      startedAtMs.current = Date.now();

      setDifficulty(diff);
      setPuzzle(p);
      setSolution(s);
      setBoard(p);
      setMistakes(0);
      setStatus("playing");
      setScore(0);
      setElapsedSeconds(0);
      setNotes({});
      setSelected(null);

      if (user) {
        saveSudokuGame(user.id, gameDate, {
          difficulty: diff,
          board: p,
          mistakes: 0,
          elapsed_seconds: 0,
          status: "playing",
          score: 0,
          started_at: iso,
        });
      }
    },
    [user, gameDate],
  );

  const persist = useCallback(
    async (
      nextBoard: string,
      nextMistakes: number,
      nextStatus: GameStatus,
      nextScore: number,
    ) => {
      // Modo treino não persiste nem conta pro ranking — só o ranqueado grava.
      if (!user || !difficulty || !ranked) return;
      await saveSudokuGame(user.id, gameDate, {
        difficulty,
        board: nextBoard,
        mistakes: nextMistakes,
        elapsed_seconds:
          nextStatus === "won"
            ? Math.floor((Date.now() - startedAtMs.current) / 1000)
            : elapsedSeconds,
        status: nextStatus,
        score: nextScore,
        started_at: startedAtIso.current,
      });
    },
    [user, gameDate, elapsedSeconds, difficulty, ranked],
  );

  const startPracticeRound = useCallback(() => {
    if (!difficulty) return;
    const { puzzle: p, solution: s } = getSudokuPracticePuzzle(difficulty);
    startedAtIso.current = new Date().toISOString();
    startedAtMs.current = Date.now();
    setPuzzle(p);
    setSolution(s);
    setBoard(p);
    setMistakes(0);
    setStatus("playing");
    setScore(0);
    setElapsedSeconds(0);
    setNotes({});
    setSelected(null);
    setShowResult(false);
  }, [difficulty]);

  const toggleRanked = useCallback(() => {
    setRanked((wasRanked) => {
      if (wasRanked) {
        rankedSnapshot.current = {
          puzzle,
          solution,
          board,
          mistakes,
          status,
          score,
          elapsedSeconds,
          notes,
          startedAtIso: startedAtIso.current,
          startedAtMs: startedAtMs.current,
        };
        startPracticeRound();
      } else {
        const snap = rankedSnapshot.current;
        if (snap) {
          setPuzzle(snap.puzzle);
          setSolution(snap.solution);
          setBoard(snap.board);
          setMistakes(snap.mistakes);
          setStatus(snap.status);
          setScore(snap.score);
          setElapsedSeconds(snap.elapsedSeconds);
          setNotes(snap.notes);
          startedAtIso.current = snap.startedAtIso;
          startedAtMs.current = snap.startedAtMs;
        }
        setSelected(null);
        setShowResult(false);
      }
      return !wasRanked;
    });
  }, [
    puzzle,
    solution,
    board,
    mistakes,
    status,
    score,
    elapsedSeconds,
    notes,
    startPracticeRound,
  ]);

  const toggleNote = useCallback((cell: number, digit: number) => {
    setNotes((prev) => {
      const current = prev[cell] ?? [];
      const nextForCell = current.includes(digit)
        ? current.filter((d) => d !== digit)
        : [...current, digit].sort((a, b) => a - b);
      const next = { ...prev };
      if (nextForCell.length === 0) delete next[cell];
      else next[cell] = nextForCell;
      return next;
    });
  }, []);

  const clearNotes = useCallback((cell: number) => {
    setNotes((prev) => {
      if (!(cell in prev)) return prev;
      const next = { ...prev };
      delete next[cell];
      return next;
    });
  }, []);

  /** Remove o dígito das anotações de todas as células da mesma linha/coluna/bloco 3x3. */
  const clearDigitFromPeerNotes = useCallback((cell: number, digit: number) => {
    setNotes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const peer of getPeers(cell)) {
        const arr = next[peer];
        if (arr && arr.includes(digit)) {
          const filtered = arr.filter((d) => d !== digit);
          if (filtered.length === 0) delete next[peer];
          else next[peer] = filtered;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleNumber = useCallback(
    (digit: number) => {
      if (status !== "playing" || selected === null || !user || !difficulty)
        return;
      if (isGivenCell(puzzle, selected) || board[selected] !== "0") return;
      if (isDigitComplete(board, digit)) return;

      if (pencilMode) {
        const alreadyNoted = (notes[selected] ?? []).includes(digit);
        if (!alreadyNoted) {
          const conflicts = findConflictingPeers(board, selected, digit);
          if (conflicts.length > 0) {
            setFlashConflicts(conflicts);
            if (conflictTimer.current) clearTimeout(conflictTimer.current);
            conflictTimer.current = setTimeout(
              () => setFlashConflicts([]),
              450,
            );
            return;
          }
        }
        toggleNote(selected, digit);
        return;
      }

      const { board: nextBoard, correct } = applyGuess(
        board,
        solution,
        selected,
        digit,
      );

      if (!correct) {
        setFlashIndex(selected);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashIndex(null), 450);
        const nextMistakes = mistakes + 1;
        setMistakes(nextMistakes);
        persist(board, nextMistakes, "playing", 0);
        return;
      }

      setBoard(nextBoard);
      clearNotes(selected);
      clearDigitFromPeerNotes(selected, digit);

      if (isBoardComplete(nextBoard)) {
        const finalElapsed = Math.floor(
          (Date.now() - startedAtMs.current) / 1000,
        );
        const finalScore = sudokuPointsFor(finalElapsed, mistakes, difficulty);
        setElapsedSeconds(finalElapsed);
        setScore(finalScore);
        setStatus("won");
        persist(nextBoard, mistakes, "won", finalScore);
        // Modal de resultado/placar só faz sentido no ranqueado.
        if (ranked) {
          setTimeout(() => {
            setShowResult(true);
            loadLeaderboard();
          }, 500);
        }
      } else {
        persist(nextBoard, mistakes, "playing", 0);
        setSelected(null);
      }
    },
    [
      status,
      selected,
      user,
      difficulty,
      puzzle,
      board,
      solution,
      mistakes,
      persist,
      loadLeaderboard,
      pencilMode,
      notes,
      ranked,
      toggleNote,
      clearNotes,
      clearDigitFromPeerNotes,
    ],
  );

  const handleShare = async () => {
    const text = buildSudokuShareText(
      gameDate,
      difficulty ?? "medio",
      elapsedSeconds,
      mistakes,
      score,
    );
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
      <div className="flex items-center justify-center pt-16">
        <div className="spinner" />
      </div>
    );
  }

  if (!difficulty) {
    return <DifficultyPicker gameDate={gameDate} onPick={startNewGame} />;
  }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="px-4 pb-3 flex items-center justify-between relative">
        <div>
          <p className="text-xs text-[var(--text-muted)]">
            Sudoku do dia · {gameDate.split("-").reverse().join("/")} ·{" "}
            {SUDOKU_DIFFICULTIES[difficulty].label}
          </p>
          <p className="text-[0.65rem] text-[var(--text-muted)] opacity-60">
            ⏱️ {formatElapsed(elapsedSeconds)} · ❌ {mistakes} erro
            {mistakes === 1 ? "" : "s"}
          </p>
          {!ranked && (
            <p className="text-[0.6rem] text-[var(--gold)] opacity-80 mt-0.5">
              🎓 Modo treino — não conta pro ranking, pode jogar quantas vezes
              quiser
            </p>
          )}
        </div>
        <button
          onClick={() => setShowMenu((v) => !v)}
          aria-label="Mais opções"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-lg font-bold leading-none bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.08)] transition-all"
        >
          ⋯
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-4 top-full mt-1 z-50 w-56 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[var(--bg-elevated)] shadow-lg p-2 flex flex-col gap-1.5">
              <button
                onClick={() => {
                  setShowRules((v) => !v);
                  setShowMenu(false);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] transition-all"
              >
                ℹ️ Regras
              </button>

              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.04)]">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  {"Treino"}
                </span>
                <button
                  role="switch"
                  aria-checked={!ranked}
                  onClick={() => {
                    toggleRanked();
                    setShowMenu(false);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    ranked ? "bg-[rgba(255,255,255,0.15)]" : "bg-[var(--green)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      ranked ? "translate-x-0.5" : "translate-x-[1.375rem]"
                    }`}
                  />
                </button>
              </div>

              {!ranked && (
                <button
                  onClick={() => {
                    startPracticeRound();
                    setShowMenu(false);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(201,165,90,0.12)] text-[var(--gold)] transition-all"
                >
                  🔁 Novo puzzle
                </button>
              )}
              {ranked && status !== "playing" && (
                <button
                  onClick={() => {
                    setShowResult(true);
                    loadLeaderboard();
                    setShowMenu(false);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-left bg-[rgba(201,165,90,0.12)] text-[var(--gold)] transition-all"
                >
                  📊 Resultado
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showRules && (
        <div className="px-4 mb-3">
          <SudokuRules />
        </div>
      )}

      {/* Tabuleiro */}
      <div className="flex-1 flex flex-col gap-5 px-4 py-2">
        <div className="flex items-center justify-center gap-2.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            Alterar visualização do modo rascunho
          </span>
          <button
            role="switch"
            aria-checked={notesBlockMode}
            onClick={() => setNotesBlockMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
              notesBlockMode
                ? "bg-[var(--green)]"
                : "bg-[rgba(255,255,255,0.15)]"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                notesBlockMode ? "translate-x-[1.375rem]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div
          className="grid grid-cols-9 mx-auto border-2 border-[rgba(255,255,255,0.25)] rounded-md overflow-hidden"
          style={{ width: "min(100%, 360px)" }}
        >
          {Array.from({ length: 81 }, (_, i) => {
            const r = Math.floor(i / 9);
            const c = i % 9;
            const given = isGivenCell(puzzle, i);
            const value = board[i];
            const cellNotes = notes[i];
            const isSelected = selected === i;
            const selRow = selected !== null ? Math.floor(selected / 9) : null;
            const selCol = selected !== null ? selected % 9 : null;
            const selBox =
              selRow !== null && selCol !== null
                ? Math.floor(selRow / 3) * 3 + Math.floor(selCol / 3)
                : null;
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
                onClick={() => status === "playing" && setSelected(i)}
                disabled={status !== "playing"}
                className={`aspect-square flex items-center justify-center text-xl sm:text-2xl font-bold select-none transition-colors ${bg} ${
                  given ? "text-[var(--text-primary)]" : "text-[var(--gold)]"
                }`}
                style={{
                  borderTop:
                    r % 3 === 0
                      ? "2px solid rgba(255,255,255,0.25)"
                      : "1px solid rgba(255,255,255,0.16)",
                  borderLeft:
                    c % 3 === 0
                      ? "2px solid rgba(255,255,255,0.25)"
                      : "1px solid rgba(255,255,255,0.16)",
                  borderRight:
                    c === 8 ? "2px solid rgba(255,255,255,0.25)" : undefined,
                  borderBottom:
                    r === 8 ? "2px solid rgba(255,255,255,0.25)" : undefined,
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

        {status === "playing" ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setPencilMode((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
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
                    onClick={() => handleNumber(d)}
                    disabled={selected === null || complete}
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
        ) : (
          <div className="flex flex-col items-center gap-3 max-w-[480px] mx-auto w-full">
            <div className="w-full text-center rounded-xl py-4 px-4 border bg-[rgba(58,186,122,0.1)] border-[rgba(58,186,122,0.3)]">
              <p className="text-lg font-bold text-[var(--green)]">
                Resolvido! +{score} pts 🎉
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {SUDOKU_DIFFICULTIES[difficulty].label} ·{" "}
                {formatElapsed(elapsedSeconds)} · {mistakes} erro
                {mistakes === 1 ? "" : "s"}
              </p>
            </div>
            {ranked ? (
              <button
                onClick={() => {
                  setShowResult(true);
                  loadLeaderboard();
                }}
                className="text-sm text-[var(--gold)] underline underline-offset-2"
              >
                Ver placar do dia
              </button>
            ) : (
              <button
                onClick={startPracticeRound}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] transition-all"
              >
                🔁 Novo puzzle
              </button>
            )}
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
                {status === "won" ? "Resolvido! 🧩" : "Resultado de hoje"}
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
            <SudokuLeaderboard entries={leaderboard} meId={user?.id} />
          </div>
        </>
      )}
    </div>
  );
}
