import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { OCCASION_SUGGESTIONS } from "@/lib/seasonal/occasionSuggestions";
import { normalizeOccasion } from "@/lib/seasonal/occasions";
import { loginAs, ADMIN_USER } from "./helpers";
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

const row = (over: Record<string, unknown> = {}) => ({
  id: "o1", title: "Atenção à Dislexia", emoji: "🔤", extras: ["b", "d"], day_md: "11-16", days_before: 0, jumble: true, enabled: true, ...over,
});
const writes = () => mockDb.writes.filter((w) => w.table === "seasonal_occasions");

afterEach(() => vi.restoreAllMocks());

describe("OccasionsAdmin (em /temas)", () => {
  it("sem ocasiões mostra o convite para criar", async () => {
    loginAs(ADMIN_USER);
    mount();
    expect(await screen.findByText(/Nenhuma ocasião ainda/)).toBeInTheDocument();
    expect(screen.getByText("Temas prontos")).toBeInTheDocument();
  });

  it("lista as ocasiões com dia, antecedência, embaralhado e a faixa de prévia", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row(), row({ id: "o2", title: "Halloween", emoji: "🎃", day_md: "10-31", days_before: 5, jumble: false, enabled: false })];
    mount();
    expect(await screen.findByText("Atenção à Dislexia")).toBeInTheDocument();
    expect(screen.getByText(/16 de novembro · só no dia · letras embaralhadas/)).toBeInTheDocument();
    expect(screen.getByText(/31 de outubro · entra 5 dias antes/)).toBeInTheDocument();
    expect(screen.getAllByText("Ativa")).toHaveLength(1);
    expect(screen.getAllByText("Desativada")).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "Prévia da faixa" })).toHaveLength(2);
  });

  it("marca 'No ar agora' quando está no período", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 16) });
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row()];
    mount();
    expect(await screen.findByText("No ar agora")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("criar: ideia preenche o formulário e salvar grava a ocasião", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    fireEvent.click(screen.getByText(/Halloween/));
    expect(screen.getByDisplayValue("Halloween")).toBeInTheDocument();
    expect(screen.getByDisplayValue("🎃")).toBeInTheDocument();
    expect(screen.getByDisplayValue("👻 🦇 🕸️")).toBeInTheDocument();
    expect(screen.getByText(/No ar de 26 de outubro até 31 de outubro/)).toBeInTheDocument();
    mockDb.tables.seasonal_occasions = [row({ title: "Halloween", emoji: "🎃", extras: ["👻", "🦇", "🕸️"], day_md: "10-31", days_before: 5, jumble: false })];
    fireEvent.click(screen.getByText("Salvar ocasião"));
    expect(await screen.findByText(/Salvo: Halloween em 31 de outubro/)).toBeInTheDocument();
    expect(writes()[0]).toMatchObject({ op: "insert" });
    expect(writes()[0].args[0]).toMatchObject({ title: "Halloween", emoji: "🎃", extras: ["👻", "🦇", "🕸️"], day_md: "10-31", days_before: 5, jumble: false, enabled: true, created_by: "admin-1" });
    expect(screen.queryByText("Salvar ocasião")).not.toBeInTheDocument(); // formulário fecha
  });

  it("criar do zero: título, emoji, extras (vírgulas e junto), dia e antecedência", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Festa do grupo" } });
    fireEvent.change(screen.getByLabelText(/Emoji principal/), { target: { value: "🥳" } });
    fireEvent.change(screen.getByLabelText(/Outros emojis/), { target: { value: "🎈,🎊 🥁🎶" } });
    expect(screen.getByLabelText("Emojis da faixa")).toHaveTextContent("🎈 🎊 🥁 🎶");
    fireEvent.change(screen.getByLabelText("Dia da comemoração — dia"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Dia da comemoração — mês"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Dias de antecedência"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText(/Letras levemente embaralhadas/));
    expect(screen.getByText(/No ar de 17 de março até 20 de março/)).toBeInTheDocument();
    mockDb.tables.seasonal_occasions = [row({ title: "Festa do grupo" })];
    fireEvent.click(screen.getByText("Salvar ocasião"));
    await screen.findByText(/Salvo: Festa do grupo em 20 de março/);
    expect(writes()[0].args[0]).toMatchObject({ title: "Festa do grupo", emoji: "🥳", extras: ["🎈", "🎊", "🥁", "🎶"], day_md: "03-20", days_before: 3, jumble: true });
  });

  it("sem título o botão fica desligado e mostra o que falta", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    expect(screen.getByText("Salvar ocasião")).toBeDisabled();
    expect(screen.getByText("Escreva um título.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Algo" } });
    expect(screen.getByText("Salvar ocasião")).toBeEnabled();
  });

  it("cancelar fecha o formulário sem gravar", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByText("Salvar ocasião")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("editar traz os valores e salva como atualização", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row()];
    mount();
    fireEvent.click(await screen.findByText("✏️ Editar"));
    expect(screen.getByText("Editar ocasião")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Atenção à Dislexia")).toBeInTheDocument();
    expect(screen.getByDisplayValue("b d")).toBeInTheDocument();
    expect(screen.getByLabelText(/Letras levemente embaralhadas/)).toBeChecked();
    expect(screen.queryByText(/Ideias/)).not.toBeInTheDocument(); // ideias só na criação
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Dislexia" } });
    mockDb.tables.seasonal_occasions = [row({ title: "Dislexia" })];
    fireEvent.click(screen.getByText("Salvar ocasião"));
    await screen.findByText(/Salvo: Dislexia/);
    expect(writes()[0]).toMatchObject({ op: "update" });
    expect(writes()[0].args[0]).toMatchObject({ title: "Dislexia" });
  });

  it("desativar e ativar", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row()];
    mount();
    await screen.findByText("Desativar"); // lista já carregada
    mockDb.tables.seasonal_occasions = [row({ enabled: false })]; // o que o banco devolve ao salvar
    fireEvent.click(screen.getByText("Desativar"));
    expect(await screen.findByText("Ativar")).toBeInTheDocument();
    expect(writes()[0].args[0]).toMatchObject({ enabled: false });
    expect(screen.getByText("Desativada")).toBeInTheDocument();
  });

  it("excluir pede confirmação; recusar não apaga, confirmar apaga", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row()];
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(await screen.findByText("🗑 Excluir"));
    expect(writes()).toHaveLength(0);
    expect(screen.getByText("Atenção à Dislexia")).toBeInTheDocument();
    fireEvent.click(screen.getByText("🗑 Excluir"));
    expect(await screen.findByText(/Excluída: Atenção à Dislexia/)).toBeInTheDocument();
    expect(writes()[0]).toMatchObject({ op: "delete" });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("img", { name: "Prévia da faixa" })).not.toBeInTheDocument();
  });

  it("pré-visualizar leva para a Home", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.seasonal_occasions = [row()];
    mount();
    const card = (await screen.findByText("Atenção à Dislexia")).closest("div.rounded-2xl") as HTMLElement;
    fireEvent.click(within(card).getByText("👁 Pré-visualizar no app"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
  });

  it("sem a tabela, avisa qual migration rodar", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Algo" } });
    mockDb.errors.seasonal_occasions = { message: 'relation "public.seasonal_occasions" does not exist' };
    fireEvent.click(screen.getByText("Salvar ocasião"));
    expect(await screen.findByText(/seasonal_occasions_migration\.sql/)).toBeInTheDocument();
  });

  it("erro genérico do banco aparece como está", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.click(await screen.findByText("＋ Nova ocasião"));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Algo" } });
    mockDb.errors.seasonal_occasions = { message: "permission denied" };
    fireEvent.click(screen.getByText("Salvar ocasião"));
    expect(await screen.findByText("permission denied")).toBeInTheDocument();
  });
});

describe("ideias de ocasião", () => {
  it("todas as ideias são ocasiões válidas", () => {
    for (const s of OCCASION_SUGGESTIONS) {
      const r = normalizeOccasion(s);
      expect(r.error, s.title).toBeUndefined();
    }
  });
  it("a primeira é a Atenção à Dislexia, 16/11, com letras embaralhadas", () => {
    expect(OCCASION_SUGGESTIONS[0]).toMatchObject({ title: "Atenção à Dislexia", dayMd: "11-16", jumble: true });
  });
  it("títulos únicos", () => {
    const t = OCCASION_SUGGESTIONS.map((s) => s.title);
    expect(new Set(t).size).toBe(t.length);
  });
});
