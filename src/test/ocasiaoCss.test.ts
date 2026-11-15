import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { OCCASION_VAR_NAMES } from "@/lib/seasonal/occasionAssets";

const root = resolve(__dirname, "../..");
const css = readFileSync(resolve(root, "src/styles/seasons/ocasiao.css"), "utf8");

describe("ocasiao.css", () => {
  it("usa só as variáveis que o app define (--p-h, --p-s, --occ-emoji, --occ-garland)", () => {
    const used = new Set([...css.matchAll(/var\((--(?:p|occ)-[a-z-]+)\)/g)].map((m) => m[1]));
    for (const v of used) expect(OCCASION_VAR_NAMES as readonly string[]).toContain(v);
    for (const v of OCCASION_VAR_NAMES) expect(used.has(v), v).toBe(true);
  });
  it("tem as paletas escura e clara, com as variáveis de cor do app", () => {
    expect(css).toContain(':root[data-season="ocasiao"] {');
    expect(css).toContain(':root[data-season="ocasiao"][data-theme="light"] {');
    for (const v of ["--bg-abyss", "--bg-deep", "--bg-card", "--gold", "--gold-bright", "--text-primary", "--text-muted"]) {
      expect(css.split(':root[data-season="ocasiao"][data-theme="light"]')[0], v).toContain(v);
      expect(css.split(':root[data-season="ocasiao"][data-theme="light"]')[1], v).toContain(v);
    }
  });
  it("decora os quatro pontos que o app marca (hat, stocking, garland) sem tocar em texto", () => {
    for (const d of ["hat", "stocking", "garland"]) {
      expect(css).toContain(`[data-season="ocasiao"] [data-decor="${d}"]::after`);
    }
    expect(css.match(/pointer-events: none/g)!.length).toBeGreaterThanOrEqual(3);
  });
  it("a faixa tem a altura do SVG gerado (30px) e é carregada no main.tsx", () => {
    expect(css).toContain("400px 30px");
    expect(readFileSync(resolve(root, "src/main.tsx"), "utf8")).toContain("seasons/ocasiao.css");
  });
  it("não sobrou arquivo dos visuais genéricos antigos", () => {
    expect(existsSync(resolve(root, "src/styles/seasons/generic.css"))).toBe(false);
    expect(existsSync(resolve(root, "public/seasons/letras"))).toBe(false);
  });
});
