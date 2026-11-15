import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { render, screen } from "@testing-library/react";
import { JumbledText } from "@/components/JumbledText";
import { SEASONAL_THEMES } from "@/lib/seasonal/themes";

const root = resolve(__dirname, "../..");

/** Corpo do bloco `:root[data-season="<id>"] { ... }` do generic.css (ou null). */
function blockOf(css: string, id: string): string | null {
  const start = css.indexOf(`:root[data-season="${id}"] {`);
  if (start < 0) return null;
  return css.slice(start, css.indexOf("}", start));
}
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("JumbledText (letras levemente fora do lugar, só visual)", () => {
  it("o texto lido (leitor de tela/cópia) é o normal, na ordem certa", () => {
    render(<JumbledText text="Atenção à Dislexia" />);
    expect(screen.getByText("Atenção à Dislexia")).toHaveClass("sr-only");
  });

  it("cada letra é desenhada à parte, escondida de leitores de tela e na mesma ordem", () => {
    const { container } = render(<JumbledText text="Olá mundo" />);
    const visual = [...container.querySelectorAll('span[aria-hidden="true"]')];
    expect(visual.map((e) => e.textContent).join("")).toBe("Olá mundo");
    for (const el of visual.filter((e) => e.textContent?.trim())) {
      expect((el as HTMLElement).style.transform).toMatch(/translateY\(.*\) rotate\(.*deg\)/);
    }
  });

  it("não troca letras de lugar nem inventa letras (b continua b, d continua d)", () => {
    const { container } = render(<JumbledText text="bdpq" />);
    const letters = [...container.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent);
    expect(letters).toEqual(["b", "d", "p", "q"]);
  });

  it("é determinístico entre renderizações", () => {
    const a = render(<JumbledText text="Dislexia" />).container.innerHTML;
    const b = render(<JumbledText text="Dislexia" />).container.innerHTML;
    expect(a).toBe(b);
  });
});

describe("arquivos de visual dos temas genéricos", () => {
  const css = read("src/styles/seasons/generic.css");
  const generic = SEASONAL_THEMES.filter((t) => t.generic);

  it("todo visual genérico tem seu bloco de variáveis no generic.css", () => {
    for (const t of generic) {
      const block = blockOf(css, t.id);
      expect(block, `bloco de ${t.id}`).not.toBeNull();
      for (const v of ["--p-bg", "--p-accent", "--p-text", "--p-light-bg", "--p-light-accent", "--p-light-text"]) {
        expect(block!, `${t.id} ${v}`).toContain(v);
      }
    }
  });

  it("os visuais por emoji definem as 4 decorações; o das letras usa SVG", () => {
    for (const t of generic.filter((x) => x.id !== "letras")) {
      const block = blockOf(css, t.id)!;
      for (const v of ["--decor-hat", "--decor-mark", "--decor-strip", "--decor-lights"]) {
        expect(block, `${t.id} ${v}`).toContain(v);
      }
    }
    const letras = read("src/styles/seasons/letras.css");
    for (const f of ["hat", "mark", "garland", "lights"]) {
      expect(letras).toContain(`/seasons/letras/${f}.svg`);
      expect(existsSync(resolve(root, `public/seasons/letras/${f}.svg`)), `${f}.svg`).toBe(true);
    }
  });

  it("as cores de cada visual são hex válidos", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const t of generic) {
      const block = blockOf(css, t.id)!;
      for (const m of block.matchAll(/--p-[a-z-]+:\\s*([^;]+);/g)) expect(m[1].trim()).toMatch(hex);
    }
  });

  it("generic.css e letras.css são carregados no main.tsx", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("seasons/generic.css");
    expect(main).toContain("seasons/letras.css");
  });

  it("os SVGs das letras são arquivos SVG bem formados e sem script", () => {
    for (const f of ["hat", "mark", "garland", "lights"]) {
      const svg = read(`public/seasons/letras/${f}.svg`);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trim().endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/<script|onload=|href=/i);
    }
  });
});
