import { useEffect, useRef } from "react";
import { isOpenSwipe, type SwipePoint } from "@/lib/swipeLogic";

/**
 * Chama `onOpen` quando o dedo começa na borda esquerda da tela e é arrastado para a
 * direita (gesto de "puxar o menu"). Desligado com `enabled = false` (ex.: menu já aberto).
 * No Android com navegação por gestos o sistema pode usar a borda para "voltar"; por isso
 * o menu também abre pelo botão de sempre.
 */
export function useEdgeSwipe(onOpen: () => void, enabled = true): void {
  const start = useRef<SwipePoint | null>(null);
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (!enabled) return;
    const point = (t: Touch): SwipePoint => ({ x: t.clientX, y: t.clientY });
    const onStart = (e: TouchEvent) => {
      start.current = e.touches.length === 1 ? point(e.touches[0]) : null;
    };
    const onEnd = (e: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (from && t && isOpenSwipe(from, point(t))) open.current();
    };
    const onCancel = () => {
      start.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}
