#!/usr/bin/env node
// Gera os dados estáticos do jogo "Fronteiras" (src/features/letreco/fronteiras/).
// Roda OFFLINE, uma vez (ou quando mudar a lista de ligações marítimas):
//   node scripts/generate_fronteiras_data.mjs
//
// Saídas:
//   world.json  — países: { iso, name (pt-BR), d (path SVG já projetado), borders[] }
//   pairs.json  — pool de pares [origem, destino] embaralhado de forma determinística
//
// O app NÃO depende de d3/topojson em runtime: só lê esses JSON.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { feature, neighbors } from "topojson-client";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/features/letreco/fronteiras");
mkdirSync(outDir, { recursive: true });

const topo = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"),
);
const W = 1000;
const H = 500;

// ── Países ────────────────────────────────────────────────────
const geoms = topo.objects.countries.geometries;
const fc = feature(topo, topo.objects.countries);
const ptNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

/** Sem id numérico no atlas: só Kosovo é jogável (XK). */
const NO_ID = { Kosovo: "XK" };

const isoOf = (g) => {
  if (g.id) return countries.numericToAlpha2(String(g.id).padStart(3, "0")) ?? null;
  return NO_ID[g.properties.name] ?? null;
};

const isos = geoms.map(isoOf);
const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" });
const path = geoPath(projection).digits(1);

// Grafo terrestre a partir de arcos compartilhados
const adj = neighbors(geoms);
const graph = new Map(); // iso -> Set(iso)
const ensure = (k) => graph.get(k) ?? graph.set(k, new Set()).get(k);
geoms.forEach((_, i) => {
  if (!isos[i]) return;
  ensure(isos[i]);
  for (const j of adj[i]) {
    if (!isos[j] || isos[j] === isos[i]) continue;
    ensure(isos[i]).add(isos[j]);
    ensure(isos[j]).add(isos[i]);
  }
});

// Só fronteira POR TERRA conta: sem ligações marítimas nem pontes. Ilhas (Japão, Austrália, Cuba,
// Reino Unido–França...) continuam no mapa e podem ser chutadas, mas não ligam a nada.

const out = [];
fc.features.forEach((f, i) => {
  const iso = isos[i];
  if (!iso) return;
  const d = path(f);
  if (!d) return;
  out.push({
    iso,
    name: iso === "XK" ? "Kosovo" : ptNames.of(iso),
    d,
    borders: [...graph.get(iso)].sort(),
  });
});
out.sort((a, b) => a.iso.localeCompare(b.iso));
const known = new Set(out.map((c) => c.iso));
for (const c of out) c.borders = c.borders.filter((b) => known.has(b));
// Territórios que não são países (Antártida, Malvinas, Porto Rico, Nova Caledônia, terras
// austrais francesas) não entram no jogo.
const NOT_COUNTRIES = new Set(["AQ", "FK", "PR", "NC", "TF"]);
for (let i = out.length - 1; i >= 0; i--) if (NOT_COUNTRIES.has(out[i].iso)) out.splice(i, 1);
writeFileSync(resolve(outDir, "world.json"), JSON.stringify({ width: W, height: H, countries: out }));

// ── Pool de pares ─────────────────────────────────────────────
const G = new Map(out.map((c) => [c.iso, c.borders]));
const landDegree = (iso) => (G.get(iso) ?? []).length;
// Elegíveis ao sorteio: países com pelo menos 2 vizinhos por terra (os pares só se formam
// dentro da mesma massa de terra; ilhas e países com 1 vizinho só entram como palpite).
const pool = out.map((c) => c.iso).filter((iso) => landDegree(iso) >= 2);

function bfs(src) {
  const dist = new Map([[src, 0]]);
  const q = [src];
  for (let h = 0; h < q.length; h++) {
    for (const n of G.get(q[h]) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(q[h]) + 1);
        q.push(n);
      }
    }
  }
  return dist;
}

/** Quantos caminhos mínimos distintos (conta com DP em camadas). */
function countPaths(a, b, da) {
  const memo = new Map([[a, 1]]);
  const order = [...da.entries()].sort((x, y) => x[1] - y[1]);
  for (const [n, dn] of order) {
    if (n === a) continue;
    let c = 0;
    for (const p of G.get(n)) if (da.get(p) === dn - 1) c += memo.get(p) ?? 0;
    memo.set(n, c);
  }
  return memo.get(b) ?? 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Para o SORTEIO, evita o dia depender da Guiana Francesa (França–Brasil/Suriname): é fronteira
// terrestre de verdade e vale no jogo, mas um par que só fecha por ela confunde. A distância
// sem essas arestas tem de ser igual à do grafo completo.
const OVERSEAS = new Set(["FR-BR", "FR-SR", "BR-FR", "SR-FR"]);
const LAND = new Map(
  out.map((c) => [c.iso, c.borders.filter((b) => !OVERSEAS.has(`${c.iso}-${b}`))]),
);
function bfsOn(graph, src) {
  const dist = new Map([[src, 0]]);
  const q = [src];
  for (let h = 0; h < q.length; h++) {
    for (const n of graph.get(q[h]) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(q[h]) + 1);
        q.push(n);
      }
    }
  }
  return dist;
}

const candidates = [];
for (const a of pool) {
  const da = bfs(a);
  const dl = bfsOn(LAND, a);
  for (const b of pool) {
    if (a >= b) continue;
    const dist = da.get(b);
    if (dist === undefined || dl.get(b) !== dist) continue;
    const mid = dist - 1; // intermediários
    if (mid < 3 || mid > 7) continue;
    if (countPaths(a, b, da) > 4) continue; // muitos caminhos equivalentes = confuso
    candidates.push([a, b]);
  }
}

const rand = mulberry32(20261115);
for (let i = candidates.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
}
// Limita o uso de cada país (variedade) e alterna origem/destino aleatoriamente.
const uses = new Map();
const CAP = 8;
const pairs = [];
for (const [a, b] of candidates) {
  if ((uses.get(a) ?? 0) >= CAP || (uses.get(b) ?? 0) >= CAP) continue;
  uses.set(a, (uses.get(a) ?? 0) + 1);
  uses.set(b, (uses.get(b) ?? 0) + 1);
  pairs.push(rand() < 0.5 ? [a, b] : [b, a]);
}
writeFileSync(resolve(outDir, "pairs.json"), JSON.stringify(pairs));

console.log(`países: ${out.length}, pool: ${pool.length}, candidatos: ${candidates.length}, pares: ${pairs.length}`);
