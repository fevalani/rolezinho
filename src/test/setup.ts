import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";
import { mockDb } from "./supabaseMock";

// Mock crypto
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => `test-${Math.random().toString(36).slice(2)}`,
      getRandomValues: (arr: Uint32Array) => {
        for (let i = 0; i < arr.length; i++)
          arr[i] = Math.floor(Math.random() * 0xffffffff);
        return arr;
      },
    },
  });
}

// Mock import.meta.env
Object.defineProperty(import.meta, "env", {
  value: {
    VITE_SUPABASE_URL: "https://test.supabase.co",
    VITE_SUPABASE_ANON_KEY: "test-key",
  },
});

// Testes não podem depender das chaves reais do .env.local do desenvolvedor
for (const k of [
  "VITE_TMDB_KEY",
  "VITE_GOOGLE_BOOKS_KEY",
  "VITE_GEMINI_KEY",
  "VITE_FOOTBALL_DATA_KEY",
  "VITE_RAPIDAPI_KEY",
  "VITE_PUBLIC_URL",
])
  vi.stubEnv(k, "");

// APIs de navegador que o jsdom não tem
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = vi.fn();
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
// (atribuição direta: vi.unstubAllGlobals() nos testes não pode remover isto)
const g = globalThis as Record<string, unknown>;
if (!g.IntersectionObserver) g.IntersectionObserver = NoopObserver;
if (!g.ResizeObserver) g.ResizeObserver = NoopObserver;

// Mock Supabase (comportamento configurável em ./supabaseMock)
vi.mock("@/lib/supabase", async () => {
  const m = await import("./supabaseMock");
  return { supabase: m.supabaseMock };
});

beforeEach(() => {
  mockDb.reset();
  localStorage.clear();
});
