/** Número pseudo-aleatório estável (0..1) para a letra `i` de um texto. */
function rand(text: string, i: number, salt: number): number {
  let h = 2166136261 ^ (i * 374761393 + salt * 668265263);
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Deslocamento e giro (pequenos e estáveis) de cada letra de `text`. */
export function jumbleOffsets(text: string): { rotate: number; dy: number }[] {
  return Array.from(text).map((_, i) => ({
    rotate: Math.round((rand(text, i, 1) * 2 - 1) * 9), // -9° a 9°
    dy: Math.round((rand(text, i, 2) * 2 - 1) * 2), // -2px a 2px
  }));
}
