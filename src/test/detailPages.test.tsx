import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { RankingDetailPage } from "@/features/ranking/RankingDetailPage";
import { DuelosPlayPage } from "@/features/duelos/DuelosPlayPage";
import { ArenaDetailPage } from "@/features/arena/ArenaDetailPage";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
const mountAt = (pattern: string, route: string, el: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Ready>
          <Routes>
            <Route path={pattern} element={el} />
            <Route path="*" element={<div>outra rota</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("RankingDetailPage", () => {
  const seed = (createdBy = "user-1") => {
    mockDb.tables.ranking_tables = [{ id: "r1", title: "Sinuca", icon: "🎱", created_by: createdBy, created_at: "", updated_at: "" }];
    mockDb.tables.ranking_categories = [{ id: "c1", table_id: "r1", name: "Vitórias", points_per_unit: 3, display_order: 0 }];
    mockDb.tables.ranking_entries = [
      { id: "e1", table_id: "r1", profile_id: null, external_name: "Ana", profiles: null },
      { id: "e2", table_id: "r1", profile_id: null, external_name: "Bia", profiles: null },
    ];
    mockDb.tables.ranking_entry_values = [
      { entry_id: "e1", category_id: "c1", value: 2 },
      { entry_id: "e2", category_id: "c1", value: 5 },
    ];
  };

  it("mostra o título, as categorias e as pessoas ordenadas por pontos", async () => {
    loginAs();
    seed();
    mountAt("/ranking/:tableId", "/ranking/r1", <RankingDetailPage />);
    expect(await screen.findByText(/Sinuca/)).toBeInTheDocument();
    expect(screen.getByText(/Vitórias/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Bia")).toBeLessThan(text.indexOf("Ana"));
  });

  it("tabela sem pessoas mostra o estado vazio", async () => {
    loginAs();
    seed();
    mockDb.tables.ranking_entries = [];
    mountAt("/ranking/:tableId", "/ranking/r1", <RankingDetailPage />);
    expect(await screen.findByText("Nenhuma pessoa na tabela ainda")).toBeInTheDocument();
  });

  it("só o criador vê o botão de administrar", async () => {
    loginAs();
    seed("outro-usuario");
    mountAt("/ranking/:tableId", "/ranking/r1", <RankingDetailPage />);
    await screen.findByText(/Sinuca/);
    expect(screen.queryByText(/Administrar/)).not.toBeInTheDocument();
  });

  it("o criador abre o painel de administração", async () => {
    loginAs();
    seed("user-1");
    mountAt("/ranking/:tableId", "/ranking/r1", <RankingDetailPage />);
    fireEvent.click(await screen.findByText(/Administrar/));
    expect(await screen.findByText("Adicionar pessoa")).toBeInTheDocument();
    expect(screen.getByText(/Fechar/)).toBeInTheDocument();
  });

  it("tabela inexistente não quebra", async () => {
    loginAs();
    mountAt("/ranking/:tableId", "/ranking/zzz", <RankingDetailPage />);
    await waitFor(() => expect(document.querySelector(".spinner")).not.toBeInTheDocument());
  });
});

describe("DuelosPlayPage", () => {
  const seed = () => {
    mockDb.tables.duel_rankings = [{ id: "d1", owner_id: "u2", title: "Melhor filme", icon: "🎬", created_at: "", updated_at: "" }];
    mockDb.tables.duel_items = [
      { id: "i1", ranking_id: "d1", name: "Matrix", position: 0 },
      { id: "i2", ranking_id: "d1", name: "Titanic", position: 1 },
    ];
  };

  it("mostra o primeiro confronto", async () => {
    loginAs();
    seed();
    mountAt("/duelos/:id", "/duelos/d1", <DuelosPlayPage />);
    expect(await screen.findByText("Qual você prefere?")).toBeInTheDocument();
    expect(screen.getByText("Matrix")).toBeInTheDocument();
    expect(screen.getByText("Titanic")).toBeInTheDocument();
    expect(screen.getByText(/0 duelos seus · 2 itens/)).toBeInTheDocument();
  });

  it("escolher um item grava vencedor e perdedor", async () => {
    loginAs();
    seed();
    mountAt("/duelos/:id", "/duelos/d1", <DuelosPlayPage />);
    fireEvent.click(await screen.findByText("Titanic"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "duel_comparisons" && w.op === "insert")).toBe(true),
    );
    const row = mockDb.writes.find((w) => w.table === "duel_comparisons")!.args[0] as Record<string, string>;
    expect(row).toMatchObject({ ranking_id: "d1", user_id: "user-1", winner_id: "i2", loser_id: "i1" });
  });

  it("depois de decidir tudo mostra o ranking final em vez do confronto", async () => {
    loginAs();
    seed();
    mockDb.tables.duel_comparisons = [
      { id: "c1", winner_id: "i1", loser_id: "i2", user_id: "user-1", created_at: "1", profiles: { display_name: "Fulano", avatar_url: null } },
    ];
    mountAt("/duelos/:id", "/duelos/d1", <DuelosPlayPage />);
    expect(await screen.findByText(/1 duelo seus/)).toBeInTheDocument();
    expect(screen.queryByText("Qual você prefere?")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Matrix/).length).toBeGreaterThan(0);
  });
});

describe("ArenaDetailPage", () => {
  const duel = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    created_by: "u2",
    scenario: "Quem ganha o Oscar?",
    option_a: "Filme A",
    option_b: "Filme B",
    option_c: "Nenhum",
    category: "Cinema",
    creator_context: null,
    odds_a: 1.8,
    odds_b: 3.5,
    odds_c: 2.1,
    odds_justification: null,
    status: "open",
    result: null,
    verdict: null,
    created_at: "",
    updated_at: "",
    profiles: { display_name: "Criador", avatar_url: null },
    ...over,
  });

  it("mostra o caso, as opções e as odds", async () => {
    loginAs();
    mockDb.tables.arena_duels = [duel()];
    mockDb.tables.arena_wallets = [{ user_id: "user-1", balance: 1000 }];
    mountAt("/arena/:duelId", "/arena/d1", <ArenaDetailPage />);
    expect(await screen.findByText("Quem ganha o Oscar?")).toBeInTheDocument();
    expect(screen.getAllByText(/Filme A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.80/).length).toBeGreaterThan(0);
  });

  it("caso inexistente não quebra", async () => {
    loginAs();
    mountAt("/arena/:duelId", "/arena/zzz", <ArenaDetailPage />);
    await waitFor(() => expect(document.querySelector(".spinner")).not.toBeInTheDocument());
  });
});
