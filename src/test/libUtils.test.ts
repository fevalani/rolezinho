import { describe, it, expect, vi, beforeEach } from "vitest";

const native = { value: false };
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.value,
    getPlatform: () => (native.value ? "android" : "web"),
  },
}));
const vibrate = vi.fn();
const notification = vi.fn();
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    vibrate: (...a: unknown[]) => vibrate(...a),
    notification: (...a: unknown[]) => notification(...a),
  },
  NotificationType: { Success: "SUCCESS" },
}));

import { readCache, writeCache, clearCache, clearAllCache } from "@/lib/localCache";
import { safeUrl } from "@/lib/utils";
import { track, trackPageView } from "@/lib/analytics";
import { hapticTap, hapticSuccess } from "@/lib/haptics";

beforeEach(() => {
  native.value = false;
  vibrate.mockReset();
  notification.mockReset();
  window.dataLayer = undefined;
});

describe("localCache", () => {
  it("grava e lê de volta", () => {
    writeCache("k", { a: 1 });
    expect(readCache<{ a: number }>("k")).toEqual({ a: 1 });
  });
  it("chave inexistente = null", () => {
    expect(readCache("nada")).toBeNull();
  });
  it("descarta cache de outra versão de schema", () => {
    localStorage.setItem("rolezinho:cache:k", JSON.stringify({ v: 0, savedAt: 1, data: 1 }));
    expect(readCache("k")).toBeNull();
  });
  it("JSON corrompido = null (não quebra)", () => {
    localStorage.setItem("rolezinho:cache:k", "{oops");
    expect(readCache("k")).toBeNull();
  });
  it("clearAllCache apaga todos os snapshots e preserva o resto do localStorage", () => {
    writeCache("bolao:1", { a: 1 });
    writeCache("bolao:2", { a: 2 });
    localStorage.setItem("rolezinho:dev-mode", "1");
    clearAllCache();
    expect(readCache("bolao:1")).toBeNull();
    expect(readCache("bolao:2")).toBeNull();
    expect(localStorage.getItem("rolezinho:dev-mode")).toBe("1");
  });
  it("clearCache remove", () => {
    writeCache("k", 1);
    clearCache("k");
    expect(readCache("k")).toBeNull();
  });
  it("storage cheio não lança", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => writeCache("k", 1)).not.toThrow();
    spy.mockRestore();
  });
});

describe("analytics", () => {
  it("track empurra evento com a plataforma", () => {
    track("share_event", { event_id: "e1" });
    expect(window.dataLayer).toEqual([
      { event: "share_event", platform: "web", event_id: "e1" },
    ]);
  });
  it("marca a plataforma android no APK", () => {
    native.value = true;
    track("x");
    expect(window.dataLayer?.[0]).toMatchObject({ platform: "android" });
  });
  it("trackPageView leva o caminho", () => {
    trackPageView("/agenda?evento=1");
    expect(window.dataLayer?.[0]).toMatchObject({
      event: "page_view",
      page_path: "/agenda?evento=1",
    });
  });
  it("preserva eventos já existentes no dataLayer", () => {
    window.dataLayer = [{ event: "antigo" }];
    track("novo");
    expect(window.dataLayer.map((e) => e.event)).toEqual(["antigo", "novo"]);
  });
});

describe("haptics", () => {
  it("na web não faz nada", async () => {
    await hapticTap();
    await hapticSuccess();
    expect(vibrate).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });
  it("no APK vibra curto e notifica sucesso", async () => {
    native.value = true;
    await hapticTap();
    await hapticSuccess();
    expect(vibrate).toHaveBeenCalledWith({ duration: 10 });
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });
  it("dispositivo sem suporte não lança", async () => {
    native.value = true;
    vibrate.mockRejectedValue(new Error("unsupported"));
    await expect(hapticTap()).resolves.toBeUndefined();
  });
});

describe("safeUrl", () => {
  it("aceita http, https e mailto", () => {
    expect(safeUrl("https://notion.so/x")).toBe("https://notion.so/x");
    expect(safeUrl("http://a.com")).toBe("http://a.com/");
    expect(safeUrl("mailto:oi@a.com")).toBe("mailto:oi@a.com");
  });
  it("bloqueia javascript:, data:, vbscript:, texto solto e não-string", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("  JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeUrl("vbscript:x")).toBeNull();
    expect(safeUrl("/relativo")).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});
