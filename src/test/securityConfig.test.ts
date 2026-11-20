import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

type Header = { key: string; value: string };
const vercel = JSON.parse(read("vercel.json")) as {
  headers: { source: string; headers: Header[] }[];
  rewrites: { source: string; destination: string }[];
};
const headerOf = (k: string) =>
  vercel.headers[0].headers.find((h) => h.key === k)?.value;

describe("vercel.json — headers de segurança (S-09)", () => {
  it("vale para todas as rotas", () => {
    expect(vercel.headers[0].source).toBe("/(.*)");
  });
  it("tem HSTS, nosniff, referrer, frame e permissions-policy", () => {
    expect(headerOf("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(headerOf("X-Content-Type-Options")).toBe("nosniff");
    expect(headerOf("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerOf("X-Frame-Options")).toBe("DENY");
    expect(headerOf("Permissions-Policy")).toContain("camera=()");
  });
  it("CSP começa em modo Report-Only e libera Supabase (https e wss)", () => {
    expect(headerOf("Content-Security-Policy")).toBeUndefined();
    const csp = headerOf("Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("vercel.json — rewrites", () => {
  it("/api/* inexistente não cai no index.html (devolve 404 de verdade)", () => {
    const spa = vercel.rewrites.find((r) => r.destination === "/index.html")!;
    expect(new RegExp(`^${spa.source}$`).test("/api/nao-existe")).toBe(false);
    expect(new RegExp(`^${spa.source}$`).test("/bolao/123")).toBe(true);
  });
});

describe("Android (S-15)", () => {
  it("não permite backup do app (token de sessão no WebView)", () => {
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain('android:allowBackup="false"');
  });
});
