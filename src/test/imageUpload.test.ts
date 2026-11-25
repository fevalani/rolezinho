import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage, fitWithin, MAX_INPUT_BYTES, validateImageFile } from "@/lib/imageUpload";

describe("fitWithin", () => {
  it("reduz mantendo a proporção", () => {
    expect(fitWithin(2400, 1200, 1200)).toEqual({ width: 1200, height: 600 });
    expect(fitWithin(1000, 3000, 1200)).toEqual({ width: 400, height: 1200 });
  });
  it("não amplia imagem pequena", () => {
    expect(fitWithin(300, 200, 1200)).toEqual({ width: 300, height: 200 });
  });
  it("dimensões inválidas viram 0", () => {
    expect(fitWithin(0, 10)).toEqual({ width: 0, height: 0 });
  });
});

describe("validateImageFile", () => {
  it("aceita imagens e recusa o resto", () => {
    expect(validateImageFile({ type: "image/png", size: 100 })).toBeNull();
    expect(validateImageFile({ type: "application/pdf", size: 100 })).toMatch(/imagem/);
  });
  it("recusa arquivo grande demais", () => {
    expect(validateImageFile({ type: "image/jpeg", size: MAX_INPUT_BYTES + 1 })).toMatch(/15 MB/);
  });
});

describe("compressImage", () => {
  afterEach(() => vi.restoreAllMocks());

  function stubBrowser(toBlobResult: Blob | null, size = { w: 3000, h: 1500 }) {
    class FakeImage {
      naturalWidth = size.w;
      naturalHeight = size.h;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void) => cb(toBlobResult),
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
    return { canvas, drawImage };
  }

  it("redimensiona para o limite e devolve o blob", async () => {
    const out = new Blob(["w"], { type: "image/webp" });
    const { canvas, drawImage } = stubBrowser(out);
    const r = await compressImage(new Blob(["x"], { type: "image/jpeg" }));
    expect(r).toBe(out);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(600);
    expect(drawImage).toHaveBeenCalled();
  });
  it("falha com mensagem clara se o canvas não gera blob", async () => {
    stubBrowser(null);
    await expect(compressImage(new Blob(["x"]))).rejects.toThrow(/comprimir/);
  });
});
