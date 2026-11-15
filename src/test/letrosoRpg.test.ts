import { describe, it, expect } from "vitest";
import {
  letrosoPointsFor,
  getLetrosoGameDate,
  getLetrosoWordOfDay,
  getLetrosoPracticeWord,
  scoreLetrosoGuess,
  aggregateLetrosoKeyStatuses,
  buildLetrosoShareText,
  LETROSO_WORDS,
} from "@/features/letreco/letrosoLogic";
import { getModifier, formatModifier } from "@/features/rpg/rpgTypes";

describe("letrosoPointsFor", () => {
  it.each([
    [1, 200],
    [2, 160],
    [3, 120],
    [4, 90],
    [5, 60],
    [6, 40],
    [7, 35],
    [10, 20],
  ])("tentativa %i vale %i", (n, pts) => {
    expect(letrosoPointsFor(n)).toBe(pts);
  });
  it("nunca cai abaixo de 10 e nunca aumenta", () => {
    expect(letrosoPointsFor(50)).toBe(10);
    for (let i = 1; i < 20; i++)
      expect(letrosoPointsFor(i + 1)).toBeLessThanOrEqual(letrosoPointsFor(i));
  });
  it("tentativa 0 ou negativa conta como a primeira", () => {
    expect(letrosoPointsFor(0)).toBe(200);
  });
});

describe("data e palavra do dia (Letroso)", () => {
  it("usa o fuso de São Paulo", () => {
    // 02:00 UTC de 10/12 ainda é 23:00 de 09/12 em São Paulo
    expect(getLetrosoGameDate(new Date("2026-12-10T02:00:00Z"))).toBe("2026-12-09");
    expect(getLetrosoGameDate(new Date("2026-12-10T12:00:00Z"))).toBe("2026-12-10");
  });
  it("a palavra do dia é a mesma durante o dia e vem do pool", () => {
    const a = getLetrosoWordOfDay(new Date("2026-12-10T12:00:00Z"));
    const b = getLetrosoWordOfDay(new Date("2026-12-10T20:00:00Z"));
    expect(a).toBe(b);
    expect(LETROSO_WORDS).toContain(a);
  });
  it("muda de um dia para o outro", () => {
    const days = new Set(
      Array.from({ length: 10 }, (_, i) =>
        getLetrosoWordOfDay(new Date(Date.UTC(2026, 11, 1 + i, 12))),
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });
  it("o treino nunca devolve a palavra ranqueada do dia", () => {
    const d = new Date("2026-12-10T12:00:00Z");
    const today = getLetrosoWordOfDay(d);
    for (let i = 0; i < 30; i++) expect(getLetrosoPracticeWord(d)).not.toBe(today);
  });
});

describe("scoreLetrosoGuess", () => {
  it("palavra toda certa vira um único bloco", () => {
    expect(scoreLetrosoGuess("gatos", "gatos")).toEqual([
      "block_start",
      "block_mid",
      "block_mid",
      "block_mid",
      "block_end",
    ]);
  });
  it("ignora acentos e maiúsculas", () => {
    expect(scoreLetrosoGuess("AÇÃO", "acao")).toEqual([
      "block_start",
      "block_mid",
      "block_mid",
      "block_end",
    ]);
  });
  it("letra certa isolada é 'solo'", () => {
    expect(scoreLetrosoGuess("axyz", "abcd")).toEqual(["solo", "absent", "absent", "absent"]);
  });
  it("letra em outra posição é 'present'; ausente é 'absent'", () => {
    expect(scoreLetrosoGuess("bxxx", "abcd")).toEqual(["present", "absent", "absent", "absent"]);
  });
  it("letra repetida só vale quantas vezes existir na resposta", () => {
    // resposta tem um só 'o': o 1º é certo, o 2º não pode ser 'present'
    const r = scoreLetrosoGuess("ooxx", "oyyy");
    expect(r[0]).toBe("solo");
    expect(r[1]).toBe("absent");
  });
  it("blocos consecutivos no meio", () => {
    expect(scoreLetrosoGuess("xabx", "yaby")).toEqual(["absent", "block_start", "block_end", "absent"]);
  });
  it("grupos certos no começo E no fim formam a cápsula", () => {
    expect(scoreLetrosoGuess("abxcd", "abycd")).toEqual([
      "cap_s",
      "cap_s_end",
      "absent",
      "cap_e",
      "cap_e_end",
    ]);
  });
  it("só um grupo certo no começo não é cápsula", () => {
    expect(scoreLetrosoGuess("abxy", "abcd")).toEqual(["block_start", "block_end", "absent", "absent"]);
  });
});

describe("aggregateLetrosoKeyStatuses", () => {
  it("guarda o melhor status de cada letra entre os palpites", () => {
    const m = aggregateLetrosoKeyStatuses(["abxx", "xaxx"], "bacd");
    expect(m.A).toBe("correct");
    expect(m.B).toBe("present");
    expect(m.X).toBe("absent");
  });
  it("sem palpites = vazio", () => {
    expect(aggregateLetrosoKeyStatuses([], "gato")).toEqual({});
  });
});

describe("buildLetrosoShareText", () => {
  it("vitória mostra o número de tentativas e a grade", () => {
    const t = buildLetrosoShareText(["abcd", "bacd"], "bacd", true, "2026-12-10");
    expect(t.split("\n")[0]).toBe("Letroso 2026-12-10 — 2 tentativas");
    expect(t.split("\n")[2]).toBe("🟩🟩🟩🟩");
    expect(t.split("\n")[1]).toBe("🟨🟨🟩🟩");
  });
  it("derrota usa X", () => {
    expect(buildLetrosoShareText(["zzzz"], "bacd", false, "2026-12-10")).toContain("— X tentativas");
  });
});

describe("modificador de atributo (D&D)", () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [20, 5],
  ])("atributo %i → %i", (score, mod) => {
    expect(getModifier(score)).toBe(mod);
  });
  it("formatModifier mostra o sinal", () => {
    expect(formatModifier(10)).toBe("+0");
    expect(formatModifier(14)).toBe("+2");
    expect(formatModifier(6)).toBe("-2");
  });
});
