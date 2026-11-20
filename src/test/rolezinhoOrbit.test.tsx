import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { RolezinhoOrbit } from "@/features/home/RolezinhoOrbit";
import { ORBIT_CENTER, ORBIT_FACES } from "@/features/home/rolezinhoFaces";

const publicFile = (src: string) => resolve(__dirname, "../../public", "." + src);

describe("RolezinhoOrbit", () => {
  it("monta o fundo sem rostos e um anel com os 11 rostos", () => {
    render(<RolezinhoOrbit />);
    const orbit = screen.getByTestId("roots-orbit");
    const ring = screen.getByTestId("roots-ring");
    expect(orbit.querySelector('img[src="/images/roots/bg.jpg"]')).toBeInTheDocument();
    expect(ring.querySelectorAll("img")).toHaveLength(11);
  });

  it("o anel gira em torno da caneca e cada rosto contra-gira (fica em pé)", () => {
    render(<RolezinhoOrbit />);
    const ring = screen.getByTestId("roots-ring");
    expect(ring).toHaveClass("roots-ring");
    expect(ring.style.transformOrigin).toBe(`${ORBIT_CENTER.x}% ${ORBIT_CENTER.y}%`);
    for (const img of Array.from(ring.querySelectorAll("img"))) {
      expect(img).toHaveClass("roots-face"); // mesma duração, sentido oposto (ver global.css)
      expect(img).toHaveClass("pointer-events-none");
    }
  });

  it("a duração da volta é configurável e compartilhada por anel e rostos", () => {
    render(<RolezinhoOrbit seconds={30} />);
    expect(screen.getByTestId("roots-orbit").style.getPropertyValue("--roots-orbit-duration")).toBe("30s");
  });

  it("o CSS usa a MESMA duração e sentidos opostos no anel e nos rostos", () => {
    const css = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");
    expect(css).toMatch(/@keyframes roots-orbit \{ to \{ transform: rotate\(360deg\)/);
    expect(css).toMatch(/@keyframes roots-upright \{ to \{ transform: rotate\(-360deg\)/);
    expect(css).toMatch(/\.roots-ring \{ animation: roots-orbit var\(--roots-orbit-duration[^)]*\) linear infinite/);
    expect(css).toMatch(/\.roots-face \{ animation: roots-upright var\(--roots-orbit-duration[^)]*\) linear infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.roots-ring, \.roots-face \{ animation: none/);
  });
});

describe("rolezinhoFaces (gerado por scripts/build_roots_orbit.py)", () => {
  it("11 rostos, cada um dentro do quadrado da imagem e com arquivo existente", () => {
    expect(ORBIT_FACES).toHaveLength(11);
    for (const f of ORBIT_FACES) {
      expect(f.left).toBeGreaterThanOrEqual(0);
      expect(f.top).toBeGreaterThanOrEqual(0);
      expect(f.left + f.width).toBeLessThanOrEqual(100.001);
      expect(f.top + f.height).toBeLessThanOrEqual(100.001);
      expect(existsSync(publicFile(f.src))).toBe(true);
    }
    expect(existsSync(publicFile("/images/roots/bg.jpg"))).toBe(true);
  });

  it("os rostos formam um anel em volta do centro (nenhum no meio, todos a distância parecida)", () => {
    const dists = ORBIT_FACES.map((f) => Math.hypot(f.left + f.width / 2 - ORBIT_CENTER.x, f.top + f.height / 2 - ORBIT_CENTER.y));
    expect(Math.min(...dists)).toBeGreaterThan(25);
    expect(Math.max(...dists) - Math.min(...dists)).toBeLessThan(15);
  });

  it("o anel girando cabe na imagem: nenhum rosto sai do quadrado ao longo da volta", () => {
    // pior caso: ponto mais distante do centro de rotação, em qualquer ângulo
    const reach = Math.max(
      ...ORBIT_FACES.map((f) => {
        const cx = f.left + f.width / 2;
        const cy = f.top + f.height / 2;
        return Math.hypot(cx - ORBIT_CENTER.x, cy - ORBIT_CENTER.y) + Math.hypot(f.width, f.height) / 2;
      }),
    );
    expect(reach).toBeLessThan(ORBIT_CENTER.x * 2); // < 100% da largura
  });
});
