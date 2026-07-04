import { useState, useRef, useEffect, useCallback } from "react";

const PULL_THRESHOLD = 70; // distância mínima (px) para disparar a atualização
const PULL_MAX = 110; // distância máxima do indicador (efeito de resistência)

/**
 * Gesto de puxar para baixo a partir do topo da página para revalidar dados
 * (padrão Android). Extraído do padrão já usado em BolaoDetailPage.tsx.
 * `enabled=false` desliga os listeners inteiramente (ex.: fora do modo beta).
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled: boolean) {
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const pullDistRef = useRef(0);
  const refreshingRef = useRef(false);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!enabled) return;

    const setDist = (d: number) => {
      pullDistRef.current = d;
      setPullDistance(d);
    };

    const onTouchStart = (e: TouchEvent) => {
      pullStartY.current =
        window.scrollY <= 0 && !refreshingRef.current
          ? e.touches[0].clientY
          : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pullStartY.current === null) return;
      const delta = e.touches[0].clientY - pullStartY.current;
      if (delta > 0 && window.scrollY <= 0) {
        setPulling(true);
        setDist(Math.min(delta * 0.5, PULL_MAX));
      } else {
        setPulling(false);
        setDist(0);
      }
    };

    const onTouchEnd = () => {
      if (pullStartY.current !== null && pullDistRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setPullRefreshing(true);
        onRefreshRef.current().finally(() => {
          refreshingRef.current = false;
          setPullRefreshing(false);
        });
      }
      pullStartY.current = null;
      setPulling(false);
      setDist(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setPullDistance(0);
    setPulling(false);
  }, []);

  return { pullDistance, pulling, pullRefreshing, PULL_THRESHOLD, reset };
}
