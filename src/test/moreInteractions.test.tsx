import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { TavernaPage } from "@/features/taverna/TavernaPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ThemesAdminPage } from "@/pages/ThemesAdminPage";
import { DICE_CONFIG } from "@/lib/types";
import { loginAs, renderWithProviders, ADMIN_USER } from "./helpers";
import { mockDb } from "./supabaseMock";

describe("Taverna — dados", () => {
  const rollRows = () => (mockDb.writes.find((w) => w.table === "dice_rolls")!.args[0] as Array<{ dice_type: string; result: number; batch_id: string | null; user_id: string }>);

  it("escolher o dado muda o botão e zera a quantidade", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    await screen.findByText(/^Rolar /);
    fireEvent.click(screen.getByText("+"));
    fireEvent.click(screen.getByText("+"));
    expect(screen.getByText("Rolar 3D20")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("D6")[0]);
    expect(screen.getByText("Rolar D6")).toBeInTheDocument();
  });

  it("a quantidade fica entre 1 e 10", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    await screen.findByText(/^Rolar /);
    const minus = screen.getByText("−");
    const plus = screen.getByText("+");
    expect(minus).toBeDisabled();
    for (let i = 0; i < 15; i++) fireEvent.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getByText("Rolar 10D20")).toBeInTheDocument();
    for (let i = 0; i < 15; i++) fireEvent.click(minus);
    expect(minus).toBeDisabled();
    expect(screen.getByText("Rolar D20")).toBeInTheDocument();
  });

  it("rolar vários dados grava todos com o mesmo lote e resultados dentro dos lados", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    await screen.findByText(/^Rolar /);
    fireEvent.click(screen.getAllByText("D6")[0]);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText("+"));
    fireEvent.click(screen.getByText("Rolar 4D6"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "dice_rolls")).toBe(true));
    const rows = rollRows();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1);
    expect(rows[0].batch_id).toBeTruthy();
    for (const r of rows) {
      expect(r).toMatchObject({ dice_type: "d6", user_id: "user-1" });
      expect(r.result).toBeGreaterThanOrEqual(1);
      expect(r.result).toBeLessThanOrEqual(DICE_CONFIG.d6.sides);
    }
  });

  it("um dado só não tem lote", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    fireEvent.click(await screen.findByText(/^Rolar /));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "dice_rolls")).toBe(true));
    expect(rollRows()[0].batch_id).toBeNull();
  });
});

