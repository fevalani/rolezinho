// Lógica pura do editor de título/dia dos temas (sem tela, testável).
import { toMd } from "./themes";

export const MAX_DAYS_BEFORE = 30;

/** Dias de antecedência entre o início do período e o dia comemorativo (0..30). */
export function daysBetween(startMd: string, dayMd: string): number {
  const at = (md: string) =>
    new Date(2028, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5))); // 2028: bissexto
  let diff = Math.round((at(dayMd).getTime() - at(startMd).getTime()) / 86_400_000);
  if (diff < 0) diff += 366; // período que atravessa a virada do ano
  return Math.min(Math.max(diff, 0), MAX_DAYS_BEFORE);
}

/** "MM-DD" do dia `n` dias antes de `dayMd` (volta o ano se preciso). */
export function daysBefore(dayMd: string, n: number): string {
  return toMd(
    new Date(2028, Number(dayMd.slice(0, 2)) - 1, Number(dayMd.slice(3, 5)) - n),
  );
}
