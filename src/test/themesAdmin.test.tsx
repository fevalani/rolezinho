import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { SEASONAL_THEMES } from "@/lib/seasonal/themes";
import { loginAs, ADMIN_USER, TEST_USER } from "./helpers";
import { mockDb } from "./supabaseMock";

function Ready({ children }: { children: React.ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/temas"]}>
      <AuthProvider>
        <Ready>
          <SeasonalThemeProvider>
            <Where />
            <Routes>
              <Route path="/temas" element={<ThemesAdminPage />} />
              <Route path="/" element={<div>home</div>} />
            </Routes>
          </SeasonalThemeProvider>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("ThemesAdminPage", () => {
  it("usuário comum é redirecionado para a Home", async () => {
    loginAs(TEST_USER);
    mount();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
  });

  it("admin vê todos os temas como rascunho", async () => {
    loginAs(ADMIN_USER);
    mount();
    for (const t of SEASONAL_THEMES) {
      expect(await screen.findByText(t.name)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Rascunho")).toHaveLength(SEASONAL_THEMES.length);
    expect(screen.queryByText("Aprovado")).not.toBeInTheDocument();
  });

  it("admin aprova um tema (grava upsert) e vira Aprovado", async () => {
    loginAs(ADMIN_USER);
    mount();
    const buttons = await screen.findAllByText("✓ Aprovar");
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(screen.getByText("Aprovado")).toBeInTheDocument());
    const w = mockDb.writes.find((x) => x.table === "seasonal_theme_approvals");
    expect(w?.op).toBe("upsert");
    expect(w?.args[0]).toMatchObject({
      theme_id: SEASONAL_THEMES[0].id,
      approved: true,
      approved_by: "admin-1",
    });
    expect(screen.getByText("Revogar aprovação")).toBeInTheDocument();
  });

  it("mostra a mensagem de erro quando o banco recusa", async () => {
    loginAs(ADMIN_USER);
    mount();
    const buttons = await screen.findAllByText("✓ Aprovar");
    mockDb.errors.seasonal_theme_approvals = { message: "permission denied" };
    fireEvent.click(buttons[0]);
    expect(await screen.findByText(/permission denied/)).toBeInTheDocument();
    expect(screen.queryByText("Aprovado")).not.toBeInTheDocument();
  });

  it("pré-visualizar leva para a Home", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click((await screen.findAllByText("👁 Pré-visualizar no app"))[0]);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
  });
});
