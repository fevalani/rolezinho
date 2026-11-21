import { describe, it, expect } from "vitest";
import {
  buildMentiras,
  buildRankings,
  fmtDate,
  fmtDuration,
  fmtMonth,
  parseChatStats,
  peakIndex,
  peakSummary,
  topPairs,
} from "@/features/chatstats/chatStatsLogic";
import { MENTIRAS, RAW } from "./chatStatsFixtures";
import type { ChatStats, ChatStatsPerson } from "@/features/chatstats/chatStatsTypes";

const person = (name: string, over: Partial<ChatStatsPerson> = {}): ChatStatsPerson => ({
  name, messages: 0, share: 0, avgChars: null, medianResponseSec: null, starts: 0, enders: 0, questionRate: null,
  nightMessages: 0, audio: 0, stickers: 0, photos: 0, laughPercent: null, signatureEmoji: null, ...over,
});

const stats = () => parseChatStats(RAW).stats as ChatStats;

describe("parseChatStats", () => {
  it("aceita o mínimo e normaliza os opcionais", () => {
    const { stats: s, errors } = parseChatStats(RAW);
    expect(errors).toEqual([]);
    expect(s).toMatchObject({ slug: "2026", isActive: false, topics: null, longestStreak: null, catchphrases: [] });
    expect(s!.people[2]).toMatchObject({ name: "Caio", medianResponseSec: null, audio: 0, signatureEmoji: null });
  });
  it("rejeita o que não é objeto, slug ruim, arrays de tamanho errado e sem pessoas", () => {
    expect(parseChatStats(null).errors[0]).toMatch(/objeto/);
    expect(parseChatStats({ ...RAW, slug: "../x" }).errors.join()).toMatch(/slug/);
    expect(parseChatStats({ ...RAW, byHour: [1, 2] }).errors.join()).toMatch(/byHour/);
    expect(parseChatStats({ ...RAW, byWeekday: ["a", 1, 1, 1, 1, 1, 1] }).errors.join()).toMatch(/byWeekday/);
    expect(parseChatStats({ ...RAW, people: [] }).errors.join()).toMatch(/pessoa/);
    expect(parseChatStats({ ...RAW, totalMessages: undefined }).errors.join()).toMatch(/totalMessages/);
    expect(parseChatStats({ ...RAW, byHour: undefined }).stats).toBeNull();
  });
  it("descarta pessoa sem nome com aviso, e NaN/Infinity viram 0/null", () => {
    const r = parseChatStats({ ...RAW, people: [...RAW.people, { name: " " }, { name: "Dani", messages: Infinity, avgChars: NaN }] });
    expect(r.warnings.join()).toMatch(/sem nome/);
    expect(r.stats!.people.map((p) => p.name)).toEqual(["Ana", "Beto", "Caio", "Dani"]);
    expect(r.stats!.people[3]).toMatchObject({ messages: 0, avgChars: null });
  });
  it("topics: lê, descarta categorias vazias e avisa quando inválido", () => {
    const topics = { categories: [{ name: "Esporte", messages: 5, conversations: 1, share: 50 }, { name: "" }], byMonth: [{ month: "2026-03", top: "Esporte" }, { month: "" }], byPerson: [{ name: "Ana", categories: [{ name: "Esporte", messages: 3 }] }], highlights: [{ label: "Final", category: "Esporte", date: "2026-03-01", messages: 9 }] };
    expect(parseChatStats({ ...RAW, topics }).stats!.topics!.categories).toHaveLength(1);
    const bad = parseChatStats({ ...RAW, topics: { categories: [] } });
    expect(bad.stats!.topics).toBeNull();
    expect(bad.warnings.join()).toMatch(/topics/);
  });
  it("trunca título longo e lê isActive/longestStreak", () => {
    const s = parseChatStats({ ...RAW, title: "x".repeat(300), isActive: true, longestStreak: { days: 4, start: "2026-01-10", end: "2026-01-13" } }).stats!;
    expect(s.title).toHaveLength(100);
    expect(s).toMatchObject({ isActive: true, longestStreak: { days: 4 } });
    expect(parseChatStats({ ...RAW, longestStreak: { days: 0 } }).stats!.longestStreak).toBeNull();
  });
});

describe("formatação", () => {
  it("fmtDuration", () => {
    expect([40, 60, 90, 3600, 5400].map(fmtDuration)).toEqual(["40 s", "1 min", "1 min 30 s", "1 h", "1 h 30 min"]);
  });
  it("fmtMonth e fmtDate tolerantes", () => {
    expect(fmtMonth("2026-03")).toBe("mar/26");
    expect(fmtMonth("2026-13")).toBe("2026-13");
    expect(fmtDate("2026-03-14")).toBe("14/03/2026");
    expect(fmtDate("2026-11-01T00:00:00+00:00")).toBe("01/11/2026");
    expect(fmtDate("ontem")).toBe("ontem");
  });
});