describe("Perfil — personalizar a Home", () => {
  it("desligar uma funcionalidade e salvar grava hidden_features", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.click(await screen.findByText("Aniversários"));
    fireEvent.click(screen.getByText("Salvar home"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.op === "update" && "hidden_features" in (w.args[0] as object))).toBe(true),
    );
    expect(mockDb.writes.find((w) => w.op === "update" && "hidden_features" in (w.args[0] as object))!.args[0]).toEqual({ hidden_features: ["aniversarios"] });
  });

  it("clicar de novo religa a funcionalidade", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    const item = await screen.findByText("Aniversários");
    fireEvent.click(item);
    fireEvent.click(item);
    fireEvent.click(screen.getByText("Salvar home"));
    await waitFor(() => expect(mockDb.writes.some((w) => "hidden_features" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "hidden_features" in (w.args[0] as object))!.args[0]).toEqual({ hidden_features: [] });
  });

  it("funcionalidades já escondidas vêm desligadas", async () => {
    const p = loginAs();
    p.hidden_features = ["bolao", "musicas"];
    renderWithProviders(<ProfilePage />);
    fireEvent.click(await screen.findByText("Bolão")); // religa o bolão
    fireEvent.click(screen.getByText("Salvar home"));
    await waitFor(() => expect(mockDb.writes.some((w) => "hidden_features" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "hidden_features" in (w.args[0] as object))!.args[0]).toEqual({ hidden_features: ["musicas"] });
  });

  it("emoji vira avatar ao salvar", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    const input = await screen.findByPlaceholderText("✨ Digite qualquer emoji");
    fireEvent.change(input, { target: { value: "🦊" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    await waitFor(() => expect(mockDb.writes.some((w) => "display_name" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "display_name" in (w.args[0] as object))!.args[0]).toMatchObject({ avatar_url: "🦊" });
  });

  it("aniversário em formato inválido é recusado", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.change(await screen.findByPlaceholderText("DD/MM/AAAA"), { target: { value: "31/02/1990" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    expect(await screen.findByText(/Data inválida/)).toBeInTheDocument();
    expect(mockDb.writes.some((w) => "birthday" in (w.args[0] as object))).toBe(false);
  });

  it.each(["31/02/1990", "30/02/2000", "29/02/2001", "31/04/1990", "00/05/1990", "10/13/1990"])("data impossível %s é recusada", async (d) => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.change(await screen.findByPlaceholderText("DD/MM/AAAA"), { target: { value: d } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    expect(await screen.findByText(/Data inválida/)).toBeInTheDocument();
    expect(mockDb.writes.some((w) => "birthday" in (w.args[0] as object))).toBe(false);
  });

  it("29/02 em ano bissexto é aceito", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.change(await screen.findByPlaceholderText("DD/MM/AAAA"), { target: { value: "29/02/2000" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    await waitFor(() => expect(mockDb.writes.some((w) => "birthday" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "birthday" in (w.args[0] as object))!.args[0]).toMatchObject({ birthday: "2000-02-29" });
  });

  it("aniversário válido grava no formato ISO", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.change(await screen.findByPlaceholderText("DD/MM/AAAA"), { target: { value: "25/07/1995" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    await waitFor(() => expect(mockDb.writes.some((w) => "birthday" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "birthday" in (w.args[0] as object))!.args[0]).toMatchObject({ birthday: "1995-07-25" });
  });
});

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}

describe("Temas — período", () => {
  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/temas"]}>
        <AuthProvider>
          <Ready>
            <SeasonalThemeProvider>
              <Routes>
                <Route path="/temas" element={<ThemesAdminPage />} />
              </Routes>
            </SeasonalThemeProvider>
          </Ready>
        </AuthProvider>
      </MemoryRouter>,
    );

  it("salvar período grava as datas escolhidas (MM-DD) do tema", async () => {
    loginAs(ADMIN_USER);
    mount();
    const month = (await screen.findAllByLabelText("Início — mês"))[0];
    fireEvent.change(month, { target: { value: "11" } });
    const save = screen.getAllByText("Salvar período")[0];
    fireEvent.click(save);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "seasonal_theme_approvals")).toBe(true));
    const row = mockDb.writes.find((w) => w.table === "seasonal_theme_approvals")!.args[0] as { theme_id: string; start_md: string; end_md: string };
    expect(row.start_md).toMatch(/^11-\d{2}$/);
    expect(row.end_md).toMatch(/^\d{2}-\d{2}$/);
    expect(row.theme_id).toBeTruthy();
  });

  it("restaurar o padrão grava período nulo", async () => {
    loginAs(ADMIN_USER);
    // tema com período personalizado (só então aparece "Restaurar padrão")
    mockDb.tables.seasonal_theme_approvals = [{ theme_id: "natal", approved: false, start_md: "11-20", end_md: "12-31" }];
    mount();
    const restore = await screen.findByRole("button", { name: /Restaurar padrão/ });
    fireEvent.click(restore);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "seasonal_theme_approvals")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "seasonal_theme_approvals")!.args[0]).toMatchObject({ start_md: null, end_md: null });
  });

  it("erro por falta da migração de datas mostra a instrução", async () => {
    loginAs(ADMIN_USER);
    mount();
    fireEvent.change((await screen.findAllByLabelText("Início — mês"))[0], { target: { value: "10" } });
    const save = screen.getAllByText("Salvar período")[0];
    expect(save).toBeEnabled();
    // a leitura inicial já aconteceu; só a gravação falha
    mockDb.errors.seasonal_theme_approvals = { message: 'column "start_md" does not exist' };
    fireEvent.click(save);
    expect(await screen.findByText(/rode supabase\/seasonal_themes_window_migration\.sql/)).toBeInTheDocument();
  });
});

void within;
