import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useSudokuTimer } from "./useSudokuTimer";
import { SudokuBoard } from "./sudoku/SudokuBoard";
import { SudokuDifficultyPicker } from "./sudoku/SudokuDifficultyPicker";
import { SudokuHeader } from "./sudoku/SudokuHeader";
import { SudokuNumberPad } from "./sudoku/SudokuNumberPad";
import { SudokuResultSheet } from "./sudoku/SudokuResultSheet";
import { SudokuRules } from "./sudoku/SudokuRules";
import { SudokuSolvedPanel } from "./sudoku/SudokuSolvedPanel";
import {
  getSudokuOfDay,
  getSudokuPracticePuzzle,
  getSudokuGameDate,
  isGivenCell,
  isBoardComplete,
  applyGuess,
  sudokuPointsFor,
  buildSudokuShareText,
  getPeers,
  findConflictingPeers,
  isDigitComplete,
  shouldApplyLockedDigit,
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
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [flashConflicts, setFlashConflicts] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pencilMode, setPencilMode] = useState(false);
  const [notesBlockMode, setNotesBlockMode] = useState(false);
  // número "travado" no rascunho (toque longo no teclado): tocar numa célula já anota ele
  const [lockedDigit, setLockedDigit] = useState<number | null>(null);
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
    accumulatedMs: number;
    notes: Record<number, number[]>;
    startedAtIso: string;
  } | null>(null);

  const startedAtIso = useRef<string>("");
  //Espelho para o callback de pausa automática obter o valor mais recente
  const boardRef = useRef(board);
  const mistakesRef = useRef(mistakes);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  useEffect(() => {
    mistakesRef.current = mistakes;
  }, [mistakes]);

  const elapsedStorageKey = useMemo(
    () => (user ? `sudoku-elapsed:${user.id}:${gameDate}` : null),
    [user, gameDate],
  );

  const persist = useCallback(
    async (
      nextBoard: string,
      nextMistakes: number,
      nextStatus: GameStatus,
      nextScore: number,
      nextElapsedSeconds: number,
    ) => {
      // Modo treino não persiste nem conta pro ranking — só o ranqueado grava.
      if (!user || !difficulty || !ranked) return;
      await saveSudokuGame(user.id, gameDate, {
        difficulty,
        board: nextBoard,
        mistakes: nextMistakes,
        elapsed_seconds: nextElapsedSeconds,
        status: nextStatus,
        score: nextScore,
        started_at: startedAtIso.current,
      });
    },
    [user, gameDate, difficulty, ranked],
  );

  const {
    elapsedSeconds,
    isPaused,
    manualPaused,
    setManualPaused,
    togglePause,
    getElapsedSeconds: getCurrentElapsedSeconds,
    getAccumulatedMs,
    pause: pauseTimer,
    restore: restoreTimer,
    reset: resetTimer,
  } = useSudokuTimer({
    active: !loading && status === "playing" && !!difficulty,
    // Aba oculta / pagehide: guarda o tempo (backup local + banco) no ranqueado
    onAutoPause: (secs) => {
      if (!ranked) return;
      if (elapsedStorageKey) {
        try {
          localStorage.setItem(elapsedStorageKey, String(secs));
        } catch {
          /* localStorage indisponível — rascunho fica só na sessão atual */
        }
      }
      persist(boardRef.current, mistakesRef.current, "playing", 0, secs);
    },
  });

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

        let restoredSeconds = game.elapsed_seconds;

        if (game.status === "playing") {
          try {
            const rawElapsed = localStorage.getItem(
              `sudoku-elapsed:${user.id}:${gameDate}`,
            );
            if (rawElapsed) {
              const parsed = Number(rawElapsed);
              if (Number.isFinite(parsed) && parsed > restoredSeconds) {
                restoredSeconds = parsed;
              }
            }
          } catch {
            /* localStorage indisponível — segue sem rascunho salvo */
          }
        }

        restoreTimer(restoredSeconds * 1000, game.status === "playing");

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
  }, [user, gameDate, restoreTimer]);

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

  const startNewGame = useCallback(
    (diff: SudokuDifficulty) => {
      const { puzzle: p, solution: s } = getSudokuOfDay(diff);
      const iso = new Date().toISOString();
      startedAtIso.current = iso;
      resetTimer();

      setDifficulty(diff);
      setPuzzle(p);
      setSolution(s);
      setBoard(p);
      setMistakes(0);
      setStatus("playing");
      setScore(0);
      setNotes({});
      setSelected(null);
      setLockedDigit(null);

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
    [user, gameDate, resetTimer],
  );

  const startPracticeRound = useCallback(() => {
    if (!difficulty) return;
    const { puzzle: p, solution: s } = getSudokuPracticePuzzle(difficulty);
    startedAtIso.current = new Date().toISOString();
    resetTimer();
    setPuzzle(p);
    setSolution(s);
    setBoard(p);
    setMistakes(0);
    setStatus("playing");
    setScore(0);
    setNotes({});
    setSelected(null);
    setShowResult(false);
  }, [difficulty, resetTimer]);

  const toggleRanked = useCallback(() => {
    if (ranked) {
      pauseTimer();
      rankedSnapshot.current = {
        puzzle,
        solution,
        board,
        mistakes,
        status,
        score,
        accumulatedMs: getAccumulatedMs(),
        notes,
        startedAtIso: startedAtIso.current,
      };
      startPracticeRound();
      setRanked(false);
    } else {
      const snap = rankedSnapshot.current;
      if (snap) {
        setPuzzle(snap.puzzle);
        setSolution(snap.solution);
        setBoard(snap.board);
        setMistakes(snap.mistakes);
        setStatus(snap.status);
        setScore(snap.score);
        setNotes(snap.notes);
        startedAtIso.current = snap.startedAtIso;
        restoreTimer(snap.accumulatedMs, snap.status === "playing");
      }
      setManualPaused(false);
      setSelected(null);
      setShowResult(false);
      setRanked(true);
    }
  }, [
    ranked,
    puzzle,
    solution,
    board,
    mistakes,
    status,
    score,
    notes,
    pauseTimer,
    getAccumulatedMs,
    restoreTimer,
    setManualPaused,
    startPracticeRound,
  ]);

  // Lógica para funcionamento do botão de pause manual
  const handleTogglePause = useCallback(() => {
    if (status !== "playing") return;
    togglePause();
  }, [status, togglePause]);

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

  const applyDigit = useCallback(
    (cell: number, digit: number) => {
      if (status !== "playing" || !user || !difficulty || isPaused)
        return;
      if (isGivenCell(puzzle, cell) || board[cell] !== "0") return;
      if (isDigitComplete(board, digit)) return;

      if (pencilMode) {
        const alreadyNoted = (notes[cell] ?? []).includes(digit);
        if (!alreadyNoted) {
          const conflicts = findConflictingPeers(board, cell, digit);
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
        toggleNote(cell, digit);
        return;
      }

      const { board: nextBoard, correct } = applyGuess(
        board,
        solution,
        cell,
        digit,
      );

      if (!correct) {
        setFlashIndex(cell);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashIndex(null), 450);
        const nextMistakes = mistakes + 1;
        setMistakes(nextMistakes);
        persist(board, nextMistakes, "playing", 0, getCurrentElapsedSeconds());
        return;
      }

      setBoard(nextBoard);
      clearNotes(cell);
      clearDigitFromPeerNotes(cell, digit);

      if (isBoardComplete(nextBoard)) {
        const finalElapsed = pauseTimer();
        const finalScore = sudokuPointsFor(finalElapsed, mistakes, difficulty);
        setScore(finalScore);
        setStatus("won");
        persist(nextBoard, mistakes, "won", finalScore, finalElapsed);

        // Redundância para não apagar o backup do tempo da partida ranqueada.
        if (ranked && elapsedStorageKey) {
          try {
            localStorage.removeItem(elapsedStorageKey);
          } catch {
            /* ignore */
          }
        }

        // Modal de resultado/placar só faz sentido no ranqueado.
        if (ranked) {
          setTimeout(() => {
            setShowResult(true);
            loadLeaderboard();
          }, 500);
        }
      } else {
        persist(nextBoard, mistakes, "playing", 0, getCurrentElapsedSeconds());
        setSelected(null);
      }
    },
    [
      status,
      isPaused,
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
      getCurrentElapsedSeconds,
      pauseTimer,
      elapsedStorageKey,
    ],
  );

  const handleNumber = useCallback(
    (digit: number) => {
      if (selected !== null) applyDigit(selected, digit);
    },
    [selected, applyDigit],
  );

  // Toque numa célula: com um número travado no rascunho, já anota nela;
  // senão, só seleciona (comportamento de sempre).
  const handleSelectCell = useCallback(
    (cell: number) => {
      if (shouldApplyLockedDigit(lockedDigit, pencilMode, puzzle, board, cell)) {
        applyDigit(cell, lockedDigit!);
        return;
      }
      setSelected(cell);
    },
    [lockedDigit, pencilMode, puzzle, board, applyDigit],
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
    return <SudokuDifficultyPicker gameDate={gameDate} onPick={startNewGame} />;
  }

  const openResult = () => {
    setShowResult(true);
    loadLeaderboard();
  };

  return (
    <div className="flex flex-col">
      <SudokuHeader
        gameDate={gameDate}
        difficulty={difficulty}
        elapsedSeconds={elapsedSeconds}
        mistakes={mistakes}
        ranked={ranked}
        status={status}
        manualPaused={manualPaused}
        onTogglePause={handleTogglePause}
        onToggleRules={() => setShowRules((v) => !v)}
        onToggleRanked={toggleRanked}
        onNewPractice={startPracticeRound}
        onShowResult={openResult}
      />

      {showRules && (
        <div className="px-4 mb-3">
          <SudokuRules />
        </div>
      )}

      <div className="flex-1 flex flex-col gap-5 px-4 py-2">
        <SudokuBoard
          puzzle={puzzle}
          board={board}
          notes={notes}
          selected={selected}
          flashIndex={flashIndex}
          flashConflicts={flashConflicts}
          notesBlockMode={notesBlockMode}
          status={status}
          isPaused={isPaused}
          onSelect={handleSelectCell}
          onResume={() => setManualPaused(false)}
          onToggleNotesBlockMode={() => setNotesBlockMode((v) => !v)}
        />
        {status === "playing" ? (
          <SudokuNumberPad
            board={board}
            selected={selected}
            pencilMode={pencilMode}
            isPaused={isPaused}
            lockedDigit={pencilMode ? lockedDigit : null}
            onLockDigit={setLockedDigit}
            onTogglePencil={() => {
              setPencilMode((v) => !v);
              setLockedDigit(null);
            }}
            onDigit={handleNumber}
          />
        ) : (
          <SudokuSolvedPanel
            difficulty={difficulty}
            score={score}
            elapsedSeconds={elapsedSeconds}
            mistakes={mistakes}
            ranked={ranked}
            onShowResult={openResult}
            onNewPractice={startPracticeRound}
          />
        )}
      </div>

      {showResult && (
        <SudokuResultSheet
          status={status}
          shareLabel={shareLabel}
          leaderboard={leaderboard}
          meId={user?.id}
          onShare={handleShare}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  );
}
