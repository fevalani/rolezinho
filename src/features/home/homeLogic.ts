import type { BirthdayPerson, NextBirthday } from "./homeTypes";

const DAY_MS = 86_400_000;

/** Hoje à meia-noite, no fuso local. */
export function getLocalToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "MM-DD" de hoje, para comparar com o sufixo do birthday "YYYY-MM-DD". */
export function getTodayMD(today = getLocalToday()): string {
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** "YYYY-MM-DD" de hoje (formato de `event_date`). */
export function getTodayYMD(today = getLocalToday()): string {
  return `${today.getFullYear()}-${getTodayMD(today)}`;
}

/** Dias inteiros entre hoje e uma data "YYYY-MM-DD" (negativo se já passou). */
export function daysUntilYmd(dateStr: string, today = getLocalToday()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** "hoje" | "amanhã" | "em 5d". */
export function formatCountdown(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days}d`;
}

/** "1 confirmou" | "3 confirmaram" | null quando ninguém confirmou. */
export function formatConfirmed(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 confirmou" : `${count} confirmaram`;
}

/**
 * Próxima ocorrência (a partir de amanhã) de um aniversário em `year`/`today`.
 * 29/02 em ano não bissexto vira 28/02 (em vez de "rolar" para 01/03).
 */
function nextOccurrence(month: number, day: number, today: Date): Date {
  const at = (year: number) => {
    const lastDay = new Date(year, month, 0).getDate(); // último dia do mês
    return new Date(year, month - 1, Math.min(day, lastDay));
  };
  const thisYear = at(today.getFullYear());
  return thisYear < today ? at(today.getFullYear() + 1) : thisYear;
}

/** Quem faz aniversário hoje. */
export function filterBirthdaysToday(
  profiles: BirthdayPerson[],
  today = getLocalToday(),
): BirthdayPerson[] {
  const md = getTodayMD(today);
  return profiles.filter((p) => p.birthday?.slice(5, 10) === md);
}

/**
 * Próximo aniversário depois de hoje (hoje não conta) e quem faz nessa data.
 * Ignora perfis sem data ou com data malformada.
 */
export function findNextBirthday(
  profiles: BirthdayPerson[],
  today = getLocalToday(),
): NextBirthday | null {
  let minDays = Infinity;
  let bestMd = "";
  let bestPeople: BirthdayPerson[] = [];

  for (const p of profiles) {
    if (!p.birthday || p.birthday.length < 10) continue;
    const [, mm, dd] = p.birthday.split("-").map(Number);
    if (!mm || !dd) continue;

    const next = nextOccurrence(mm, dd, today);
    const days = Math.round((next.getTime() - today.getTime()) / DAY_MS);
    if (days <= 0) continue;

    const md = getTodayMD(next);
    if (days < minDays) {
      minDays = days;
      bestMd = md;
      bestPeople = [p];
    } else if (days === minDays) {
      bestPeople.push(p);
    }
  }

  return bestPeople.length > 0
    ? { md: bestMd, daysUntil: minDays, people: bestPeople }
    : null;
}

/** Nomes curtos ("Ana, Bia") para o card de aniversário. */
export function firstNames(people: BirthdayPerson[]): string {
  return people.map((p) => p.display_name.split(" ")[0]).join(", ");
}
