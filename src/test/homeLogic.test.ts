import { describe, it, expect } from "vitest";
import {
  daysUntilYmd,
  filterBirthdaysToday,
  findNextBirthday,
  firstNames,
  formatConfirmed,
  formatCountdown,
  getTodayMD,
  getTodayYMD,
} from "@/features/home/homeLogic";
import type { BirthdayPerson } from "@/features/home/homeTypes";

const person = (id: string, name: string, birthday: string): BirthdayPerson => ({
  id,
  display_name: name,
  avatar_url: null,
  birthday,
});
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("datas de hoje", () => {
  it("getTodayMD e getTodayYMD com zero à esquerda", () => {
    expect(getTodayMD(day(2026, 3, 5))).toBe("03-05");
    expect(getTodayYMD(day(2026, 3, 5))).toBe("2026-03-05");
    expect(getTodayYMD(day(2026, 12, 31))).toBe("2026-12-31");
  });
});

describe("daysUntilYmd", () => {
  const today = day(2026, 11, 19);
  it("conta dias inteiros (hoje, amanhã, futuro, passado)", () => {
    expect(daysUntilYmd("2026-11-19", today)).toBe(0);
    expect(daysUntilYmd("2026-11-20", today)).toBe(1);
    expect(daysUntilYmd("2026-12-25", today)).toBe(36);
    expect(daysUntilYmd("2026-11-18", today)).toBe(-1);
  });
  it("não erra na virada do horário de verão (dia de 23h/25h)", () => {
    expect(daysUntilYmd("2026-11-08", day(2026, 10, 30))).toBe(9);
    expect(daysUntilYmd("2026-03-30", day(2026, 3, 1))).toBe(29);
  });
});

describe("formatCountdown / formatConfirmed", () => {
  it("hoje, amanhã e em Nd", () => {
    expect(formatCountdown(0)).toBe("hoje");
    expect(formatCountdown(1)).toBe("amanhã");
    expect(formatCountdown(12)).toBe("em 12d");
  });
  it("singular, plural e nada quando ninguém confirmou", () => {
    expect(formatConfirmed(0)).toBeNull();
    expect(formatConfirmed(1)).toBe("1 confirmou");
    expect(formatConfirmed(4)).toBe("4 confirmaram");
  });
});

describe("filterBirthdaysToday", () => {
  it("pega só quem faz aniversário hoje, qualquer ano de nascimento", () => {
    const ps = [person("a", "Ana", "1990-11-19"), person("b", "Bia", "2001-11-19"), person("c", "Caio", "1990-11-20")];
    expect(filterBirthdaysToday(ps, day(2026, 11, 19)).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("findNextBirthday", () => {
  const today = day(2026, 11, 19);

  it("sem perfis, ou sem data válida, não há próximo", () => {
    expect(findNextBirthday([], today)).toBeNull();
    expect(findNextBirthday([person("a", "Ana", ""), person("b", "Bia", "x")], today)).toBeNull();
  });

  it("escolhe o mais próximo e informa a data e os dias", () => {
    const ps = [person("a", "Ana", "1990-12-25"), person("b", "Bia", "1995-11-25"), person("c", "Caio", "2000-01-01")];
    expect(findNextBirthday(ps, today)).toMatchObject({ md: "11-25", daysUntil: 6, people: [{ id: "b" }] });
  });

  it("hoje não conta (quem faz hoje só volta daqui a um ano)", () => {
    const ps = [person("a", "Ana", "1990-11-19"), person("b", "Bia", "1995-12-01")];
    expect(findNextBirthday(ps, today)).toMatchObject({ md: "12-01", daysUntil: 12 });
  });

  it("vira o ano: em dezembro o próximo pode ser em janeiro", () => {
    const ps = [person("a", "Ana", "1990-01-03")];
    expect(findNextBirthday(ps, day(2026, 12, 30))).toMatchObject({ md: "01-03", daysUntil: 4 });
  });

  it("agrupa quem faz no mesmo dia", () => {
    const ps = [person("a", "Ana", "1990-12-01"), person("b", "Bia", "1999-12-01"), person("c", "Caio", "1990-12-02")];
    const r = findNextBirthday(ps, today)!;
    expect(r.people.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("29/02 em ano não bissexto cai em 28/02 (e não em 01/03)", () => {
    const ps = [person("a", "Ana", "2000-02-29"), person("b", "Bia", "1990-03-01")];
    const r = findNextBirthday(ps, day(2027, 2, 20))!;
    expect(r).toMatchObject({ md: "02-28", daysUntil: 8 });
    expect(r.people.map((p) => p.id)).toEqual(["a"]);
  });

  it("29/02 em ano bissexto cai em 29/02", () => {
    expect(findNextBirthday([person("a", "Ana", "2000-02-29")], day(2028, 2, 20))).toMatchObject({ md: "02-29", daysUntil: 9 });
  });
});

describe("firstNames", () => {
  it("usa só o primeiro nome, separados por vírgula", () => {
    expect(firstNames([person("a", "Ana Maria Souza", "1990-01-01"), person("b", "Bia", "1990-01-01")])).toBe("Ana, Bia");
  });
});
