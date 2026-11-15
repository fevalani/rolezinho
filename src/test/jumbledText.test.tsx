import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JumbledText } from "@/components/JumbledText";
import { jumbleOffsets } from "@/lib/jumble";

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
    expect([...container.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent)).toEqual(["b", "d", "p", "q"]);
  });
  it("é determinístico entre renderizações", () => {
    const a = render(<JumbledText text="Dislexia" />).container.innerHTML;
    const b = render(<JumbledText text="Dislexia" />).container.innerHTML;
    expect(a).toBe(b);
  });
});

describe("jumbleOffsets", () => {
  it("é estável: o mesmo texto sempre dá os mesmos deslocamentos", () => {
    expect(jumbleOffsets("Atenção à Dislexia")).toEqual(jumbleOffsets("Atenção à Dislexia"));
  });
  it("um deslocamento por letra, sempre pequeno (continua legível)", () => {
    const o = jumbleOffsets("Dislexia");
    expect(o).toHaveLength(8);
    for (const { rotate, dy } of o) {
      expect(Math.abs(rotate)).toBeLessThanOrEqual(5);
      expect(Math.abs(dy)).toBeLessThanOrEqual(1.5);
    }
  });
  it("textos diferentes embaralham de formas diferentes", () => {
    expect(jumbleOffsets("abcdefgh")).not.toEqual(jumbleOffsets("hgfedcba"));
  });
  it("texto vazio não quebra", () => {
    expect(jumbleOffsets("")).toEqual([]);
  });
});
