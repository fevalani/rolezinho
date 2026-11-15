import { describe, it, expect } from "vitest";
import {
  toMd,
  isValidMd,
  formatMd,
  formatMdLong,
  isInWindow,
  easterSunday,
  defaultWindowFor,
  occasionMdFor,
  effectiveWindow,
  getTheme,
  SEASONAL_THEMES,
} from "@/lib/seasonal/themes";

describe("datas MM-DD", () => {
  it("toMd formata com zero à esquerda", () => {
    expect(toMd(new Date(2026, 0, 5))).toBe("01-05");
    expect(toMd(new Date(2026, 11, 25))).toBe("12-25");
  });
  it("isValidMd valida mês e dia", () => {
    expect(isValidMd("12-25")).toBe(true);
    expect(isValidMd("13-01")).toBe(false);
    expect(isValidMd("00-10")).toBe(false);
    expect(isValidMd("05-32")).toBe(false);
    expect(isValidMd("5-3")).toBe(false);
    expect(isValidMd("abcde")).toBe(false);
  });
  it("formatMd e formatMdLong", () => {
    expect(formatMd("12-01")).toBe("01/12");
    expect(formatMdLong("12-25")).toBe("25 de dezembro");
    expect(formatMdLong("03-01")).toBe("1 de março");
  });
});

describe("isInWindow", () => {
  it("janela normal é inclusiva", () => {
    const w = { start: "12-01", end: "12-26" };
    expect(isInWindow(new Date(2026, 11, 1), w)).toBe(true);
    expect(isInWindow(new Date(2026, 11, 26), w)).toBe(true);
    expect(isInWindow(new Date(2026, 10, 30), w)).toBe(false);
    expect(isInWindow(new Date(2026, 11, 27), w)).toBe(false);
  });
  it("janela que atravessa o ano", () => {
    const w = { start: "12-29", end: "01-02" };
    expect(isInWindow(new Date(2026, 11, 30), w)).toBe(true);
    expect(isInWindow(new Date(2027, 0, 1), w)).toBe(true);
    expect(isInWindow(new Date(2027, 0, 3), w)).toBe(false);
    expect(isInWindow(new Date(2026, 5, 10), w)).toBe(false);
  });
});

describe("Páscoa", () => {
  it.each([
    [2024, "03-31"],
    [2025, "04-20"],
    [2026, "04-05"],
    [2027, "03-28"],
  ])("easterSunday(%i) = %s", (year, md) => {
    expect(toMd(easterSunday(year))).toBe(md);
  });

  it("tema Páscoa vai de 14 dias antes até o domingo", () => {
    const pascoa = getTheme("pascoa")!;
    expect(defaultWindowFor(pascoa, 2026)).toEqual({ start: "03-22", end: "04-05" });
  });

  it("data comemorativa móvel pula para o ano seguinte quando já passou", () => {
    const pascoa = getTheme("pascoa")!;
    expect(occasionMdFor(pascoa, new Date(2026, 0, 10))).toBe("04-05");
    expect(occasionMdFor(pascoa, new Date(2026, 5, 10))).toBe("03-28"); // 2027
  });

  it("data comemorativa fixa não muda", () => {
    const natal = getTheme("natal")!;
    expect(occasionMdFor(natal, new Date(2026, 11, 30))).toBe("12-25");
  });
});

describe("effectiveWindow", () => {
  const natal = getTheme("natal")!;
  it("sem override usa o padrão", () => {
    expect(effectiveWindow(natal, null, 2026)).toEqual({ start: "12-01", end: "12-26" });
  });
  it("usa o override do admin quando válido", () => {
    expect(effectiveWindow(natal, { start: "11-20", end: "12-31" }, 2026)).toEqual({
      start: "11-20",
      end: "12-31",
    });
  });
  it("ignora override inválido, campo a campo", () => {
    expect(effectiveWindow(natal, { start: "99-99", end: "12-31" }, 2026)).toEqual({
      start: "12-01",
      end: "12-31",
    });
  });
});

describe("catálogo de temas", () => {
  it("getTheme devolve o tema ou undefined", () => {
    expect(getTheme("natal")?.name).toBe("Natal");
    expect(getTheme("nao-existe")).toBeFalsy();
    expect(getTheme(null)).toBeFalsy();
  });
  it("ids únicos e janelas válidas", () => {
    const ids = SEASONAL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of SEASONAL_THEMES) {
      const w = defaultWindowFor(t, 2026);
      expect(isValidMd(w.start)).toBe(true);
      expect(isValidMd(w.end)).toBe(true);
      expect(isValidMd(t.datesFor(2026).occasionMd)).toBe(true);
      expect(t.swatches.length).toBeGreaterThan(0);
    }
  });
});
