import { describe, it, expect, vi, afterEach } from "vitest";
import { drawShareCard, shareImage } from "@/features/wrapped/wrappedShare";

afterEach(() => vi.restoreAllMocks());

describe("wrappedShare", () => {
  it("drawShareCard desenha título e fatos em 1080×1920", () => {
    const fillText = vi.fn();
    const ctx = new Proxy({ fillText, measureText: () => ({ width: 10 }), createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : () => {}),
      set: () => true,
    });
    const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    drawShareCard(canvas, { title: "Wrapped 2026", userName: "Fulano", facts: [{ label: "Partidas", value: "12" }] });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    const texts = fillText.mock.calls.map((c) => c[0]);
    expect(texts).toEqual(expect.arrayContaining(["Wrapped 2026", "Fulano", "PARTIDAS", "12"]));
  });

  it("usa Web Share com arquivo quando disponível", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: () => true, share });
    const r = await shareImage(new Blob(["x"], { type: "image/png" }), "a.png", "oi");
    expect(r).toBe("shared");
    expect(share).toHaveBeenCalled();
  });

  it("sem suporte, baixa o arquivo", async () => {
    Object.assign(navigator, { canShare: undefined, share: undefined });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await shareImage(new Blob(["x"]), "a.png", "oi")).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });

  it("cancelar o compartilhamento não é erro", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("x", "AbortError")) });
    expect(await shareImage(new Blob(["x"]), "a.png", "oi")).toBe("cancelled");
  });
});
