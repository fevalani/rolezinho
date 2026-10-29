// Lista data → palavra do Letroso (espelha src/features/letreco/letrosoLogic.ts).
// Uso: node scripts/letroso-words.mjs [inicio] [fim]   (YYYY-MM-DD; padrão: hoje → +30 dias)
// Se o words_letroso.txt mudou desde a data consultada, o resultado não bate com o que foi jogado.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wordsPath = fileURLToPath(new URL("../src/features/letreco/words_letroso.txt", import.meta.url));

const normalize = (w) =>
  w.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

const WORDS = Array.from(
  new Set(
    readFileSync(wordsPath, "utf8")
      .split(/\r?\n/)
      .map(normalize)
      .filter((w) => w.length >= 3 && w.length <= 10),
  ),
);

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(length, seed) {
  const rng = mulberry32(seed);
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ORDER = seededShuffle(WORDS.length, 0x4f3a);

const gameDate = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function wordOfDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return WORDS[ORDER[((day % WORDS.length) + WORDS.length) % WORDS.length]];
}

const DAY = 86_400_000;
const parse = (s) => {
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Data inválida: ${s} (use YYYY-MM-DD)`);
  return t;
};

const [startArg, endArg] = process.argv.slice(2);
const start = startArg ? parse(startArg) : parse(gameDate(new Date()));
const end = endArg ? parse(endArg) : start + 30 * DAY;

for (let t = start; t <= end; t += DAY) {
  const ymd = new Date(t).toISOString().slice(0, 10);
  console.log(`${ymd}\t${wordOfDay(ymd)}`);
}
