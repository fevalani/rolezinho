import { describe, it, expect } from "vitest";
import { dominantHue, emojiHue, hashHue, rgbToHsl } from "@/lib/seasonal/emojiColor";

/** n pixels RGBA iguais. */
const px = (n: number, r: number, g: number, b: number, a = 255) =>
  Array.from({ length: n }, () => [r, g, b, a]).flat();

describe("rgbToHsl", () => {
  it("cores primárias", () => {
    expect(rgbToHsl(255, 0, 0).h).toBe(0);
    expect(rgbToHsl(0, 255, 0).h).toBe(120);
    expect(rgbToHsl(0, 0, 255).h).toBe(240);
  });
  it("cinza não tem saturação", () => {
    expect(rgbToHsl(128, 128, 128)).toMatchObject({ s: 0 });
  });
});

describe("dominantHue (tom do emoji a partir dos pixels)", () => {
  it("vermelho → tom perto de 0", () => {
    const hs = dominantHue(px(100, 220, 30, 40))!;
    expect(Math.min(hs.h, 360 - hs.h)).toBeLessThan(8);
  });
  it("azul → tom perto de 220–240", () => {
    const hs = dominantHue(px(100, 30, 80, 230))!;
    expect(hs.h).toBeGreaterThan(215);
    expect(hs.h).toBeLessThan(235);
  });
  it("pixels transparentes, brancos, pretos e cinzas não contam", () => {
    const data = [...px(200, 255, 255, 255), ...px(200, 0, 0, 0), ...px(200, 120, 120, 120), ...px(200, 255, 0, 0, 40), ...px(50, 20, 200, 60)];
    const hs = dominantHue(data)!;
    expect(hs.h).toBeGreaterThan(125);
    expect(hs.h).toBeLessThan(145); // só o verde contou
  });
  it("mistura vermelho+azul dá o tom do que predomina", () => {
    const hs = dominantHue([...px(300, 30, 80, 230), ...px(40, 220, 30, 40)])!;
    expect(hs.h).toBeGreaterThan(200);
    expect(hs.h).toBeLessThan(250);
  });
  it("sem cor suficiente (emoji cinza/transparente) → null, para cair no plano B", () => {
    expect(dominantHue(px(500, 128, 128, 128))).toBeNull();
    expect(dominantHue(px(500, 255, 0, 0, 0))).toBeNull();
    expect(dominantHue(px(5, 255, 0, 0))).toBeNull(); // poucos pixels
    expect(dominantHue([])).toBeNull();
  });
  it("saturação fica entre 55% e 85% (texto continua legível)", () => {
    for (const [r, g, b] of [[220, 30, 40], [120, 100, 100], [250, 250, 0]]) {
      const hs = dominantHue(px(100, r, g, b));
      if (hs) {
        expect(hs.s).toBeGreaterThanOrEqual(55);
        expect(hs.s).toBeLessThanOrEqual(85);
      }
    }
  });
});

describe("hashHue / emojiHue (plano B e cache)", () => {
  it("hashHue é estável e fica em 0–359", () => {
    expect(hashHue("🎃")).toEqual(hashHue("🎃"));
    const { h } = hashHue("🔤");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  it("emojis diferentes costumam dar tons diferentes", () => {
    const hues = new Set(["🎃", "💘", "🌳", "🎭", "🔤", "🎂"].map((e) => hashHue(e).h));
    expect(hues.size).toBeGreaterThan(3);
  });
  it("sem canvas (jsdom) usa o plano B, sempre igual", () => {
    expect(emojiHue("🎂")).toEqual(hashHue("🎂"));
    expect(emojiHue("🎂")).toBe(emojiHue("🎂")); // mesmo objeto: veio do cache
  });
});
