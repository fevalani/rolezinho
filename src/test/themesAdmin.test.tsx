import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

  it("os visuais genéricos oferecem editar título, emoji e dia; os feitos à mão não", async () => {
    loginAs(ADMIN_USER);
    mount();
    await screen.findByText("Letras embaralhadas");
    expect(screen.getAllByText(/Reaproveitar este visual/)).toHaveLength(SEASONAL_THEMES.filter((t) => t.generic).length);
    expect(screen.getAllByText(/Reaproveitar este visual/).length).toBe(10);
  });

  it("mostra o título e o dia que vão no selo da Home", async () => {
    loginAs(ADMIN_USER);
    mount();
    expect(await screen.findByText(/No selo da Home: 🔤 Atenção à Dislexia · 16 de novembro/)).toBeInTheDocument();
  });

  const openCustomizer = async (themeName: string) => {
    const card = (await screen.findByText(themeName)).closest("div.rounded-2xl") as HTMLElement;
    fireEvent.click(within(card).getByText(/Reaproveitar este visual/));
    return card;
  };

  it("salva título, emoji, dia e antecedência numa gravação só", async () => {
    loginAs(ADMIN_USER);
    mount();
    const card = await openCustomizer("Confete");
    fireEvent.change(within(card).getByDisplayValue("Carnaval"), { target: { value: "Aniversário do grupo" } });
    fireEvent.change(within(card).getByDisplayValue("🎊"), { target: { value: "🎂" } });
    fireEvent.change(within(card).getByLabelText("Dia da comemoração — dia"), { target: { value: "20" } });
    fireEvent.change(within(card).getByLabelText("Dia da comemoração — mês"), { target: { value: "3" } });
    fireEvent.change(within(card).getByLabelText("Dias de antecedência"), { target: { value: "3" } });
    expect(within(card).getByText(/Fica no ar de 17 de março até 20 de março/)).toBeInTheDocument();
    fireEvent.click(within(card).getByText("Salvar título e dia"));
    expect(await screen.findByText(/Salvo: Aniversário do grupo em 20 de março/)).toBeInTheDocument();
    const w = mockDb.writes.find((x) => x.table === "seasonal_theme_approvals")!;
    expect(w.args[0]).toMatchObject({
      theme_id: "confete",
      custom_occasion: "Aniversário do grupo",
      custom_emoji: "🎂",
      occasion_md: "03-20",
      start_md: "03-17",
      end_md: "03-20",
    });
  });

  it("não deixa salvar sem título", async () => {
    loginAs(ADMIN_USER);
    mount();
    const card = await openCustomizer("Corações");
    fireEvent.change(within(card).getByDisplayValue("Dia dos Namorados"), { target: { value: "  " } });
    expect(within(card).getByText("Escreva um título.")).toBeInTheDocument();
    expect(within(card).getByText("Salvar título e dia")).toBeDisabled();
  });

  it("o botão só habilita quando algo mudou", async () => {
    loginAs(ADMIN_USER);
    mount();
    const card = await openCustomizer("Folhas");
    expect(within(card).getByText("Salvar título e dia")).toBeDisabled();
    fireEvent.change(within(card).getByDisplayValue("Dia da Árvore"), { target: { value: "Dia do Meio Ambiente" } });
    expect(within(card).getByText("Salvar título e dia")).toBeEnabled();
  });

  it("depois de editado oferece voltar ao padrão do visual (zera tudo)", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_theme_approvals = [
      { theme_id: "oceano", approved: false, start_md: "08-01", end_md: "08-05", custom_occasion: "Dia do Surf", custom_emoji: "🏄", occasion_md: "08-05" },
    ];
    mount();
    await screen.findByText(/No selo da Home: 🏄 Dia do Surf/); // registro do banco já carregado
    const card = await openCustomizer("Oceano");
    expect(within(card).getByDisplayValue("Dia do Surf")).toBeInTheDocument();
    fireEvent.click(within(card).getByText("Voltar ao padrão do visual"));
    expect(await screen.findByText(/Visual restaurado para o padrão/)).toBeInTheDocument();
    const w = (() => { const l = mockDb.writes.filter((x) => x.table === "seasonal_theme_approvals"); return l[l.length - 1]; })();
    expect(w.args[0]).toMatchObject({ custom_occasion: null, custom_emoji: null, occasion_md: null, start_md: null, end_md: null });
  });

  it("sem a migration das colunas, avisa qual arquivo rodar", async () => {
    loginAs(ADMIN_USER);
    mount();
    const card = await openCustomizer("Doces");
    mockDb.errors.seasonal_theme_approvals = { message: 'column "custom_occasion" of relation does not exist' };
    fireEvent.change(within(card).getByDisplayValue("Dia das Crianças"), { target: { value: "Festa" } });
    fireEvent.click(within(card).getByText("Salvar título e dia"));
    expect(await screen.findByText(/seasonal_themes_custom_migration\.sql/)).toBeInTheDocument();
  });
});
