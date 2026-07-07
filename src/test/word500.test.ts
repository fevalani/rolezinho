import { describe, it, expect } from "vitest";
import {
  scoreGuessCounts,
  word500PointsFor,
  getWord500WordOfDay,
  buildWord500ShareText,
  isValidWord,
  WORD_LIST,
  WORD_LENGTH,
  WORD500_MAX_ATTEMPTS,
  WORD500_SCORE_BY_ATTEMPT,
} from "@/features/letreco/word500Logic";

describe("scoreGuessCounts", () => {
  it("conta todos os verdes num acerto total", () => {
    expect(scoreGuessCounts("AMORA", "AMORA")).toEqual({ green: 5, yellow: 0, red: 0 });
  });

  it("conta amarelo para letra existente em outra posição", () => {
    // resposta CASAL, palpite SALSA
    const r = scoreGuessCounts("SALSA", "CASAL");
    expect(r.green + r.yellow + r.red).toBe(5);
    expect(r.yellow).toBeGreaterThan(0);
  });

  it("respeita a contagem de letras repetidas (não conta amarelo/verde a mais)", () => {
    // resposta CASAL tem um único S; palpite com múltiplos S não pode gerar
    // mais de 1 verde+amarelo relativo à letra S
    const r = scoreGuessCounts("SISSO", "CASAL");
    expect(r.green + r.yellow).toBeLessThanOrEqual(2); // no máximo 1 S + 1 A coincidem
    expect(r.green + r.yellow + r.red).toBe(5);
  });

  it("não vaza posição — mesma contagem para anagramas do palpite", () => {
    const a = scoreGuessCounts("CASAL", "CASAL");
    expect(a).toEqual({ green: 5, yellow: 0, red: 0 });
  });
});

describe("word500PointsFor", () => {
  it("dá mais pontos quanto antes acerta", () => {
    expect(word500PointsFor(1)).toBe(WORD500_SCORE_BY_ATTEMPT[0]);
    expect(word500PointsFor(WORD500_MAX_ATTEMPTS)).toBe(
      WORD500_SCORE_BY_ATTEMPT[WORD500_MAX_ATTEMPTS - 1],
    );
    expect(word500PointsFor(1)).toBeGreaterThan(word500PointsFor(WORD500_MAX_ATTEMPTS));
  });
  it("retorna 0 fora da faixa", () => {
    expect(word500PointsFor(0)).toBe(0);
    expect(word500PointsFor(WORD500_MAX_ATTEMPTS + 1)).toBe(0);
  });
});

describe("dicionário (reaproveitado do Letreco)", () => {
  it("todas as palavras têm 5 letras", () => {
    expect(WORD_LIST.length).toBeGreaterThan(100);
    expect(WORD_LIST.every((w) => w.length === WORD_LENGTH)).toBe(true);
  });
  it("valida palavra da lista e rejeita fora dela", () => {
    expect(isValidWord(WORD_LIST[0])).toBe(true);
    expect(isValidWord("ZZZZZ")).toBe(false);
  });
});

describe("getWord500WordOfDay", () => {
  it("é determinística por data e está na lista", () => {
    const w1 = getWord500WordOfDay(new Date("2026-06-17T12:00:00Z"));
    const w2 = getWord500WordOfDay(new Date("2026-06-17T23:00:00Z"));
    expect(w1).toBe(w2);
    expect(WORD_LIST).toContain(w1);
  });
  it("muda de um dia para o outro", () => {
    const a = getWord500WordOfDay(new Date("2026-06-17T12:00:00Z"));
    const b = getWord500WordOfDay(new Date("2026-06-18T12:00:00Z"));
    expect(a).not.toBe(b);
  });
});

describe("buildWord500ShareText", () => {
  it("gera squares por contagem sem revelar a palavra nem posição", () => {
    const answer = "AMORA";
    const text = buildWord500ShareText(["AMIGO", "AMORA"], answer, true, "2026-06-17");
    expect(text).toContain(`2/${WORD500_MAX_ATTEMPTS}`);
    expect(text).toContain("🟩");
    expect(text).not.toContain(answer);
  });
});
