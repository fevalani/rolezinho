import { describe, it, expect } from "vitest";
import {
  GARLAND_TILE_HEIGHT,
  GARLAND_TILE_WIDTH,
  OCCASION_VAR_NAMES,
  applyOccasionVars,
  buildGarlandSvg,
  clearOccasionVars,
  garlandItems,
  garlandTilt,
  occasionCssVars,
  svgUrl,
} from "@/lib/seasonal/occasionAssets";
import type { Occasion } from "@/lib/seasonal/occasions";

const hs = { h: 200, s: 70 };
const occ: Occasion = { id: "o", title: "t", emoji: "🎃", extras: ["👻", "🦇"], dayMd: "10-31", daysBefore: 0, jumble: false, enabled: true };

describe("garlandItems", () => {
  it("o emoji principal aparece a cada três lugares, e os extras revezam", () => {
    expect(garlandItems("🎃", ["👻", "🦇"])).toEqual(["🎃", "👻", "🦇", "🎃", "👻", "🦇", "🎃", "👻"]);
  });
  it("com um extra só, ele se repete", () => {
    expect(garlandItems("A", ["b"])).toEqual(["A", "b", "b", "A", "b", "b", "A", "b"]);
  });
  it("sem extras, só o principal", () => {
    expect(garlandItems("🎃", [])).toEqual(Array(8).fill("🎃"));
  });
});

describe("garlandTilt", () => {
  it("é estável e pequeno no modo normal, sem espelhar", () => {
    for (let i = 0; i < 8; i++) {
      const t = garlandTilt(i, false);
      expect(t).toEqual(garlandTilt(i, false));
      expect(Math.abs(t.rotate)).toBeLessThanOrEqual(10);
      expect(t.flip).toBe(false);
    }
  });
  it("no modo embaralhado gira mais e espelha alguns itens", () => {
    const tilts = Array.from({ length: 8 }, (_, i) => garlandTilt(i, true));
    expect(tilts.some((t) => t.flip)).toBe(true);
    expect(Math.max(...tilts.map((t) => Math.abs(t.rotate)))).toBeGreaterThan(10);
  });
});

describe("buildGarlandSvg", () => {
  const svg = buildGarlandSvg(garlandItems("🎃", ["👻", "🦇"]), false, hs);
  it("é um SVG do tamanho da faixa, com o fio e um texto por item", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`width="${GARLAND_TILE_WIDTH}" height="${GARLAND_TILE_HEIGHT}"`);
    expect((svg.match(/<text /g) ?? []).length).toBe(8);
    expect((svg.match(/<line /g) ?? []).length).toBe(8);
    expect(svg).toContain("<path ");
    for (const e of ["🎃", "👻", "🦇"]) expect(svg).toContain(e);
  });
  it("o fio fecha no fim do bloco (emenda sem emenda ao repetir)", () => {
    expect(svg).toMatch(/Q350 11 400 3"/);
    expect(svg).toMatch(/d="M0 3 /);
  });
  it("itens dentro da faixa (nada pendurado para fora)", () => {
    const xs = [...svg.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (const [x, y] of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(GARLAND_TILE_WIDTH);
      expect(y).toBeLessThan(GARLAND_TILE_HEIGHT);
    }
  });
  it("escapa texto perigoso e não tem script", () => {
    const evil = buildGarlandSvg(['<script>alert(1)</script>', "&", '"'], false, hs);
    expect(evil).not.toContain("<script");
    expect(evil).toContain("&lt;script&gt;");
    expect(evil).toContain("&amp;");
    expect(evil).toContain("&quot;");
  });
  it("modo embaralhado espelha alguns itens", () => {
    expect(buildGarlandSvg(["b", "d", "p", "q", "m", "w", "n", "u"], true, hs)).toContain("scale(-1 1)");
    expect(svg).not.toContain("scale(-1 1)");
  });
  it("a cor das letras segue o tom do tema", () => {
    expect(buildGarlandSvg(["b"], false, { h: 10, s: 60 })).toContain("hsl(10 60% 62%)");
  });
});

describe("svgUrl / variáveis CSS", () => {
  it("svgUrl codifica para data URI dentro de url()", () => {
    const u = svgUrl("<svg a='b'>#</svg>");
    expect(u.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(u).not.toContain("#<");
    expect(decodeURIComponent(u.slice('url("data:image/svg+xml,'.length, -2))).toBe("<svg a='b'>#</svg>");
  });
  it("occasionCssVars entrega tom, saturação, emoji e faixa", () => {
    const v = occasionCssVars(occ, hs);
    expect(Object.keys(v).sort()).toEqual([...OCCASION_VAR_NAMES].sort());
    expect(v["--p-h"]).toBe("200");
    expect(v["--p-s"]).toBe("70%");
    expect(v["--occ-emoji"]).toBe('"🎃"');
    expect(v["--occ-garland"].startsWith('url("data:image/svg+xml,')).toBe(true);
  });
  it("applyOccasionVars liga e clearOccasionVars desliga no elemento", () => {
    const el = document.createElement("div");
    applyOccasionVars(el, occ, hs);
    expect(el.dataset.season).toBe("ocasiao");
    expect(el.style.getPropertyValue("--p-h")).toBe("200");
    expect(el.style.getPropertyValue("--occ-emoji")).toBe('"🎃"');
    clearOccasionVars(el);
    for (const name of OCCASION_VAR_NAMES) expect(el.style.getPropertyValue(name)).toBe("");
  });
});
