import { describe, it, expect } from "vitest";
import {
  FRONTEIRAS_EXTRA_GUESSES,
  bfsDistances,
  buildFronteirasShareText,
  buildGraph,
  colorForDistance,
  distanceToPath,
  displayName,
  fold,
  fronteirasScore,
  FRONTEIRAS_DIFFICULTIES,
  getFronteirasGameDate,
  intermediatesCount,
  MAX_MAP_ZOOM,
  clampViewBox,
  fullViewBox,
  isSolved,
  panViewBox,
  zoomViewBox,
  maxGuessesFor,
  pairOfDay,
  resolveCountry,
  searchCountries,
  shortestPath,
  shortestPathNodes,
  validateGuess,
  type Graph,
} from "@/features/letreco/fronteirasLogic";
import type { FronteirasCountry } from "@/features/letreco/fronteirasTypes";
import { WORLD, PAIRS, GRAPH } from "@/features/letreco/fronteirasData";

/** Grafo pequeno: A → D por dois caminhos mínimos (via B ou via C); X pendura em B. */
function edges(list: [string, string][]): Graph {
  const g: Graph = new Map();
  for (const [a, b] of list) {
    g.set(a, [...(g.get(a) ?? []), b]);
    g.set(b, [...(g.get(b) ?? []), a]);
  }
  return g;
}
const G = edges([
  ["A", "B"], ["B", "D"], ["A", "C"], ["C", "D"],
  ["B", "X"], ["X", "Y"], ["Y", "Z"],
]);

