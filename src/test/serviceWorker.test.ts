import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SW_SOURCE = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf-8");
const SCRIPT = resolve(__dirname, "../../scripts/inject-precache.mjs");

describe("service worker (offline)", () => {
  it("tem os marcadores que o build preenche e trata navegação offline com o index.html", () => {
    expect(SW_SOURCE).toContain("/*__PRECACHE__*/ []");
    expect(SW_SOURCE).toContain("__BUILD_ID__");
    expect(SW_SOURCE).toContain("caches.match('/index.html')");
    expect(SW_SOURCE).toContain("pathname.startsWith('/assets/')");
  });

  it("nunca guarda chamadas ao Supabase", () => {
    expect(SW_SOURCE).toContain("supabase.co");
  });
});

describe("inject-precache (pós-build)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "sw.js"), SW_SOURCE);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("grava a lista de /assets/ e um id de build no sw.js", () => {
    for (const f of ["index-abc.js", "Page-def.js", "style-123.css", "mapa.js.map", "leia.txt"]) {
      writeFileSync(join(dir, "assets", f), "x");
    }
    execFileSync("node", [SCRIPT, dir]);
    const sw = readFileSync(join(dir, "sw.js"), "utf-8");
    expect(sw).not.toContain("__BUILD_ID__");
    expect(sw).not.toContain("/*__PRECACHE__*/");
    const list = JSON.parse(/const PRECACHE_URLS = (\[.*\]);/.exec(sw)![1]);
    expect(list).toEqual(["/assets/Page-def.js", "/assets/index-abc.js", "/assets/style-123.css"]);
    expect(/const BUILD_ID = '([0-9a-f]{10})'/.test(sw)).toBe(true);
  });

  it("o id de build muda quando os arquivos mudam (cache antigo é descartado)", () => {
    writeFileSync(join(dir, "assets", "a.js"), "x");
    execFileSync("node", [SCRIPT, dir]);
    const id1 = /BUILD_ID = '(\w+)'/.exec(readFileSync(join(dir, "sw.js"), "utf-8"))![1];
    writeFileSync(join(dir, "sw.js"), SW_SOURCE);
    writeFileSync(join(dir, "assets", "b.js"), "x");
    execFileSync("node", [SCRIPT, dir]);
    const id2 = /BUILD_ID = '(\w+)'/.exec(readFileSync(join(dir, "sw.js"), "utf-8"))![1];
    expect(id1).not.toBe(id2);
  });

  it("falha com mensagem clara se o sw.js não tiver os marcadores", () => {
    writeFileSync(join(dir, "sw.js"), "// vazio");
    expect(() => execFileSync("node", [SCRIPT, dir], { stdio: "pipe" })).toThrow();
  });
});
