import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { FronteirasGame } from "@/features/letreco/FronteirasGame";
import { WORLD, PAIRS, GRAPH } from "@/features/letreco/fronteirasData";
import {
  bfsDistances,
  intermediatesCount,
  maxGuessesFor,
  pairOfDay,
  shortestPathNodes,
  type Graph,
} from "@/features/letreco/fronteirasLogic";
import { loginAs, renderWithProviders } from "./helpers";

const nameOf = (iso: string) => WORLD.countries.find((c) => c.iso === iso)!.name;

/** Menor rota que NÃO usa nenhum país do caminho mínimo (devolve só os intermediários). */
function detour(from: string, to: string, onPath: Set<string>): string[] | null {
  const g: Graph = new Map();
  for (const [iso, ns] of GRAPH) {
    if (onPath.has(iso) && iso !== from && iso !== to) continue;
    g.set(iso, ns.filter((n) => !onPath.has(n) || n === from || n === to));
  }
  const prev = new Map<string, string | null>([[from, null]]);
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    for (const n of g.get(q[h]) ?? []) {
      if (!prev.has(n)) {
        prev.set(n, q[h]);
        q.push(n);
      }
    }
  }
  if (!prev.has(to)) return null;
  const mids: string[] = [];
  for (let c = prev.get(to)!; c && c !== from; c = prev.get(c)!) mids.unshift(c);
  return mids;
}

/** Primeiro dia cujo par tem um desvio 1–3 países mais longo que o mínimo. */
function pickDay() {
  for (let d = 0; d < PAIRS.length; d++) {
    const date = new Date(Date.UTC(2027, 0, 1 + d, 15));
    const [from, to] = pairOfDay(PAIRS, date);
    const onPath = shortestPathNodes(GRAPH, from, to) as Set<string>;
    const optimal = intermediatesCount(GRAPH, from, to) as number;
    const alt = detour(from, to, onPath);
    if (alt && alt.length >= optimal + 1 && alt.length <= optimal + 3) {
      return { date, from, to, optimal, alt };
    }
  }
  throw new Error("nenhum par com desvio");
}

describe("Fronteiras — rota mais longa que o mínimo", () => {
  const day = pickDay();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(day.date);
  });
  afterEach(() => vi.useRealTimers());

  it("fechar o percurso por outra rota vence, com menos pontos", async () => {
    loginAs();
    renderWithProviders(<FronteirasGame />);
    const input = await screen.findByLabelText("Palpite de país");
    for (const iso of day.alt) {
      fireEvent.change(input, { target: { value: nameOf(iso) } });
      fireEvent.click(await screen.findByRole("button", { name: nameOf(iso) }));
    }
    const extra = day.alt.length - day.optimal;
    const expected = 100 - 15 * extra;
    expect(await screen.findByText(new RegExp(`Conectou! \\+${expected} pts`))).toBeInTheDocument();
    expect(screen.getByText(`Você usou ${day.alt.length} palpites; o mínimo era ${day.optimal}.`)).toBeInTheDocument();
    expect(screen.getByText(/Exemplo de caminho mais curto:/)).toBeInTheDocument();
    // o exemplo é UM caminho (contorno dourado), e não pinta de verde países que você não chutou
    expect(document.querySelectorAll("path[data-revealed]")).toHaveLength(day.optimal);
  });

  it("a rota longa respeita o limite de palpites do dia", () => {
    expect(day.alt.length).toBeLessThanOrEqual(maxGuessesFor(day.optimal));
    expect(bfsDistances(GRAPH, day.from).get(day.to)).toBe(day.optimal + 1);
  });
});
