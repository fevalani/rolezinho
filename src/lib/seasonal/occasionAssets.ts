// Decoração de uma ocasião: a faixa de emojis que "pende" sob o cabeçalho, em SVG gerado
// na hora a partir dos emojis do admin, e as variáveis CSS que o ocasiao.css usa.
// Lógica pura (strings), sem DOM — a aplicação no <html> fica no contexto.

import { OCCASION_SEASON, type Occasion } from "./occasions";
import type { HueSat } from "./emojiColor";

export const GARLAND_TILE_WIDTH = 400;
export const GARLAND_TILE_HEIGHT = 30;
const SLOTS = 8; // itens por faixa de 400px (a cada 50px)

const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";

/**
 * Sequência de itens da faixa: o emoji principal a cada três lugares, e os demais
 * emojis revezando entre eles. Sem emojis extras, só o principal.
 */
export function garlandItems(main: string, extras: string[]): string[] {
  if (extras.length === 0) return Array.from({ length: SLOTS }, () => main);
  const out: string[] = [];
  let e = 0;
  for (let i = 0; i < SLOTS; i++) {
    if (i % 3 === 0) out.push(main);
    else out.push(extras[e++ % extras.length]);
  }
  return out;
}

/** Giro (graus) de cada item: estável e pequeno; maior (e com espelhamento) no modo embaralhado. */
export function garlandTilt(i: number, jumble: boolean): { rotate: number; flip: boolean } {
  const base = ((i * 37) % 21) - 10; // -10..10
  if (!jumble) return { rotate: Math.round(base * 0.9), flip: false };
  return { rotate: Math.round(base * 2.4), flip: i % 3 === 1 };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG de uma faixa repetível: fio caindo em curvas, com os itens pendurados. */
export function buildGarlandSvg(items: string[], jumble: boolean, hs: HueSat): string {
  const ink = `hsl(${hs.h} ${hs.s}% 62%)`; // cor de letras (emoji ignora)
  const step = GARLAND_TILE_WIDTH / items.length;
  let path = "M0 3";
  for (let x = 0; x < GARLAND_TILE_WIDTH; x += 100) {
    path += ` Q${x + 50} 11 ${x + 100} 3`;
  }
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GARLAND_TILE_WIDTH}" height="${GARLAND_TILE_HEIGHT}" viewBox="0 0 ${GARLAND_TILE_WIDTH} ${GARLAND_TILE_HEIGHT}">`,
    `<path d="${path}" fill="none" stroke="#8a8a8a" stroke-opacity="0.55" stroke-width="1.2"/>`,
  ];
  items.forEach((item, i) => {
    const x = step * (i + 0.5);
    const t = (x % 100) / 100;
    const y = 3 + 16 * t * (1 - t); // altura do fio nesse ponto (mesma curva do path)
    const { rotate, flip } = garlandTilt(i, jumble);
    const cy = y + 12;
    const scale = flip ? " scale(-1 1)" : "";
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + 4).toFixed(1)}" stroke="#8a8a8a" stroke-opacity="0.55" stroke-width="1"/>`,
      `<text transform="translate(${x.toFixed(1)} ${cy.toFixed(1)}) rotate(${rotate})${scale}" font-family="${EMOJI_FONT}" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${ink}">${esc(item)}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

export const svgUrl = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Variáveis CSS (no <html>) que o ocasiao.css usa para a paleta e a decoração. */
export function occasionCssVars(o: Occasion, hs: HueSat): Record<string, string> {
  return {
    "--p-h": String(hs.h),
    "--p-s": `${hs.s}%`,
    "--occ-emoji": JSON.stringify(o.emoji),
    "--occ-garland": svgUrl(buildGarlandSvg(garlandItems(o.emoji, o.extras), o.jumble, hs)),
  };
}

export const OCCASION_VAR_NAMES = ["--p-h", "--p-s", "--occ-emoji", "--occ-garland"] as const;

/** Liga o visual da ocasião no <html>. */
export function applyOccasionVars(root: HTMLElement, o: Occasion, hs: HueSat): void {
  root.dataset.season = OCCASION_SEASON;
  for (const [k, v] of Object.entries(occasionCssVars(o, hs))) root.style.setProperty(k, v);
}

/** Tira as variáveis da ocasião do <html>. */
export function clearOccasionVars(root: HTMLElement): void {
  for (const k of OCCASION_VAR_NAMES) root.style.removeProperty(k);
}