describe("rankings", () => {
  it("ordena, formata e omite rankings sem dados", () => {
    const r = buildRankings(stats());
    const by = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(by.talkers.rows.map((x) => x.name)).toEqual(["Ana", "Beto", "Caio"]);
    expect(by.ghosts.rows[0].name).toBe("Caio");
    expect(by.fast.rows.map((x) => x.name)).toEqual(["Ana", "Beto"]);
    expect(by.fast.rows[0].label).toBe("45 s");
    expect(by.slow.rows[0]).toMatchObject({ name: "Beto", label: "10 min" });
    expect(by.starters.rows[0].name).toBe("Ana");
    expect(by.enders.rows[0].name).toBe("Beto");
    expect(by.audio.rows).toHaveLength(1);
    expect(by.stickers).toBeUndefined();
    expect(by.funny).toBeUndefined();
  });
  it("valor 0 não ranqueia (exceto os calados) e o limite n vale", () => {
    const s = { ...stats(), people: [person("A", { messages: 5, audio: 0 }), person("B", { messages: 3, audio: 0 })] };
    const keys = buildRankings(s).map((x) => x.key);
    expect(keys).not.toContain("audio");
    expect(buildRankings({ ...s, people: ["a", "b", "c", "d", "e", "f", "g"].map((n, i) => person(n, { messages: i + 1 })) }, 3).find((x) => x.key === "talkers")!.rows).toHaveLength(3);
  });
  it("empate desempata por nome (determinístico)", () => {
    const s = { ...stats(), people: [person("Zé", { messages: 5 }), person("Ana", { messages: 5 })] };
    expect(buildRankings(s).find((x) => x.key === "talkers")!.rows.map((r) => r.name)).toEqual(["Ana", "Zé"]);
  });
});

describe("pico e duplas", () => {
  it("peakIndex", () => {
    expect(peakIndex([1, 9, 3])).toBe(1);
    expect(peakIndex([0, 0])).toBe(-1);
    expect(peakIndex([])).toBe(-1);
    expect(peakIndex([4, 4])).toBe(0);
  });
  it("peakSummary", () => {
    expect(peakSummary(stats())).toBe("Horário de pico: 22h · dia mais movimentado: sexta");
    expect(peakSummary({ ...stats(), byHour: Array(24).fill(0) })).toBeNull();
  });
  it("topPairs soma as duas direções", () => {
    expect(topPairs(stats())).toEqual([
      { a: "Ana", b: "Beto", count: 35 },
      { a: "Ana", b: "Caio", count: 5 },
    ]);
    expect(topPairs(stats(), 1)).toHaveLength(1);
  });
});

describe("mentiras confirmadas", () => {
  const withM = (m: unknown) => parseChatStats({ ...RAW, mentiras: m }).stats as ChatStats;

  it("parse: lê os casos e normaliza o desfecho desconhecido para admitted", () => {
    const s = withM({ episodes: [...MENTIRAS.episodes, { ...MENTIRAS.episodes[0], outcome: "xx" }] });
    expect(s.mentiras!.episodes).toHaveLength(4);
    expect(s.mentiras!.episodes[1].outcome).toBe("proven_false");
    expect(s.mentiras!.episodes[3].outcome).toBe("admitted");
  });
  it("parse: descarta caso incompleto, sem nomes ou com a mesma pessoa nos dois papéis", () => {
    const base = MENTIRAS.episodes[0];
    const s = withM({ episodes: [base, { ...base, claim: "" }, { ...base, resolution: "" }, { ...base, claimant: " " }, { ...base, contester: "Ana" }] });
    expect(s.mentiras!.episodes).toHaveLength(1);
  });
  it("parse: sem casos ou formato errado vira null", () => {
    expect(withM({ episodes: [] }).mentiras).toBeNull();
    expect(withM("x").mentiras).toBeNull();
    expect(stats().mentiras).toBeNull();
  });
  it("ranking conta casos por quem afirmou, desempata por nome e usa singular/plural", () => {
    const v = buildMentiras(withM(MENTIRAS))!;
    expect(v.ranking).toEqual([{ name: "Ana", count: 2, label: "2 casos" }, { name: "Beto", count: 1, label: "1 caso" }]);
  });
  it("casos vêm do mais recente ao mais antigo", () => {
    expect(buildMentiras(withM(MENTIRAS))!.episodes.map((e) => e.date)).toEqual(["2026-05-10", "2026-04-02", "2026-03-01"]);
  });
  it("sem nada aprovado devolve null e o limite n vale", () => {
    expect(buildMentiras(stats())).toBeNull();
    const eps = ["a", "b", "c", "d"].map((n) => ({ ...MENTIRAS.episodes[0], claimant: n, contester: "z" }));
    expect(buildMentiras(withM({ episodes: eps }), 2)!.ranking).toHaveLength(2);
  });
});