describe("caminho mínimo", () => {
  it("bfsDistances mede fronteiras a partir da origem", () => {
    const d = bfsDistances(G, "A");
    expect(d.get("A")).toBe(0);
    expect(d.get("D")).toBe(2);
    expect(d.get("Z")).toBe(4);
  });

  it("shortestPathNodes une todos os caminhos mínimos (inclui extremos)", () => {
    expect([...(shortestPathNodes(G, "A", "D") as Set<string>)].sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("sem caminho devolve null", () => {
    const g = edges([["A", "B"], ["C", "D"]]);
    expect(shortestPathNodes(g, "A", "D")).toBeNull();
    expect(intermediatesCount(g, "A", "D")).toBeNull();
  });

  it("conta intermediários e o limite de palpites (+5)", () => {
    expect(intermediatesCount(G, "A", "D")).toBe(1);
    expect(maxGuessesFor(1)).toBe(1 + FRONTEIRAS_EXTRA_GUESSES);
    expect(maxGuessesFor(1)).toBe(6);
  });
});

describe("shortestPath (exemplo de caminho)", () => {
  it("devolve um caminho mínimo em ordem, com origem e destino", () => {
    const p = shortestPath(G, "A", "D") as string[];
    expect(p).toHaveLength(3);
    expect(p[0]).toBe("A");
    expect(p[2]).toBe("D");
    expect(["B", "C"]).toContain(p[1]);
  });
  it("é determinístico e não mistura caminhos alternativos", () => {
    expect(shortestPath(G, "A", "D")).toEqual(["A", "B", "D"]);
    expect(shortestPath(G, "A", "D")).toEqual(shortestPath(G, "A", "D"));
  });
  it("sem caminho devolve null; vizinhos diretos dão só os extremos", () => {
    expect(shortestPath(edges([["A", "B"], ["C", "D"]]), "A", "D")).toBeNull();
    expect(shortestPath(edges([["A", "D"]]), "A", "D")).toEqual(["A", "D"]);
  });
  it("é de fato um caminho do grafo, com o tamanho mínimo", () => {
    const p = shortestPath(GRAPH, "BR", "FR") as string[];
    for (let i = 0; i < p.length - 1; i++) expect(GRAPH.get(p[i])).toContain(p[i + 1]);
    expect(p.length - 1).toBe(bfsDistances(GRAPH, "BR").get("FR"));
  });
});

describe("cores por distância", () => {
  const onPath = shortestPathNodes(G, "A", "D") as Set<string>;
  const dist = distanceToPath(G, onPath);

  it("distância ao caminho", () => {
    expect(dist.get("B")).toBe(0);
    expect(dist.get("X")).toBe(1);
    expect(dist.get("Y")).toBe(2);
    expect(dist.get("Z")).toBe(3);
  });

  it("colorForDistance: verde, laranja, vermelho e vermelho-escuro", () => {
    expect(colorForDistance(0)).toBe("green");
    expect(colorForDistance(1)).toBe("orange");
    expect(colorForDistance(2)).toBe("red");
    expect(colorForDistance(3)).toBe("darkred");
    expect(colorForDistance(undefined)).toBe("darkred");
  });
});

describe("vitória", () => {
  it("um caminho completo fecha a cadeia (qualquer um dos mínimos)", () => {
    expect(isSolved(G, "A", "D", ["B"])).toBe(true);
    expect(isSolved(G, "A", "D", ["C"])).toBe(true);
  });

  it("sem cadeia contínua não vence", () => {
    expect(isSolved(G, "A", "D", [])).toBe(false);
    expect(isSolved(G, "A", "D", ["X"])).toBe(false);
  });

  it("uma rota MAIS LONGA, com países fora do caminho mínimo, também vence", () => {
    // A–C–E–F–D: 3 intermediários, nenhum deles no caminho mínimo (A–B–D)
    const g = edges([["A", "B"], ["B", "D"], ["A", "C"], ["C", "E"], ["E", "F"], ["F", "D"]]);
    expect(isSolved(g, "A", "D", ["C", "E", "F"])).toBe(true);
    expect(isSolved(g, "A", "D", ["C", "E"])).toBe(false); // falta fechar até o destino
  });

  it("a ordem dos palpites não importa", () => {
    const g = edges([["A", "C"], ["C", "E"], ["E", "D"]]);
    expect(isSolved(g, "A", "D", ["E", "C"])).toBe(true);
  });

  it("palpites soltos (sem ligar origem e destino) não contam", () => {
    const g = edges([["A", "B1"], ["B1", "B2"], ["B2", "D"], ["A", "C1"], ["C1", "C2"], ["C2", "D"]]);
    expect(isSolved(g, "A", "D", ["B1", "C2"])).toBe(false);
    expect(isSolved(g, "A", "D", ["B1", "C2", "B2"])).toBe(true);
  });

  it("origem e destino vizinhos já estão conectados", () => {
    expect(isSolved(edges([["A", "D"]]), "A", "D", [])).toBe(true);
  });
});

describe("validateGuess", () => {
  const valid = new Set(["A", "B", "C", "D", "X"]);
  it("aceita país novo e conhecido", () => {
    expect(validateGuess("B", [], "A", "D", valid)).toBe("ok");
  });
  it("rejeita desconhecido, repetido e origem/destino", () => {
    expect(validateGuess("ZZ", [], "A", "D", valid)).toBe("unknown");
    expect(validateGuess("B", ["B"], "A", "D", valid)).toBe("duplicate");
    expect(validateGuess("A", [], "A", "D", valid)).toBe("endpoint");
    expect(validateGuess("D", [], "A", "D", valid)).toBe("endpoint");
  });
});

describe("pontuação", () => {
  it("100 no mínimo de palpites, −15 por palpite a mais, piso de 10", () => {
    expect(fronteirasScore(3, 3, true)).toBe(100);
    expect(fronteirasScore(4, 3, true)).toBe(85);
    expect(fronteirasScore(8, 3, true)).toBe(25);
    // difícil: ×1,5 sobre a mesma regra; derrota continua 0
    expect(fronteirasScore(3, 3, true, "hard")).toBe(150);
    expect(fronteirasScore(4, 3, true, "hard")).toBe(128);
    expect(fronteirasScore(3, 3, false, "hard")).toBe(0);
    expect(FRONTEIRAS_DIFFICULTIES.hard.scoreMultiplier).toBeGreaterThan(
      FRONTEIRAS_DIFFICULTIES.easy.scoreMultiplier,
    );
    expect(fronteirasScore(40, 3, true)).toBe(10);
  });
  it("derrota não pontua", () => {
    expect(fronteirasScore(8, 3, false)).toBe(0);
  });
  it("palpites a menos que o mínimo não passam de 100", () => {
    expect(fronteirasScore(2, 3, true)).toBe(100);
  });
});

describe("par do dia", () => {
  const day = (iso: string) => new Date(`${iso}T15:00:00Z`);
  it("mesmo dia → mesmo par; dias seguidos → pares diferentes", () => {
    const a = pairOfDay(PAIRS, day("2026-11-15"));
    expect(pairOfDay(PAIRS, new Date("2026-11-15T20:00:00Z"))).toEqual(a);
    expect(pairOfDay(PAIRS, day("2026-11-16"))).not.toEqual(a);
  });
  it("percorre o pool em ciclo", () => {
    const a = pairOfDay(PAIRS, day("2026-11-15"));
    const later = new Date(day("2026-11-15").getTime() + PAIRS.length * 86_400_000);
    expect(pairOfDay(PAIRS, later)).toEqual(a);
  });
  it("a virada do dia segue o fuso de Brasília", () => {
    expect(getFronteirasGameDate(new Date("2026-11-15T02:30:00Z"))).toBe("2026-11-14");
    expect(getFronteirasGameDate(new Date("2026-11-15T03:30:00Z"))).toBe("2026-11-15");
  });
});

describe("busca de países", () => {
  const countries: FronteirasCountry[] = [
    { iso: "CZ", name: "Tchéquia", d: "", borders: [] },
    { iso: "US", name: "Estados Unidos", d: "", borders: [] },
    { iso: "BR", name: "Brasil", d: "", borders: [] },
    { iso: "BO", name: "Bolívia", d: "", borders: [] },
    { iso: "NL", name: "Países Baixos", d: "", borders: [] },
  ];
  it("fold tira acento e caixa", () => {
    expect(fold("  TCHÉQUIA ")).toBe("tchequia");
  });
  it("autocomplete sem acento, começando pelo prefixo", () => {
    expect(searchCountries("tchequ", countries).map((c) => c.iso)).toEqual(["CZ"]);
    // prefixo primeiro (Brasil, Bolívia); "Países Baixos" só casa por trecho, por último
    expect(searchCountries("b", countries).map((c) => c.iso)).toEqual(["BR", "BO", "NL"]);
  });
  it("busca por trecho e por apelido", () => {
    expect(searchCountries("unidos", countries).map((c) => c.iso)).toEqual(["US"]);
    expect(searchCountries("eua", countries).map((c) => c.iso)).toEqual(["US"]);
    expect(searchCountries("holanda", countries).map((c) => c.iso)).toEqual(["NL"]);
  });
  it("não sugere países excluídos e respeita o limite", () => {
    expect(searchCountries("b", countries, new Set(["BR"])).map((c) => c.iso)).toEqual(["BO", "NL"]);
    expect(searchCountries("b", countries, new Set(), 1)).toHaveLength(1);
    expect(searchCountries("   ", countries)).toEqual([]);
  });
  it("resolveCountry casa nome exato (sem acento) ou apelido", () => {
    expect(resolveCountry("tchequia", countries)?.iso).toBe("CZ");
    expect(resolveCountry("EUA", countries)?.iso).toBe("US");
    expect(resolveCountry("bra", countries)).toBeNull();
    expect(resolveCountry("", countries)).toBeNull();
  });
});

describe("compartilhar", () => {
  it("vitória mostra n/max e as cores, sem revelar países", () => {
    expect(buildFronteirasShareText(["darkred", "green", "green"], true, "2026-11-15", 8)).toBe(
      "Fronteiras 2026-11-15 3/8\n🟫🟩🟩",
    );
  });
  it("derrota mostra X", () => {
    expect(buildFronteirasShareText(["red", "orange"], false, "2026-11-15", 6)).toBe(
      "Fronteiras 2026-11-15 X/6\n🟥🟧",
    );
  });
});

describe("zoom e pan do mapa", () => {
  const full = fullViewBox(1000, 500);

  it("aproximar 2x reduz o recorte à metade, mantendo a proporção", () => {
    const vb = zoomViewBox(full, 2, 500, 250, full);
    expect(vb).toEqual({ x: 250, y: 125, w: 500, h: 250 });
  });

  it("o ponto sob o cursor fica parado ao aproximar", () => {
    const vb = zoomViewBox(full, 2, 100, 50, full);
    // (100,50) estava a 10% da largura/altura; continua a 10% no novo recorte
    expect((100 - vb.x) / vb.w).toBeCloseTo(0.1);
    expect((50 - vb.y) / vb.h).toBeCloseTo(0.1);
  });

  it("não passa do zoom máximo nem afasta além do mapa inteiro", () => {
    let vb = full;
    for (let i = 0; i < 40; i++) vb = zoomViewBox(vb, 2, 500, 250, full);
    expect(vb.w).toBeCloseTo(1000 / MAX_MAP_ZOOM);
    for (let i = 0; i < 40; i++) vb = zoomViewBox(vb, 0.5, 500, 250, full);
    expect(vb).toEqual(full);
  });

  it("clampViewBox segura o recorte dentro do mapa", () => {
    expect(clampViewBox({ x: -50, y: -50, w: 500, h: 250 }, full)).toEqual({ x: 0, y: 0, w: 500, h: 250 });
    expect(clampViewBox({ x: 900, y: 400, w: 500, h: 250 }, full)).toEqual({ x: 500, y: 250, w: 500, h: 250 });
  });

  it("arrastar move o recorte no sentido contrário e respeita as bordas", () => {
    const zoomed = { x: 250, y: 125, w: 500, h: 250 };
    expect(panViewBox(zoomed, 100, 50, full)).toEqual({ x: 150, y: 75, w: 500, h: 250 });
    expect(panViewBox(zoomed, -9999, -9999, full)).toEqual({ x: 500, y: 250, w: 500, h: 250 });
  });

  it("sem zoom, arrastar não sai do lugar", () => {
    expect(panViewBox(full, 80, 40, full)).toEqual(full);
  });
});

// ─── Integridade dos dados gerados ─────────────────────────────

describe("dados do mapa (world.json)", () => {
  const isos = new Set(WORLD.countries.map((c) => c.iso));
  it("todo país tem nome pt-BR, forma e códigos únicos", () => {
    expect(isos.size).toBe(WORLD.countries.length);
    for (const c of WORLD.countries) {
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.d.startsWith("M")).toBe(true);
      expect(c.iso).toMatch(/^[A-Z]{2}$/);
    }
    expect(WORLD.countries.find((c) => c.iso === "BR")?.name).toBe("Brasil");
  });
  it("fronteiras só apontam para países existentes e são simétricas", () => {
    for (const c of WORLD.countries) {
      for (const b of c.borders) {
        expect(isos.has(b)).toBe(true);
        expect(GRAPH.get(b)).toContain(c.iso);
      }
    }
  });
  it("conhece fronteiras terrestres básicas", () => {
    expect(GRAPH.get("BR")).toContain("AR");
    expect(GRAPH.get("DE")).toContain("FR");
    expect(GRAPH.get("GB")).toContain("IE"); // Irlanda do Norte
    expect(GRAPH.get("TR")).toContain("GE");
  });
  it("só terra conta: nenhuma ligação por mar ou ponte", () => {
    const sea: [string, string][] = [
      ["GB", "FR"], ["JP", "KR"], ["ES", "MA"], ["IT", "TN"], ["IT", "GR"], ["DK", "SE"],
      ["TR", "RU"], ["TR", "UA"], ["US", "RU"], ["US", "CU"], ["SA", "EG"], ["AU", "ID"],
    ];
    for (const [a, b] of sea) {
      expect(GRAPH.get(a) ?? []).not.toContain(b);
      expect(GRAPH.get(b) ?? []).not.toContain(a);
    }
  });
  it("ilhas ficam no mapa, sem vizinhos, e territórios que não são países saem", () => {
    const isos = new Set(WORLD.countries.map((c) => c.iso));
    for (const island of ["JP", "AU", "CU", "NZ", "MG", "IS"]) {
      expect(isos.has(island)).toBe(true);
      expect(GRAPH.get(island)).toEqual([]);
    }
    for (const territory of ["AQ", "FK", "PR", "NC", "TF"]) expect(isos.has(territory)).toBe(false);
  });
  it("buildGraph espelha os países", () => {
    expect(buildGraph(WORLD.countries).get("BR")).toEqual(WORLD.countries.find((c) => c.iso === "BR")?.borders);
  });
});

describe("pool de pares (pairs.json)", () => {
  it("há pares para mais de um ano", () => {
    expect(PAIRS.length).toBeGreaterThan(365);
  });
  it("todo par é válido: países com fronteira, distintos e a 3–7 intermediários", () => {
    const seen = new Set<string>();
    for (const [a, b] of PAIRS) {
      expect(GRAPH.get(a)!.length).toBeGreaterThanOrEqual(2);
      expect(GRAPH.get(b)!.length).toBeGreaterThanOrEqual(2);
      expect(a).not.toBe(b);
      const mid = intermediatesCount(GRAPH, a, b);
      expect(mid).not.toBeNull();
      expect(mid as number).toBeGreaterThanOrEqual(3);
      expect(mid as number).toBeLessThanOrEqual(7);
      const key = [a, b].sort().join("-");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("displayName", () => {
  it("Israel ganha o aviso (suposto país)", () => {
    expect(displayName("IL", "Israel")).toBe("Israel (suposto país)");
  });
  it("outros países ficam inalterados", () => {
    expect(displayName("BR", "Brasil")).toBe("Brasil");
  });
});
