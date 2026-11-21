import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import { isNetworkErrorMessage, isOnline, useOnlineStatus } from "@/lib/online";
import { cachedQuery, cachedValue, readCache } from "@/lib/localCache";
import {
  enqueueWrite,
  flushQueue,
  getQueuedRow,
  pendingCount,
  subscribeQueue,
  upsertOrQueue,
  writeKey,
} from "@/lib/offlineQueue";
import { OfflineBanner } from "@/components/OfflineBanner";
import { mockDb } from "./supabaseMock";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}
afterEach(() => vi.restoreAllMocks());

describe("online", () => {
  it("reconhece mensagens de falta de conexão (e não confunde com erro do banco)", () => {
    for (const m of ["TypeError: Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource", "fetch failed"]) {
      expect(isNetworkErrorMessage(m)).toBe(true);
    }
    expect(isNetworkErrorMessage(new Error("Failed to fetch"))).toBe(true);
    for (const m of ["new row violates row-level security policy", "duplicate key", "", undefined, null, 42]) {
      expect(isNetworkErrorMessage(m)).toBe(false);
    }
  });

  it("isOnline segue navigator.onLine", () => {
    setOnline(false);
    expect(isOnline()).toBe(false);
    setOnline(true);
    expect(isOnline()).toBe(true);
  });

  it("useOnlineStatus reage aos eventos online/offline", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});

describe("cachedQuery / cachedValue", () => {
  it("guarda o resultado bom e o devolve quando a consulta falha depois", async () => {
    const ok = await cachedQuery("k1", async () => ({ data: [1, 2], error: null }));
    expect(ok.data).toEqual([1, 2]);
    expect(readCache("k1")).toEqual([1, 2]);
    const offline = await cachedQuery<number[]>("k1", async () => ({ data: null, error: { message: "Failed to fetch" } }));
    expect(offline).toEqual({ data: [1, 2], error: null });
  });

  it("consulta que lança também cai no cache; sem cache devolve o erro", async () => {
    await cachedQuery("k2", async () => ({ data: "a", error: null }));
    const boom = async (): Promise<{ data: string | null; error: { message: string } | null }> => {
      throw new TypeError("Failed to fetch");
    };
    expect((await cachedQuery("k2", boom)).data).toBe("a");
    const none = await cachedQuery("k-sem-cache", boom);
    expect(none.data).toBeNull();
    expect(none.error?.message).toMatch(/Failed to fetch/);
  });

  it("cachedValue: sucesso grava; falha usa a cópia; sem cópia usa o fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cachedValue("v", async () => ["x"], [])).toEqual(["x"]);
    expect(
      await cachedValue<string[]>("v", async () => {
        throw new Error("Failed to fetch");
      }, []),
    ).toEqual(["x"]);
    expect(
      await cachedValue<string[]>("v-novo", async () => {
        throw new Error("x");
      }, ["padrão"]),
    ).toEqual(["padrão"]);
  });
});

describe("fila de escritas offline", () => {
  const item = (over: Partial<Parameters<typeof enqueueWrite>[0]> = {}) => ({
    key: writeKey("letreco_games", "u1", "2026-11-21"),
    userId: "u1",
    table: "letreco_games",
    row: { score: 1 },
    onConflict: "user_id,game_date",
    ...over,
  });

  it("enfileira, substitui a mesma chave e avisa quem acompanha a fila", () => {
    const seen = vi.fn();
    const off = subscribeQueue(seen);
    enqueueWrite(item());
    enqueueWrite(item({ row: { score: 2 } }));
    enqueueWrite(item({ key: "outra", userId: "u2" }));
    expect(pendingCount()).toBe(2);
    expect(pendingCount("u1")).toBe(1);
    expect(getQueuedRow(item().key)).toEqual({ score: 2 });
    expect(getQueuedRow("nada")).toBeNull();
    expect(seen).toHaveBeenCalled();
    off();
  });

  it("upsertOrQueue sem rede: não chama o banco e guarda na fila", async () => {
    setOnline(false);
    const r = await upsertOrQueue({ ...item(), row: { score: 7 } });
    expect(r).toEqual({ error: null, queued: true });
    expect(mockDb.writes).toHaveLength(0);
    expect(getQueuedRow(item().key)).toEqual({ score: 7 });
  });

  it("upsertOrQueue com rede: grava direto e não enfileira", async () => {
    const r = await upsertOrQueue(item());
    expect(r).toEqual({ error: null, queued: false });
    expect(mockDb.writes[0]).toMatchObject({ table: "letreco_games", op: "upsert" });
    expect(pendingCount()).toBe(0);
  });

  it("erro de rede no envio vai para a fila; erro do banco continua erro", async () => {
    mockDb.errors.letreco_games = { message: "TypeError: Failed to fetch" };
    expect(await upsertOrQueue(item())).toEqual({ error: null, queued: true });
    localStorage.clear();
    mockDb.errors.letreco_games = { message: "new row violates row-level security policy" };
    expect(await upsertOrQueue(item())).toEqual({ error: "new row violates row-level security policy", queued: false });
    expect(pendingCount()).toBe(0);
  });

  it("flushQueue envia só os itens do usuário e esvazia a fila", async () => {
    enqueueWrite(item());
    enqueueWrite(item({ key: "b", row: { score: 3 } }));
    enqueueWrite(item({ key: "c", userId: "u2" }));
    const r = await flushQueue("u1");
    expect(r).toEqual({ sent: 2, dropped: 0 });
    expect(mockDb.writes.map((w) => w.table)).toEqual(["letreco_games", "letreco_games"]);
    expect(pendingCount("u1")).toBe(0);
    expect(pendingCount("u2")).toBe(1);
  });

  it("flushQueue sem rede não faz nada e mantém a fila", async () => {
    enqueueWrite(item());
    setOnline(false);
    expect(await flushQueue("u1")).toEqual({ sent: 0, dropped: 0 });
    expect(pendingCount("u1")).toBe(1);
  });

  it("flushQueue para no erro de rede e tenta de novo depois", async () => {
    enqueueWrite(item());
    enqueueWrite(item({ key: "b" }));
    mockDb.errors.letreco_games = { message: "Failed to fetch" };
    expect(await flushQueue("u1")).toEqual({ sent: 0, dropped: 0 });
    expect(mockDb.writes).toHaveLength(1); // parou no primeiro
    expect(pendingCount("u1")).toBe(2);
    mockDb.errors = {};
    expect((await flushQueue("u1")).sent).toBe(2);
  });

  it("erro do banco repetido descarta o item após 5 tentativas (não trava a fila)", async () => {
    enqueueWrite(item());
    mockDb.errors.letreco_games = { message: "violates row-level security" };
    let dropped = 0;
    for (let i = 0; i < 5; i++) dropped += (await flushQueue("u1")).dropped;
    expect(dropped).toBe(1);
    expect(pendingCount("u1")).toBe(0);
  });
});

describe("OfflineBanner", () => {
  it("não aparece online e sem pendências", () => {
    render(<OfflineBanner online pending={0} />);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });
  it("avisa sem internet, com e sem pendências", () => {
    const { rerender } = render(<OfflineBanner online={false} pending={0} />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("Sem internet");
    rerender(<OfflineBanner online={false} pending={2} />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("2 alterações serão enviadas");
    rerender(<OfflineBanner online={false} pending={1} />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("1 alteração será enviada");
  });
  it("mostra o envio em andamento quando a rede volta", () => {
    render(<OfflineBanner online pending={3} />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("Enviando 3 alterações");
  });
});
