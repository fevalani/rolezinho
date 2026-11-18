import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { HomePage } from "@/pages/HomePage";
import { AppShell } from "@/components/AppShell";
import { APP_FEATURES } from "@/lib/types";
import { loginAs, ADMIN_USER, flush } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";
import type { ReactNode } from "react";

function Gate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  return loading ? null : <>{children}</>;
}
function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}</div>;
}

function mountApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Gate>
          <SeasonalThemeProvider>
            <Where />
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="*" element={<div>outra tela</div>} />
              </Route>
            </Routes>
          </SeasonalThemeProvider>
        </Gate>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("cumprimenta pelo primeiro nome", async () => {
    loginAs();
    mountApp();
    expect(await screen.findByText(/Olá, Fulano/)).toBeInTheDocument();
  });

  it("lista as funcionalidades habilitadas", async () => {
    loginAs();
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    for (const f of APP_FEATURES.filter((x) => x.enabled)) {
      expect(screen.getAllByText(f.name).length).toBeGreaterThan(0);
    }
  });

  it("esconde funcionalidades marcadas em hidden_features", async () => {
    const profile = loginAs();
    profile.hidden_features = ["bolao"];
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    // some da grade; no menu lateral (fechado) também não aparece
    expect(screen.queryByText("Bolão")).not.toBeInTheDocument();
  });

  it("navega ao clicar numa funcionalidade", async () => {
    loginAs();
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    const feat = APP_FEATURES.find((f) => f.id === "dados")!;
    fireEvent.click(screen.getByText(feat.name));
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent(feat.path),
    );
  });

  it("mostra o aviso de aniversariantes de hoje", async () => {
    loginAs();
    mockDb.tables.profiles.push({
      id: "u2",
      display_name: "Beltrano",
      avatar_url: null,
      birthday: "1990-01-01",
    });
    mountApp();
    expect(await screen.findByText(/aniversari/i)).toBeInTheDocument();
    expect(supabaseMock.from).toHaveBeenCalledWith("profiles");
  });
});

describe("AppShell", () => {
  it("abre o menu lateral com perfil e versão", async () => {
    loginAs();
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    expect(await screen.findByText("Meu Perfil")).toBeInTheDocument();
    expect(screen.getByText("fulano@test.com")).toBeInTheDocument();
    expect(screen.getByText(/^v(dev|\d)/)).toBeInTheDocument();
  });

  it("navega para o perfil pelo menu", async () => {
    loginAs();
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    fireEvent.click(await screen.findByText("Meu Perfil"));
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/profile"),
    );
  });

  it("admin: o menu tem a Administração no fim, depois das features, e abre o painel", async () => {
    loginAs(ADMIN_USER);
    mountApp();
    await screen.findByText(/Olá, Admin/);
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    const painel = await screen.findByText("Painel admin");
    expect(screen.getByText("Administração")).toBeInTheDocument();
    // vem depois da última feature do menu
    const nav = painel.closest("nav")!;
    const last = APP_FEATURES[APP_FEATURES.length - 1].name;
    const text = nav.textContent ?? "";
    expect(text.indexOf("Painel admin")).toBeGreaterThan(text.lastIndexOf(last));
    fireEvent.click(painel);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin"));
  });

  it("usuário comum: o menu não mostra a Administração", async () => {
    loginAs();
    mountApp();
    await screen.findByText(/Olá, Fulano/);
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    await screen.findByText("Meu Perfil");
    expect(screen.queryByText("Painel admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });

  it("os 7 toques escondidos na versão não existem mais", async () => {
    loginAs(ADMIN_USER);
    mountApp();
    await screen.findByText(/Olá, Admin/);
    fireEvent.click(screen.getByLabelText("Abrir menu"));
    const version = await screen.findByText(/^v(dev|\d)/);
    for (let i = 0; i < 9; i++) fireEvent.click(version);
    await flush();
    expect(screen.getByTestId("where")).not.toHaveTextContent("/temas");
    expect(screen.getByTestId("where")).not.toHaveTextContent("/admin");
  });
});
