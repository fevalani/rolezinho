/** Regra pura dos gestos de arrastar (sem DOM): fácil de testar. */

export interface SwipePoint {
  x: number;
  y: number;
}

/** Faixa (px) da borda esquerda onde o arrasto para abrir o menu pode começar. */
export const EDGE_ZONE = 24;
/** Distância horizontal mínima (px) para valer como gesto. */
export const MIN_SWIPE = 60;
/** O gesto precisa ser mais horizontal que vertical: |dy| ≤ |dx| × este fator. */
export const MAX_SLOPE = 0.6;

function isHorizontal(start: SwipePoint, end: SwipePoint): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.abs(dy) <= Math.abs(dx) * MAX_SLOPE;
}

/** Começou colado na borda esquerda e foi para a direita, na horizontal → abrir o menu. */
export function isOpenSwipe(start: SwipePoint, end: SwipePoint, edge = EDGE_ZONE, min = MIN_SWIPE): boolean {
  return start.x <= edge && end.x - start.x >= min && isHorizontal(start, end);
}

/** Arrasto para a esquerda, na horizontal → fechar o menu. */
export function isCloseSwipe(start: SwipePoint, end: SwipePoint, min = MIN_SWIPE): boolean {
  return start.x - end.x >= min && isHorizontal(start, end);
}
