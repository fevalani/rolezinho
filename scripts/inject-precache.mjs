// Pós-build: grava em dist/sw.js a lista de arquivos de dist/assets/ (para o service worker
// guardá-los no primeiro acesso) e um identificador da versão do build (nome do cache).
//   node scripts/inject-precache.mjs [pasta-do-build]   (padrão: dist)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] ?? "dist";
const swPath = join(dist, "sw.js");
const assetsDir = join(dist, "assets");
if (!existsSync(swPath)) throw new Error(`${swPath} não existe — rode o build antes.`);

const files = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .filter((f) => /\.(js|css|woff2?|png|jpe?g|webp|svg)$/i.test(f))
      .sort()
      .map((f) => `/assets/${f}`)
  : [];
const buildId = createHash("sha1").update(files.join("\n")).digest("hex").slice(0, 10);

const sw = readFileSync(swPath, "utf-8");
if (!sw.includes("/*__PRECACHE__*/ []") || !sw.includes("__BUILD_ID__")) {
  throw new Error("sw.js sem os marcadores de precache (/*__PRECACHE__*/ [] e __BUILD_ID__).");
}
writeFileSync(
  swPath,
  sw.replace("/*__PRECACHE__*/ []", JSON.stringify(files)).replace("__BUILD_ID__", buildId),
);
console.log(`✔ service worker: ${files.length} arquivos no precache (build ${buildId})`);
