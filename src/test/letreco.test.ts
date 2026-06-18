import { describe, it, expect } from "vitest";
import {
  normalize,
  scoreGuess,
  pointsFor,
  isValidWord,
  isPlausibleWord,
  addRuntimeWords,
  getWordOfDay,
  buildShareText,
  WORD_LIST,
  WORD_LENGTH,
  SCORE_BY_ATTEMPT,
} from "@/features/letreco/letrecoLogic";

describe("normalize", () => {
  it("remove acentos e coloca em maiúsculas", () => {
    expect(normalize("ação")).toBe("ACAO");
    expect(normalize("Pôr")).toBe("POR");
    expect(normalize(" cão ")).toBe("CAO");
  });
});

describe("scoreGuess", () => {
  it("marca verdes na posição certa", () => {
    expect(scoreGuess("AMORA", "AMORA")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("marca amarelo para letra existente em outra posição", () => {
    // resposta CASAL, palpite SALSA
    const r = scoreGuess("SALSA", "CASAL");
    expect(r).toHaveLength(5);
    // sem letra ausente que exista na resposta sendo cinza indevidamente
    expect(r[0]).toBe("present"); // S existe
  });

  it("respeita a contagem de letras repetidas (não pinta amarelo a mais)", () => {
    // resposta CASAL tem um único S; palpite com dois S
    const r = scoreGuess("SISSO".slice(0, 5), "CASAL");
    const sStatuses = ["S", "I", "S", "S", "O"]
      .map((_, i) => r[i])
      .filter((_, i) => "SISSO"[i] === "S");
    const greenOrYellow = sStatuses.filter((s) => s !== "absent").length;
    expect(greenOrYellow).toBeLessThanOrEqual(1);
  });
});

describe("pointsFor", () => {
  it("dá mais pontos quanto antes acerta", () => {
    expect(pointsFor(1)).toBe(SCORE_BY_ATTEMPT[0]);
    expect(pointsFor(5)).toBe(SCORE_BY_ATTEMPT[4]);
    expect(pointsFor(1)).toBeGreaterThan(pointsFor(5));
  });
  it("retorna 0 fora da faixa", () => {
    expect(pointsFor(0)).toBe(0);
    expect(pointsFor(6)).toBe(0);
  });
});

describe("WORD_LIST / isValidWord", () => {
  it("todas as palavras têm 5 letras", () => {
    expect(WORD_LIST.length).toBeGreaterThan(100);
    expect(WORD_LIST.every((w) => w.length === WORD_LENGTH)).toBe(true);
  });
  it("valida palavra da lista e rejeita fora dela", () => {
    expect(isValidWord(WORD_LIST[0])).toBe(true);
    expect(isValidWord("ZZZZZ")).toBe(false);
    expect(isValidWord("abc")).toBe(false);
  });
});

describe("isPlausibleWord", () => {
  it("aceita palavras com cara de português", () => {
    for (const w of ["PRATO", "LIVRO", "CAIXA", "ABACO", "FELIZ"]) {
      expect(isPlausibleWord(w)).toBe(true);
    }
  });
  it("rejeita sequências aleatórias / sem vogal", () => {
    for (const w of ["QWERT", "ASDFG", "ZXCVB", "BCDFG", "BRTML"]) {
      expect(isPlausibleWord(w)).toBe(false);
    }
  });
  it("rejeita letra repetida demais", () => {
    expect(isPlausibleWord("AAAAA")).toBe(false);
    expect(isPlausibleWord("AAAAB")).toBe(false);
    expect(isPlausibleWord("LLLAA")).toBe(false);
  });
  it("rejeita tamanho diferente de 5", () => {
    expect(isPlausibleWord("CASA")).toBe(false);
    expect(isPlausibleWord("CADEIRA")).toBe(false);
  });
});

describe("addRuntimeWords", () => {
  it("amplia a validação sem afetar o pool de respostas", () => {
    const novel = "XPTOZ"; // não está no words.txt
    expect(isValidWord(novel)).toBe(false);
    addRuntimeWords([novel, "ab", "TOOLONGWORD"]); // só a de 5 letras entra
    expect(isValidWord(novel)).toBe(true);
    expect(isValidWord(novel.toLowerCase())).toBe(true);
    // não vira resposta do dia (pool continua só o words.txt)
    expect(WORD_LIST).not.toContain(novel);
  });
});

describe("getWordOfDay", () => {
  it("é determinística por data e está na lista", () => {
    const d = new Date("2026-06-17T12:00:00Z");
    const w1 = getWordOfDay(d);
    const w2 = getWordOfDay(new Date("2026-06-17T23:00:00Z"));
    expect(w1).toBe(w2);
    expect(WORD_LIST).toContain(w1);
  });
  it("muda de um dia para o outro", () => {
    const a = getWordOfDay(new Date("2026-06-17T12:00:00Z"));
    const b = getWordOfDay(new Date("2026-06-18T12:00:00Z"));
    expect(a).not.toBe(b);
  });
});

describe("buildShareText", () => {
  it("gera grade em emojis sem revelar a palavra", () => {
    const answer = "AMORA";
    const text = buildShareText(["AMIGO", "AMORA"], answer, true, "2026-06-17");
    expect(text).toContain("2/5");
    expect(text).toContain("🟩");
    expect(text).not.toContain(answer);
  });
});
