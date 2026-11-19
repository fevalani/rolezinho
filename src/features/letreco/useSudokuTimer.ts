import { useState, useEffect, useCallback, useRef } from "react";

interface UseSudokuTimerOptions {
  /** Partida em andamento (carregada, status "playing" e dificuldade escolhida). */
  active: boolean;
  /**
   * Chamado quando o timer pausa sozinho (aba oculta ou `pagehide`), com o
   * tempo decorrido em segundos — a tela usa para gravar o progresso.
   */
  onAutoPause?: (elapsedSeconds: number) => void;
}

/**
 * Cronômetro do Sudoku por tempo ACUMULADO (não recalcula a partir de
 * `started_at`): só conta com a tela visível e fora da pausa manual.
 */
export function useSudokuTimer({ active, onAutoPause }: UseSudokuTimerOptions) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [isHidden, setIsHidden] = useState(() =>
    typeof document !== "undefined" ? document.hidden : false,
  );
  const isPaused = manualPaused || isHidden;

  const accumulatedMs = useRef(0);
  const activeSinceMs = useRef<number | null>(null);

  // Espelhos para os escutadores de visibilitychange/pagehide lerem o valor mais recente
  const manualPausedRef = useRef(manualPaused);
  const onAutoPauseRef = useRef(onAutoPause);
  useEffect(() => {
    manualPausedRef.current = manualPaused;
  }, [manualPaused]);
  useEffect(() => {
    onAutoPauseRef.current = onAutoPause;
  }, [onAutoPause]);

  const getElapsedSeconds = useCallback(() => {
    const extra =
      activeSinceMs.current !== null ? Date.now() - activeSinceMs.current : 0;
    return Math.floor((accumulatedMs.current + Math.max(0, extra)) / 1000);
  }, []);

  /** Congela o tempo e devolve os segundos decorridos. */
  const pause = useCallback(() => {
    if (activeSinceMs.current != null) {
      accumulatedMs.current += Math.max(0, Date.now() - activeSinceMs.current);
      activeSinceMs.current = null;
    }
    const secs = Math.floor(accumulatedMs.current / 1000);
    setElapsedSeconds(secs);
    return secs;
  }, []);

  const resume = useCallback(() => {
    if (activeSinceMs.current == null) {
      activeSinceMs.current = Date.now();
    }
  }, []);

  /** Define o tempo acumulado (ms) e se já volta contando (se a aba estiver visível). */
  const restore = useCallback((ms: number, running: boolean) => {
    accumulatedMs.current = ms;
    activeSinceMs.current = running && !document.hidden ? Date.now() : null;
    setElapsedSeconds(Math.floor(ms / 1000));
  }, []);

  /** Zera o tempo para uma partida nova (já contando, se a aba estiver visível). */
  const reset = useCallback(() => {
    setManualPaused(false);
    restore(0, true);
  }, [restore]);

  const getAccumulatedMs = useCallback(() => accumulatedMs.current, []);

  const togglePause = useCallback(() => {
    if (manualPaused) {
      setManualPaused(false);
    } else {
      pause();
      setManualPaused(true);
    }
  }, [manualPaused, pause]);

  // Pausa automática ao sair da página
  useEffect(() => {
    if (!active) return;

    if (document.hidden) {
      pause();
    }

    const handlePauseAndNotify = () => {
      onAutoPauseRef.current?.(pause());
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsHidden(true);
        handlePauseAndNotify();
      } else {
        setIsHidden(false);
        if (!manualPausedRef.current) {
          resume();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePauseAndNotify);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePauseAndNotify);
    };
  }, [active, pause, resume]);

  // Cronômetro enquanto estiver ativo
  useEffect(() => {
    if (!active || isPaused || document.hidden) return;
    resume();
    const id = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds());
    }, 1000);
    return () => clearInterval(id);
  }, [active, isPaused, resume, getElapsedSeconds]);

  return {
    elapsedSeconds,
    isPaused,
    manualPaused,
    setManualPaused,
    togglePause,
    getElapsedSeconds,
    getAccumulatedMs,
    pause,
    resume,
    restore,
    reset,
  };
}
