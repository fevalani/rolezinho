import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { AppShell } from "@/components/AppShell";
import { loginAs } from "./helpers";

function Gate({ children }: { children: ReactNode }) {
  const { loading, adminLoading } = useAuth();
  return loading || adminLoading ? null : <>{children}</>;
}

describe("layout que permite position: sticky nas telas", () => {
  it("o <main> não é um container de rolagem (overflow-auto/scroll quebraria o sticky: o app rola a janela)", async () => {
    loginAs();
    const { container, findByText } = render(
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
    await findByText("tela");
    const main = container.querySelector("main")!;
    expect(main).toHaveClass("overflow-clip");
    expect(main.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("a rolagem do app é da janela (pull-to-refresh lê window.scrollY), não de um elemento interno", () => {
    const src = readFileSync(resolve(__dirname, "../lib/usePullToRefresh.ts"), "utf8");
    expect(src).toContain("window.scrollY");
  });
});
