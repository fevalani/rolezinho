import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FronteirasMap } from "@/features/letreco/FronteirasMap";
import type { FronteirasWorld } from "@/features/letreco/fronteirasTypes";

const world: FronteirasWorld = {
  width: 1000,
  height: 500,
  countries: [
    { iso: "AA", name: "Alfa", d: "M0 0L10 0L10 10Z", borders: ["BB"] },
    { iso: "BB", name: "Beta", d: "M20 0L30 0L30 10Z", borders: ["AA", "CC"] },
    { iso: "CC", name: "Gama", d: "M40 0L50 0L50 10Z", borders: ["BB"] },
  ],
};

const mount = (extra: Partial<React.ComponentProps<typeof FronteirasMap>> = {}) =>
  render(<FronteirasMap world={world} from="AA" to="CC" colors={{}} {...extra} />);

const view = () => {
  const [x, y, w, h] = screen.getByRole("img", { name: "Mapa-múndi" }).getAttribute("viewBox")!.split(" ").map(Number);
  return { x, y, w, h };
};
const svg = () => screen.getByRole("img", { name: "Mapa-múndi" });

describe("FronteirasMap — cores", () => {
  it("origem, destino e palpites ganham cor; o resto fica neutro", () => {
    const { container } = mount({ colors: { BB: "orange" } });
    const fill = (iso: string) => container.querySelector(`path[data-iso="${iso}"]`)!.getAttribute("fill");
    expect(fill("AA")).toBe("#4a90d9");
    expect(fill("CC")).toBe("#a064d6");
    expect(fill("BB")).toBe("#e8923a");
  });

  it("ao fim da partida o caminho de exemplo ganha contorno dourado, sem virar verde", () => {
    const { container } = mount({ revealed: new Set(["BB"]) });
    const bb = container.querySelector('path[data-iso="BB"]')!;
    expect(bb.getAttribute("data-revealed")).toBe("true");
    expect(bb.getAttribute("stroke")).toBe("#c9a55a");
    expect(bb.getAttribute("fill")).not.toBe("#3fa66b"); // verde é só de palpite certo
    expect(screen.getByText(/contorno dourado/)).toBeInTheDocument();
  });

  it("palpite já dado no caminho de exemplo mantém a cor do palpite", () => {
    const { container } = mount({ colors: { BB: "green" }, revealed: new Set(["BB"]) });
    expect(container.querySelector('path[data-iso="BB"]')!.getAttribute("fill")).toBe("#3fa66b");
  });

  it("sem exemplo, nada é marcado como revelado e não há legenda", () => {
    const { container } = mount();
    expect(container.querySelector("[data-revealed]")).toBeNull();
    expect(screen.queryByText(/contorno dourado/)).not.toBeInTheDocument();
  });
});

describe("FronteirasMap — zoom", () => {
  it("começa sem zoom: só aproximar está habilitado e não há botão de reset", () => {
    mount();
    expect(view()).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
    expect(screen.getByLabelText("Aproximar")).toBeEnabled();
    expect(screen.getByLabelText("Afastar")).toBeDisabled();
    expect(screen.queryByLabelText("Redefinir zoom")).not.toBeInTheDocument();
  });

  it("botão + aproxima, e − volta até o mapa inteiro", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Aproximar"));
    expect(view().w).toBeLessThan(1000);
    expect(view().h / view().w).toBeCloseTo(0.5); // mantém a proporção
    expect(screen.getByLabelText("Afastar")).toBeEnabled();
    for (let i = 0; i < 10; i++) {
      if ((screen.getByLabelText("Afastar") as HTMLButtonElement).disabled) break;
      fireEvent.click(screen.getByLabelText("Afastar"));
    }
    expect(view()).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  it("não aproxima além do limite", () => {
    mount();
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByLabelText("Aproximar"));
    expect(view().w).toBeCloseTo(1000 / 12, 1);
  });

  it("⟲ redefine o zoom", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Aproximar"));
    fireEvent.click(screen.getByLabelText("Redefinir zoom"));
    expect(view()).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
    expect(screen.queryByLabelText("Redefinir zoom")).not.toBeInTheDocument();
  });

  it("roda do mouse aproxima (para cima) e afasta (para baixo)", () => {
    mount();
    fireEvent.wheel(svg(), { deltaY: -100, clientX: 0, clientY: 0 });
    const zoomedIn = view().w;
    expect(zoomedIn).toBeLessThan(1000);
    fireEvent.wheel(svg(), { deltaY: 100, clientX: 0, clientY: 0 });
    expect(view().w).toBeGreaterThan(zoomedIn);
  });

  it("o scroll da página é bloqueado enquanto o mouse está sobre o mapa", () => {
    mount();
    const notPrevented = fireEvent.wheel(svg(), { deltaY: -100 });
    expect(notPrevented).toBe(false); // preventDefault foi chamado
  });
});

describe("FronteirasMap — arrastar", () => {
  const drag = (from: [number, number], to: [number, number], id = 1) => {
    fireEvent.pointerDown(svg(), { pointerId: id, clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(svg(), { pointerId: id, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(svg(), { pointerId: id });
  };

  it("com zoom, arrastar move o mapa", () => {
    mount();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText("Aproximar"));
    const before = view();
    drag([200, 200], [150, 180]); // jsdom: caixa de 0x0 → usa a largura do mapa (1000) como base
    const after = view();
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.w).toBeCloseTo(before.w);
  });

  it("sem zoom, arrastar não muda nada", () => {
    mount();
    drag([200, 200], [100, 100]);
    expect(view()).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  it("mover sem ter pressionado não faz nada", () => {
    mount();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText("Aproximar"));
    const before = view();
    fireEvent.pointerMove(svg(), { pointerId: 9, clientX: 10, clientY: 10 });
    expect(view()).toEqual(before);
  });

  it("pinça com dois dedos se afastando aproxima o mapa", () => {
    mount();
    fireEvent.pointerDown(svg(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(svg(), { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(svg(), { pointerId: 2, clientX: 210, clientY: 100 }); // 1º movimento fixa a distância
    fireEvent.pointerMove(svg(), { pointerId: 2, clientX: 400, clientY: 100 });
    expect(view().w).toBeLessThan(1000);
  });
});
