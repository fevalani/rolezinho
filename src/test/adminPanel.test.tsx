import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { AdminPage, AdminRoute, AdminSectionPage } from "@/features/admin/AdminPage";
import { ADMIN_SECTIONS, findAdminSection } from "@/features/admin/adminSections";
import { Navigate } from "react-router-dom";
import { ADMIN_USER, TEST_USER, loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Gate({ children }: { children: ReactNode }) {
  const { loading, user, profile, adminLoading } = useAuth();
  return loading || adminLoading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

// Mesmas rotas do App.tsx para o painel e os endereços antigos.
const mount = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Where />
            <Routes>
              <Route path="/" element={<p>home</p>} />
              <Route path="/admin" element={<AdminRoute />}>
                <Route index element={<AdminPage />} />
                <Route path=":section" element={<AdminSectionPage />} />
              </Route>
              <Route path="/temas" element={<Navigate to="/admin/temas" replace />} />
              <Route path="/wrapped-admin" element={<Navigate to="/admin/wrapped" replace />} />
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("registro de seções", () => {
  it("ids únicos, com título, descrição e ícone", () => {
    const ids = ADMIN_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ADMIN_SECTIONS) expect(s.title && s.description && s.icon).toBeTruthy();
    expect(ids).toEqual(expect.arrayContaining(["temas", "wrapped", "features", "usuarios", "admins"]));
  });
  it("findAdminSection", () => {
    expect(findAdminSection("wrapped")?.title).toBe("Wrapped");
    expect(findAdminSection("nope")).toBeUndefined();
    expect(findAdminSection(undefined)).toBeUndefined();
  });
});

describe("painel /admin", () => {
  beforeEach(() => mockDb.reset());

  it("admin vê um cartão por aplicação e abre a seção com voltar", async () => {
    loginAs(ADMIN_USER);
    mount("/admin");
    expect(await screen.findByRole("heading", { name: "Administração" })).toBeInTheDocument();
    for (const s of ADMIN_SECTIONS) expect(screen.getByText(s.title)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Wrapped"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin/wrapped"));
    expect(await screen.findByText("Wrapped — edições")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Administração/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/admin$/));
  });

  it("seção de temas abre dentro do painel", async () => {
    loginAs(ADMIN_USER);
    mount("/admin/temas");
    expect(await screen.findByText("Temas sazonais", { selector: "h1" })).toBeInTheDocument();
  });

  it("seção desconhecida volta para o hub", async () => {
    loginAs(ADMIN_USER);
    mount("/admin/inexistente");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/admin$/));
    expect(await screen.findByRole("heading", { name: "Administração" })).toBeInTheDocument();
  });

  it("usuário comum é mandado para a Home em qualquer rota /admin", async () => {
    for (const route of ["/admin", "/admin/wrapped", "/admin/temas"]) {
      mockDb.reset();
      loginAs(TEST_USER);
      const { unmount } = mount(route);
      expect(await screen.findByText("home")).toBeInTheDocument();
      expect(screen.queryByText("Administração")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("deslogado também não passa", async () => {
    mount("/admin");
    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  it("endereços antigos redirecionam para o painel", async () => {
    loginAs(ADMIN_USER);
    const a = mount("/temas");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin/temas"));
    a.unmount();
    mockDb.reset();
    loginAs(ADMIN_USER);
    mount("/wrapped-admin");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin/wrapped"));
  });
});
