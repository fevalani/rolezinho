import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { RankingDetailPage } from "@/features/ranking/RankingDetailPage";
import { loginAs } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/ranking/r1"]}>
      <AuthProvider>
        <Ready>
          <Routes>
            <Route path="/ranking/:tableId" element={<RankingDetailPage />} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const seed = (createdBy: string) => {
  mockDb.tables.ranking_tables = [{ id: "r1", title: "Sinuca", icon: "🎱", created_by: createdBy, created_at: "", updated_at: "" }];
  mockDb.tables.ranking_categories = [{ id: "c1", table_id: "r1", name: "Vitórias", points_per_unit: 3, display_order: 0 }];
  mockDb.tables.ranking_entries = [{ id: "e1", table_id: "r1", profile_id: null, external_name: "Ana", profiles: null }];
  mockDb.tables.ranking_entry_values = [{ entry_id: "e1", category_id: "c1", value: 2 }];
};

describe("RankingDetailPage — edição de valores", () => {
  it("admin da tabela edita direto: botão 'Salvar' e RPC com o novo valor", async () => {
    loginAs();
    seed("user-1");
    mockDb.rpcResults.submit_ranking_value = "applied";
    supabaseMock.rpc.mockClear();
    mount();
    fireEvent.click(await screen.findByText("2", { selector: "button" }));
    const input = await screen.findByRole("spinbutton");
    expect(input).toHaveValue(2);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(supabaseMock.rpc).toHaveBeenCalledWith("submit_ranking_value", { p_entry_id: "e1", p_category_id: "c1", p_new_value: 7 }),
    );
    await waitFor(() => expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument());
  });

  it("não-admin vê o aviso e o botão vira 'Propor alteração'", async () => {
    loginAs();
    seed("outro");
    mockDb.rpcResults.submit_ranking_value = "pending";
    mount();
    fireEvent.click(await screen.findByText("2", { selector: "button" }));
    expect(await screen.findByText(/fica pendente até outra pessoa aprovar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Propor alteração" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("submit_ranking_value", expect.objectContaining({ p_new_value: 2 })));
  });

  it("erro do banco aparece na folha e ela continua aberta", async () => {
    loginAs();
    seed("user-1");
    mockDb.errors["rpc:submit_ranking_value"] = { message: "sem permissão" };
    mount();
    fireEvent.click(await screen.findByText("2", { selector: "button" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("sem permissão")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("fechar a folha (✕) não grava nada", async () => {
    loginAs();
    seed("user-1");
    mount();
    fireEvent.click(await screen.findByText("2", { selector: "button" }));
    await screen.findByRole("spinbutton");
    supabaseMock.rpc.mockClear();
    const closes = screen.getAllByText("✕");
    fireEvent.click(closes[closes.length - 1]); // o ✕ da folha vem depois dos ✕ de remover pessoa
    await waitFor(() => expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument());
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });
});

describe("RankingDetailPage — propostas pendentes", () => {
  const seedPending = (createdBy: string, proposedBy: string) => {
    seed(createdBy);
    mockDb.tables.ranking_pending_edits = [
      { id: "p1", entry_id: "e1", category_id: "c1", previous_value: 2, new_value: 9, proposed_by: proposedBy, profiles: { display_name: "Beltrano" }, status: "pending", approved_by: null, created_at: "", resolved_at: null },
    ];
  };

  it("célula com proposta mostra 🕓 e o valor proposto", async () => {
    loginAs();
    seedPending("user-1", "u2");
    mount();
    expect(await screen.findByText("🕓 9")).toBeInTheDocument();
  });

  it("outra pessoa pode aprovar a proposta", async () => {
    loginAs();
    seedPending("user-1", "u2");
    mount();
    fireEvent.click(await screen.findByText("🕓 9"));
    expect(await screen.findByText(/Proposto por Beltrano/)).toBeInTheDocument();
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("approve_ranking_edit", { p_pending_id: "p1" }));
  });

  it("outra pessoa pode rejeitar a proposta", async () => {
    loginAs();
    seedPending("user-1", "u2");
    mount();
    fireEvent.click(await screen.findByText("🕓 9"));
    supabaseMock.rpc.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "Rejeitar" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("reject_ranking_edit", { p_pending_id: "p1" }));
  });

  it("quem propôs só pode cancelar a própria proposta (não aprova a si mesmo)", async () => {
    loginAs();
    seedPending("outro", "user-1");
    mount();
    fireEvent.click(await screen.findByText("🕓 9"));
    expect(await screen.findByRole("button", { name: "Cancelar minha proposta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar minha proposta" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("reject_ranking_edit", { p_pending_id: "p1" }));
  });

  it("remover pessoa pede confirmação (só admin)", async () => {
    loginAs();
    seed("user-1");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByText("✕", { selector: "td button" }));
    expect(confirm).toHaveBeenCalledWith('Remover "Ana" da tabela?');
    expect(mockDb.writes.some((w) => w.table === "ranking_entries" && w.op === "delete")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("✕", { selector: "td button" }));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "ranking_entries" && w.op === "delete")).toBe(true));
    confirm.mockRestore();
  });

  it("não-admin não vê o botão de remover pessoa", async () => {
    loginAs();
    seed("outro");
    mount();
    await screen.findByText("2", { selector: "button" });
    expect(screen.queryByText("✕", { selector: "td button" })).not.toBeInTheDocument();
  });
});
