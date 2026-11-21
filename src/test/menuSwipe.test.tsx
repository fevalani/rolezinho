import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { AppShell } from "@/components/AppShell";
import { EDGE_ZONE, MIN_SWIPE, isCloseSwipe, isOpenSwipe } from "@/lib/swipeLogic";
import { loginAs } from "./helpers";

describe("swipeLogic", () => {
  it("abre quando começa na borda esquerda e vai para a direita na horizontal", () => {
    expect(isOpenSwipe({ x: 5, y: 300 }, { x: 5 + MIN_SWIPE, y: 310 })).toBe(true);
    expect(isOpenSwipe({ x: EDGE_ZONE, y: 300 }, { x: 200, y: 330 })).toBe(true);
  });
  it("não abre se começou longe da borda", () => {
    expect(isOpenSwipe({ x: EDGE_ZONE + 1, y: 300 }, { x: 300, y: 300 })).toBe(false);
  });
  it("não abre se foi curto, para a esquerda ou muito na diagonal (rolagem vertical)", () => {
    expect(isOpenSwipe({ x: 5, y: 300 }, { x: 5 + MIN_SWIPE - 1, y: 300 })).toBe(false);
    expect(isOpenSwipe({ x: 5, y: 300 }, { x: -50, y: 300 })).toBe(false);
    expect(isOpenSwipe({ x: 5, y: 300 }, { x: 105, y: 420 })).toBe(false); // 120 vertical > 100 × 0.6
  });
  it("fecha com arrasto horizontal para a esquerda, em qualquer ponto", () => {
    expect(isCloseSwipe({ x: 250, y: 200 }, { x: 250 - MIN_SWIPE, y: 210 })).toBe(true);
    expect(isCloseSwipe({ x: 250, y: 200 }, { x: 250 - MIN_SWIPE + 1, y: 200 })).toBe(false);
    expect(isCloseSwipe({ x: 100, y: 200 }, { x: 200, y: 200 })).toBe(false); // para a direita
    expect(isCloseSwipe({ x: 250, y: 100 }, { x: 150, y: 300 })).toBe(false); // diagonal
  });
});

function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading } = useAuth();
  return loading || adminLoading ? null : <>{children}</>;
}

function mount() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<div>tela</div>} />
              </Route>
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
const swipe = (el: Element, from: [number, number], to: [number, number]) => {
  fireEvent.touchStart(el, touch(...from));
  fireEvent.touchEnd(el, touch(...to));
};

describe("AppShell — abrir o menu puxando pela lateral", () => {
  it("puxar da borda esquerda abre o menu; arrastar o menu para a esquerda fecha", async () => {
    loginAs();
    mount();
    await screen.findByText("tela");
    expect(screen.queryByText("Sair da conta")).toBeNull();

    swipe(document.body, [4, 400], [160, 410]);
    expect(await screen.findByText("Sair da conta")).toBeInTheDocument();

    swipe(screen.getByRole("navigation"), [250, 300], [120, 305]);
    expect(screen.queryByText("Sair da conta")).toBeNull();
  });

  it("começar longe da borda ou rolar na vertical não abre o menu", async () => {
    loginAs();
    mount();
    await screen.findByText("tela");
    swipe(document.body, [120, 400], [300, 400]); // longe da borda
    swipe(document.body, [4, 200], [40, 500]); // rolagem vertical
    expect(screen.queryByText("Sair da conta")).toBeNull();
  });

  it("gesto com mais de um dedo (zoom) é ignorado", async () => {
    loginAs();
    mount();
    await screen.findByText("tela");
    fireEvent.touchStart(document.body, {
      touches: [{ clientX: 4, clientY: 400 }, { clientX: 200, clientY: 400 }],
    });
    fireEvent.touchEnd(document.body, touch(200, 400));
    expect(screen.queryByText("Sair da conta")).toBeNull();
  });

  it("o botão do menu continua abrindo normalmente", async () => {
    loginAs();
    mount();
    await screen.findByText("tela");
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(await screen.findByText("Sair da conta")).toBeInTheDocument();
  });
});
