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
  applyOverride,
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

describe("visuais genéricos reaproveitáveis", () => {
  const generic = SEASONAL_THEMES.filter((t) => t.generic);

  it("há 10 visuais genéricos prontos, com nomes e ids únicos", () => {
    expect(generic).toHaveLength(10);
    expect(new Set(generic.map((t) => t.name)).size).toBe(10);
    expect(new Set(SEASONAL_THEMES.map((t) => t.name)).size).toBe(SEASONAL_THEMES.length);
  });

  it("Atenção à Dislexia: só 16/11, letras embaralhadas no selo", () => {
    const letras = getTheme("letras")!;
    expect(letras.occasion).toBe("Atenção à Dislexia");
    expect(letras.jumble).toBe(true);
    expect(defaultWindowFor(letras, 2026)).toEqual({ start: "11-16", end: "11-16" });
    expect(occasionMdFor(letras, new Date(2026, 10, 10))).toBe("11-16");
    // só esse tema embaralha
    expect(SEASONAL_THEMES.filter((t) => t.jumble).map((t) => t.id)).toEqual(["letras"]);
  });

  it("Carnaval acompanha a Páscoa: de sexta a terça (47 dias antes da Páscoa)", () => {
    const c = getTheme("confete")!;
    expect(c.movable).toBe(true);
    expect(defaultWindowFor(c, 2026)).toEqual({ start: "02-13", end: "02-17" }); // Páscoa 05/04/2026
    expect(defaultWindowFor(c, 2027)).toEqual({ start: "02-05", end: "02-09" }); // Páscoa 28/03/2027
    expect(c.datesFor(2027).occasionMd).toBe("02-09");
  });

  it("as janelas padrão não se sobrepõem (em 2026–2028), então nunca competem", () => {
    for (const year of [2026, 2027, 2028]) {
      for (let day = 0; day < 366; day++) {
        const d = new Date(year, 0, 1 + day);
        if (d.getFullYear() !== year) break;
        const on = SEASONAL_THEMES.filter((t) => isInWindow(d, defaultWindowFor(t, year)));
        expect(on.map((t) => t.id), toMd(d)).toSatisfy((ids: string[]) => ids.length <= 1);
      }
    }
  });
});

describe("applyOverride (título, emoji e dia salvos pelo admin)", () => {
  const confete = getTheme("confete")!;

  it("sem override devolve o próprio tema", () => {
    expect(applyOverride(confete, null)).toBe(confete);
    expect(applyOverride(confete, undefined)).toBe(confete);
  });
  it("troca título, emoji e dia; o resto do visual continua", () => {
    const t = applyOverride(confete, { occasion: "  Festa do grupo ", emoji: "🥳", occasionMd: "10-03" });
    expect(t).toMatchObject({ id: "confete", name: "Confete", occasion: "Festa do grupo", emoji: "🥳", occasionMdOverride: "10-03" });
    expect(occasionMdFor(t, new Date(2026, 0, 1))).toBe("10-03");
  });
  it("campos vazios ou inválidos caem no padrão do tema", () => {
    const t = applyOverride(confete, { occasion: "   ", emoji: "", occasionMd: "99-99" });
    expect(t.occasion).toBe("Carnaval");
    expect(t.emoji).toBe("🎊");
    expect(t.occasionMdOverride).toBeUndefined();
  });
  it("limita o tamanho do título e do emoji", () => {
    const t = applyOverride(confete, { occasion: "x".repeat(200), emoji: "y".repeat(50) });
    expect(t.occasion).toHaveLength(60);
    expect(t.emoji).toHaveLength(12);
  });
  it("o dia definido pelo admin vale mesmo num tema móvel (fixo, como o período)", () => {
    const t = applyOverride(confete, { occasionMd: "05-01" });
    expect(occasionMdFor(t, new Date(2026, 8, 1))).toBe("05-01");
  });
});
