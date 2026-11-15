import { describe, it, expect } from "vitest";
import {
  OCCASION_LIMITS,
  OCCASION_SEASON,
  daysBefore,
  graphemes,
  isOccasionActive,
  isOccasionThemeId,
  normalizeOccasion,
  occasionThemeId,
  occasionToTheme,
  occasionWindow,
  parseExtras,
  type Occasion,
} from "@/lib/seasonal/occasions";
import { occasionMdFor, isInWindow } from "@/lib/seasonal/themes";

const base: Occasion = {
  id: "o1",
  title: "Dia dos Namorados",
  emoji: "💘",
  extras: ["❤️", "💕"],
  dayMd: "06-12",
  daysBefore: 3,
  jumble: false,
  enabled: true,
};

describe("graphemes / parseExtras", () => {
  it("emoji composto conta como um item só", () => {
    expect(graphemes("👨‍👩‍👧❤️")).toEqual(["👨‍👩‍👧", "❤️"]);
    expect(graphemes("✊🏿")).toEqual(["✊🏿"]);
  });
  it("aceita espaços, vírgulas ou tudo junto", () => {
    expect(parseExtras("🎉 🎈,🎊")).toEqual(["🎉", "🎈", "🎊"]);
    expect(parseExtras("🎉🎈🎊")).toEqual(["🎉", "🎈", "🎊"]);
    expect(parseExtras("  ,  ")).toEqual([]);
  });
  it("letras também valem (tema da dislexia)", () => {
    expect(parseExtras("b d p q")).toEqual(["b", "d", "p", "q"]);
    expect(parseExtras("bdpq")).toEqual(["b", "d", "p", "q"]);
  });
  it("limita ao que cabe na faixa", () => {
    expect(parseExtras("🍎🍐🍊🍋🍌🍉🍇🍓🫐🍒")).toHaveLength(OCCASION_LIMITS.extras);
  });
});

describe("datas da ocasião", () => {
  it("daysBefore volta N dias (mês, ano e 29/02)", () => {
    expect(daysBefore("06-12", 3)).toBe("06-09");
    expect(daysBefore("03-01", 1)).toBe("02-29");
    expect(daysBefore("01-02", 4)).toBe("12-29");
    expect(daysBefore("10-03", 0)).toBe("10-03");
  });
  it("a janela vai de N dias antes até o dia", () => {
    expect(occasionWindow(base)).toEqual({ start: "06-09", end: "06-12" });
    expect(occasionWindow({ dayMd: "11-16", daysBefore: 0 })).toEqual({ start: "11-16", end: "11-16" });
    expect(occasionWindow({ dayMd: "01-02", daysBefore: 4 })).toEqual({ start: "12-29", end: "01-02" });
  });
  it("só está ativa dentro da janela e se estiver ligada", () => {
    expect(isOccasionActive(base, new Date(2026, 5, 9))).toBe(true);
    expect(isOccasionActive(base, new Date(2026, 5, 12))).toBe(true);
    expect(isOccasionActive(base, new Date(2026, 5, 8))).toBe(false);
    expect(isOccasionActive(base, new Date(2026, 5, 13))).toBe(false);
    expect(isOccasionActive({ ...base, enabled: false }, new Date(2026, 5, 10))).toBe(false);
  });
  it("vale todo ano (o ano é ignorado)", () => {
    expect(isOccasionActive(base, new Date(2031, 5, 10))).toBe(true);
  });
});

describe("normalizeOccasion", () => {
  const ok = { title: "  Halloween ", emoji: "🎃", extras: "👻 🦇", dayMd: "10-31", daysBefore: 5 };
  it("limpa o texto e devolve a ocasião pronta", () => {
    const r = normalizeOccasion(ok);
    expect(r.error).toBeUndefined();
    expect(r.occasion).toEqual({
      title: "Halloween", emoji: "🎃", extras: ["👻", "🦇"], dayMd: "10-31", daysBefore: 5, jumble: false, enabled: true,
    });
  });
  it("aceita os extras já em lista, limitando a quantidade", () => {
    const r = normalizeOccasion({ ...ok, extras: Array.from({ length: 20 }, () => "🎈") });
    expect(r.occasion!.extras).toHaveLength(OCCASION_LIMITS.extras);
  });
  it("exige título, emoji e dia válido", () => {
    expect(normalizeOccasion({ ...ok, title: "  " }).error).toBe("Escreva um título.");
    expect(normalizeOccasion({ ...ok, emoji: " " }).error).toBe("Escolha o emoji principal.");
    expect(normalizeOccasion({ ...ok, dayMd: "13-40" }).error).toBe("Escolha o dia da comemoração.");
    expect(normalizeOccasion({ ...ok, dayMd: undefined }).error).toBe("Escolha o dia da comemoração.");
  });
  it("antecedência de 0 a 30", () => {
    expect(normalizeOccasion({ ...ok, daysBefore: 31 }).error).toMatch(/0 a 30/);
    expect(normalizeOccasion({ ...ok, daysBefore: -1 }).error).toMatch(/0 a 30/);
    expect(normalizeOccasion({ ...ok, daysBefore: 30 }).occasion!.daysBefore).toBe(30);
    expect(normalizeOccasion({ ...ok, daysBefore: undefined }).occasion!.daysBefore).toBe(0);
  });
  it("limita título e emoji", () => {
    const r = normalizeOccasion({ ...ok, title: "x".repeat(200), emoji: "🎃".repeat(50) });
    expect(r.occasion!.title).toHaveLength(OCCASION_LIMITS.title);
    expect(graphemes(r.occasion!.emoji).length).toBeLessThanOrEqual(OCCASION_LIMITS.emoji);
  });
  it("mantém jumble e enabled informados", () => {
    const r = normalizeOccasion({ ...ok, jumble: true, enabled: false });
    expect(r.occasion).toMatchObject({ jumble: true, enabled: false });
  });
});

describe("ocasião como tema", () => {
  it("ids com prefixo próprio", () => {
    expect(occasionThemeId("abc")).toBe("oc:abc");
    expect(isOccasionThemeId("oc:abc")).toBe(true);
    expect(isOccasionThemeId("natal")).toBe(false);
    expect(isOccasionThemeId(null)).toBe(false);
    expect(OCCASION_SEASON).toBe("ocasiao");
  });
  it("vira um tema comum: selo, dia e janela vêm da ocasião", () => {
    const t = occasionToTheme({ ...base, jumble: true });
    expect(t).toMatchObject({ id: "oc:o1", occasion: "Dia dos Namorados", emoji: "💘", jumble: true });
    expect(t.occasionData).toEqual({ ...base, jumble: true });
    expect(occasionMdFor(t, new Date(2026, 0, 1))).toBe("06-12");
    expect(isInWindow(new Date(2026, 5, 10), { start: t.datesFor(2026).start, end: t.datesFor(2026).end })).toBe(true);
  });
});
