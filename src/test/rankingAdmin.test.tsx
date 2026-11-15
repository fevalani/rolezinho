import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { RankingDetailPage } from "@/features/ranking/RankingDetailPage";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/ranking/r1"]}>
      <AuthProvider>
        <Ready>
          <Where />
          <Routes>
            <Route path="/ranking/:tableId" element={<RankingDetailPage />} />
            <Route path="*" element={<div>lista</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const seed = () => {
  mockDb.tables.ranking_tables = [{ id: "r1", title: "Sinuca", icon: "🎱", created_by: "user-1", created_at: "", updated_at: "" }];
  mockDb.tables.ranking_categories = [
    { id: "c1", table_id: "r1", name: "Vitórias", points_per_unit: 3, display_order: 0 },
    { id: "c2", table_id: "r1", name: "Empates", points_per_unit: 1, display_order: 1 },
  ];
  mockDb.tables.ranking_entries = [{ id: "e1", table_id: "r1", profile_id: null, external_name: "Ana", profiles: null }];
};

const openAdmin = async () => {
  loginAs();
  seed();
  mount();
  fireEvent.click(await screen.findByText(/Administrar/));
  await screen.findByText("Adicionar pessoa");
};

describe("Ranking — painel de administração", () => {
  it("adiciona categoria com nome e pontos", async () => {
    await openAdmin();
    const add = screen.getByRole("button", { name: "+ Nova" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Nova categoria/), { target: { value: "  Acertos  " } });
    expect(add).toBeEnabled();
    mockDb.tables.ranking_categories.push({ id: "c3", table_id: "r1", name: "Acertos", points_per_unit: 1, display_order: 2 });
    fireEvent.click(add);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_categories" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "ranking_categories")!.args[0]).toMatchObject({ table_id: "r1", name: "Acertos", points_per_unit: 1 });
  });

  it("adiciona pessoa de fora do app pelo nome", async () => {
    await openAdmin();
    const btn = screen.getByRole("button", { name: "Adicionar" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/alguém de fora do app/), { target: { value: " Zé " } });
    mockDb.tables.ranking_entries.push({ id: "e9", table_id: "r1", profile_id: null, external_name: "Zé", profiles: null });
    fireEvent.click(btn);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_entries" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "ranking_entries")!.args[0]).toEqual({ table_id: "r1", profile_id: null, external_name: "Zé" });
  });

  it("lista só perfis do app que ainda não estão na tabela e adiciona ao clicar", async () => {
    loginAs();
    seed();
    mockDb.tables.ranking_entries = [{ id: "e1", table_id: "r1", profile_id: "u2", external_name: null, profiles: { id: "u2", display_name: "Beltrano", avatar_url: null } }];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null }, { id: "u3", display_name: "Cris", avatar_url: null });
    mount();
    fireEvent.click(await screen.findByText(/Administrar/));
    await screen.findByText("Adicionar pessoa");
    expect(await screen.findByText("Cris", { selector: "button *" })).toBeInTheDocument();
    expect(screen.queryByText("Beltrano", { selector: "button *" })).not.toBeInTheDocument();
    mockDb.tables.ranking_entries.push({ id: "e9", table_id: "r1", profile_id: "u3", external_name: null, profiles: { id: "u3", display_name: "Cris", avatar_url: null } });
    fireEvent.click(screen.getByText("Cris", { selector: "button *" }));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_entries" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "ranking_entries")!.args[0]).toMatchObject({ profile_id: "u3", external_name: null });
  });

  it("renomear a tabela só grava se mudou e não está vazio", async () => {
    await openAdmin();
    const title = screen.getByDisplayValue("Sinuca");
    fireEvent.blur(title); // sem mudança
    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.blur(title); // vazio
    expect(mockDb.writes.some((w) => w.table === "ranking_tables" && w.op === "update")).toBe(false);
    fireEvent.change(title, { target: { value: "Sinuca 2026" } });
    fireEvent.blur(title);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_tables" && w.op === "update")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "ranking_tables")!.args[0]).toEqual({ title: "Sinuca 2026" });
  });

  it("reordenar categorias regrava a ordem de todas", async () => {
    await openAdmin();
    const downs = screen.getAllByText("▼");
    fireEvent.click(downs[0]);
    await waitFor(() => expect(mockDb.writes.filter((w) => w.table === "ranking_categories" && w.op === "update")).toHaveLength(2));
    expect(mockDb.writes.filter((w) => w.table === "ranking_categories").map((w) => w.args[0])).toEqual([{ display_order: 0 }, { display_order: 1 }]);
  });

  it("excluir a tabela pede confirmação, apaga e volta para a lista", async () => {
    await openAdmin();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText("Excluir tabela"));
    expect(confirm).toHaveBeenCalledWith('Excluir a tabela "Sinuca"? Isso apaga todo o histórico.');
    expect(mockDb.writes.some((w) => w.table === "ranking_tables" && w.op === "delete")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Excluir tabela"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/ranking$/));
    expect(mockDb.writes.some((w) => w.table === "ranking_tables" && w.op === "delete")).toBe(true);
    confirm.mockRestore();
  });

  it("remover categoria pede confirmação", async () => {
    await openAdmin();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const removes = screen.getAllByText("✕", { selector: "div button, button" }).filter((b) => b.className.includes("p-2 text-[var(--red)]"));
    fireEvent.click(removes[0]);
    expect(confirm).toHaveBeenCalledWith('Remover a categoria "Vitórias"?');
    expect(mockDb.writes.some((w) => w.table === "ranking_categories" && w.op === "delete")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(removes[0]);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_categories" && w.op === "delete")).toBe(true));
    confirm.mockRestore();
  });
});
