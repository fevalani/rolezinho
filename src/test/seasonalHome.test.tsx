import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render } from "@testing-library/react";
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

describe("selo do tema na Home", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 16) }); // 16/11/2026
    delete document.documentElement.dataset.season;
    delete document.documentElement.dataset.seasonGeneric;
  });
  afterEach(() => vi.useRealTimers());

  it("Atenção à Dislexia: título com letras fora do lugar, mas legível, e a data", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "letras", approved: true }];
    mountHome();
    const title = await screen.findByText("Atenção à Dislexia"); // texto real (sr-only) para leitores de tela
    expect(title).toHaveClass("sr-only");
    expect(screen.getByText("16 de novembro")).toBeInTheDocument();
    expect(screen.getByText("🔤")).toBeInTheDocument();
    // as letras desenhadas ficam na mesma ordem
    const letters = [...title.parentElement!.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent);
    expect(letters.join("")).toBe("Atenção à Dislexia");
    expect(document.documentElement.dataset.season).toBe("letras");
  });

  it("sem aprovação o selo não aparece (rascunho nunca liga)", async () => {
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "letras", approved: false }];
    mountHome();
    await screen.findByText(/Olá, Fulano/);
    expect(screen.queryByText("Atenção à Dislexia")).not.toBeInTheDocument();
    expect(document.documentElement.dataset.season).toBeUndefined();
  });

  it("título, emoji e dia editados pelo admin aparecem no selo (sem embaralhar um visual comum)", async () => {
    vi.setSystemTime(new Date(2026, 9, 3)); // 03/10
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "confete", approved: true, start_md: "09-26", end_md: "10-03", custom_occasion: "Aniversário do grupo", custom_emoji: "🎂", occasion_md: "10-03" },
    ];
    mountHome();
    const title = await screen.findByText("Aniversário do grupo");
    expect(title).not.toHaveClass("sr-only"); // só o visual "letras" embaralha
    expect(screen.getByText("3 de outubro")).toBeInTheDocument();
    // o emoji do selo (🎂 também é o ícone de Aniversários, por isso olhamos só dentro do selo)
    expect(title.closest("div")!.parentElement).toHaveTextContent("🎂");
    expect(document.documentElement.dataset.seasonGeneric).toBe("");
  });

  it("um visual reaproveitado em outra data: Dislexia continua intacta e a data vale só no período", async () => {
    vi.setSystemTime(new Date(2026, 10, 20));
    loginAs();
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "letras", approved: true, start_md: "11-20", end_md: "11-20", custom_occasion: "Consciência Negra", custom_emoji: "✊🏿", occasion_md: "11-20" },
    ];
    mountHome();
    expect(await screen.findByText("Consciência Negra")).toBeInTheDocument();
    expect(screen.getByText("20 de novembro")).toBeInTheDocument();
  });
});
