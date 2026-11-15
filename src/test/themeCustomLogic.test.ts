import { describe, it, expect } from "vitest";
import { MAX_DAYS_BEFORE, daysBefore, daysBetween } from "@/lib/seasonal/themeCustomLogic";
import { jumbleOffsets } from "@/lib/jumble";

describe("daysBetween / daysBefore (período termina no dia da comemoração)", () => {
  it("conta os dias entre o início e o dia", () => {
    expect(daysBetween("06-05", "06-12")).toBe(7);
    expect(daysBetween("10-03", "10-03")).toBe(0);
  });
  it("atravessa a virada do ano e a virada de mês", () => {
    expect(daysBetween("12-29", "01-02")).toBe(4);
    expect(daysBetween("02-27", "03-02")).toBe(4); // 2028 é bissexto: 27,28,29,1,2
  });
  it("limita a 30 dias", () => {
    expect(daysBetween("01-01", "12-31")).toBe(MAX_DAYS_BEFORE);
  });
  it("daysBefore volta N dias, inclusive entre meses e anos", () => {
    expect(daysBefore("06-12", 7)).toBe("06-05");
    expect(daysBefore("03-01", 1)).toBe("02-29");
    expect(daysBefore("01-02", 4)).toBe("12-29");
    expect(daysBefore("10-03", 0)).toBe("10-03");
  });
  it("é a inversa de daysBetween", () => {
    for (const [md, n] of [["06-12", 7], ["01-02", 4], ["12-25", 24]] as const) {
      expect(daysBetween(daysBefore(md, n), md)).toBe(n);
    }
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
      expect(Math.abs(rotate)).toBeLessThanOrEqual(9);
      expect(Math.abs(dy)).toBeLessThanOrEqual(2);
    }
  });
  it("textos diferentes embaralham de formas diferentes", () => {
    expect(jumbleOffsets("abcdefgh")).not.toEqual(jumbleOffsets("hgfedcba"));
  });
  it("texto vazio não quebra", () => {
    expect(jumbleOffsets("")).toEqual([]);
  });
});
