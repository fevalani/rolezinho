// Cor do tema a partir do emoji principal — automática.
// No navegador: desenha o emoji num canvas e tira a média (circular) dos tons mais vivos.
// Sem canvas (testes, navegadores antigos) ou se o emoji for acinzentado: tom derivado do
// próprio texto, estável (o mesmo emoji sempre dá a mesma cor).

export interface HueSat {
  /** Tom, 0–359. */
  h: number;
  /** Saturação do destaque, em % (limitada para o texto continuar legível). */
  s: number;
}

const cache = new Map<string, HueSat>();

/** Tom e saturação estáveis a partir do texto (plano B). */
export function hashHue(text: string): HueSat {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return { h: (h >>> 0) % 360, s: 72 };
}

/** RGB (0–255) → { tom 0–359, saturação 0–1, luminosidade 0–1 }. */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/**
 * Tom dominante de uma lista de pixels RGBA (`data` do canvas). Pixels transparentes,
 * quase brancos/pretos ou sem cor não contam. `null` se não sobrou cor suficiente.
 */
export function dominantHue(data: ArrayLike<number>): HueSat | null {
  let sx = 0;
  let sy = 0;
  let weight = 0;
  let satSum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const chroma = s * (1 - Math.abs(2 * l - 1)); // 0 = cinza/branco/preto
    if (chroma < 0.18) continue;
    const rad = (h * Math.PI) / 180;
    sx += Math.cos(rad) * chroma;
    sy += Math.sin(rad) * chroma;
    weight += chroma;
    satSum += s;
    n++;
  }
  if (n < 20 || weight === 0) return null;
  const h = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const s = Math.min(85, Math.max(55, Math.round((satSum / n) * 100)));
  return { h: Math.round(h), s };
}

function fromCanvas(emoji: string): HueSat | null {
  if (typeof document === "undefined" || /jsdom/i.test(navigator.userAgent)) return null;
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.font = `${size * 0.7}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2 + 3);
    return dominantHue(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return null;
  }
}

/** Cor do tema para um emoji (com cache). */
export function emojiHue(emoji: string): HueSat {
  const hit = cache.get(emoji);
  if (hit) return hit;
  const result = fromCanvas(emoji) ?? hashHue(emoji);
  cache.set(emoji, result);
  return result;
}
