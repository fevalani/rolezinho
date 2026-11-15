import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { HomePage } from "@/pages/HomePage";
import { AppShell } from "@/components/AppShell";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Gate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  return loading ? null : <>{children}</>;
}
const mountHome = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
              </Route>
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );

const dislexia = { id: "d1", title: "Atenção à Dislexia", emoji: "🔤", extras: ["b", "d", "p", "q"], day_md: "11-16", days_before: 0, jumble: true, enabled: true };

describe("selo da ocasião na Home", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 16) }); // 16/11/2026
    document.documentElement.removeAttribute("data-season");
  });
  afterEach(() => vi.useRealTimers());

  it("Atenção à Dislexia no dia 16/11: título com letras fora do lugar, mas legível, e a data", async () => {
    loginAs();
    mockDb.tables.seasonal_occasions = [dislexia];
    mountHome();
    const title = await screen.findByText("Atenção à Dislexia"); // texto real (sr-only) para leitores de tela
    expect(title).toHaveClass("sr-only");
    expect(screen.getByText("16 de novembro")).toBeInTheDocument();
    expect(screen.getByText("🔤")).toBeInTheDocument();
    const letters = [...title.parentElement!.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent);
    expect(letters.join("")).toBe("Atenção à Dislexia"); // mesma ordem, só desenhadas à parte
    // o <html> é atualizado num efeito, logo depois de o selo aparecer
    await waitFor(() => expect(document.documentElement.dataset.season).toBe("ocasiao"));
  });

  it("no dia seguinte (17/11) não aparece", async () => {
    vi.setSystemTime(new Date(2026, 10, 17));
    loginAs();
    mockDb.tables.seasonal_occasions = [dislexia];
    mountHome();
    await screen.findByText(/Olá, Fulano/);
    expect(screen.queryByText("Atenção à Dislexia")).not.toBeInTheDocument();
    expect(document.documentElement.dataset.season).toBeUndefined();
  });

  it("desativada não aparece", async () => {
    loginAs();
    mockDb.tables.seasonal_occasions = [{ ...dislexia, enabled: false }];
    mountHome();
    await screen.findByText(/Olá, Fulano/);
    expect(screen.queryByText("Atenção à Dislexia")).not.toBeInTheDocument();
  });

  it("ocasião comum (sem embaralhar) mostra o título normal, emoji e dia", async () => {
    vi.setSystemTime(new Date(2026, 9, 3)); // 03/10
    loginAs();
    mockDb.tables.seasonal_occasions = [
      { id: "c1", title: "Aniversário do grupo", emoji: "🥳", extras: ["🎈"], day_md: "10-03", days_before: 2, jumble: false, enabled: true },
    ];
    mountHome();
    const title = await screen.findByText("Aniversário do grupo");
    expect(title).not.toHaveClass("sr-only");
    expect(screen.getByText("3 de outubro")).toBeInTheDocument();
    expect(title.closest("div")!.parentElement).toHaveTextContent("🥳");
  });

  it("começa 'dias antes': aparece já na antecedência", async () => {
    vi.setSystemTime(new Date(2026, 9, 1)); // 01/10: 2 dias antes de 03/10
    loginAs();
    mockDb.tables.seasonal_occasions = [
      { id: "c1", title: "Aniversário do grupo", emoji: "🥳", extras: [], day_md: "10-03", days_before: 2, jumble: false, enabled: true },
    ];
    mountHome();
    expect(await screen.findByText("Aniversário do grupo")).toBeInTheDocument();
  });
});
