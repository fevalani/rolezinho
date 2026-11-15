import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { BolaoDetailPage } from "@/features/bolao/BolaoDetailPage";
import { fetchLeaderboard, fetchRoundLeaderboards, fetchAllUserPredictions } from "@/features/bolao/bolaoService";
import { loginAs, ADMIN_USER } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/bolao/p1"]}>
      <AuthProvider>
        <Ready>
          <Where />
          <Routes>
            <Route path="/bolao/:poolId" element={<BolaoDetailPage />} />
            <Route path="*" element={<div>destino</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const past = new Date(Date.now() - 3 * 86_400_000).toISOString();

const seed = (createdBy = "u9") => {
  mockDb.tables.bolao_pools = [
    {
      id: "p1",
      name: "Bolão dos Amigos",
      championship_id: "c1",
      created_by: createdBy,
      created_at: "",
      updated_at: "",
      bolao_championships: { id: "c1", name: "Brasileirão", code: "BSA", season: "2026" },
      bolao_pool_members: [{ user_id: "user-1" }, { user_id: "u2" }],
    },
  ];
  mockDb.tables.bolao_matches = [
    {
      id: "m1",
      championship_id: "c1",
      home_team: "Flamengo",
      away_team: "Palmeiras",
      round_label: "Rodada 1",
      round_number: 1,
      stage: "REGULAR_SEASON",
      utc_date: future,
      status: "SCHEDULED",
      score_home: null,
      score_away: null,
    },
  ];
  mockDb.tables.bolao_pool_members = [
    { id: "mm1", pool_id: "p1", user_id: "user-1", joined_at: "", profiles: { id: "user-1", display_name: "Fulano", avatar_url: null } },
    { id: "mm2", pool_id: "p1", user_id: "u2", joined_at: "", profiles: { id: "u2", display_name: "Beltrano", avatar_url: null } },
  ];
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BolaoDetailPage", () => {
  it("mostra o bolão, a rodada e a partida aberta", async () => {
    loginAs();
    seed();
    mount();
    expect((await screen.findAllByText(/Bolão dos Amigos/)).length).toBeGreaterThan(0);
    expect(await screen.findByText("Próximas partidas")).toBeInTheDocument();
    expect(screen.getByText("Flamengo")).toBeInTheDocument();
    expect(screen.getByText("Palmeiras")).toBeInTheDocument();
    expect(screen.getByText("Palpites")).toBeInTheDocument();
    expect(screen.getByText("Classificação")).toBeInTheDocument();
  });

  it("digitar o palpite mostra 'Salvar palpites' e grava na chave certa", async () => {
    loginAs();
    seed();
    mount();
    await screen.findByText("Flamengo");
    expect(screen.queryByText("Salvar palpites")).not.toBeInTheDocument();
    const [home, away] = screen.getAllByRole("spinbutton");
    fireEvent.change(home, { target: { value: "2" } });
    fireEvent.change(away, { target: { value: "1" } });
    const saveBtns = await screen.findAllByText("Salvar palpites");
    fireEvent.click(saveBtns[0]);
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "bolao_predictions" && w.op === "upsert")).toBe(true),
    );
    expect(mockDb.writes.find((w) => w.table === "bolao_predictions")!.args[0]).toMatchObject({
      pool_id: "p1",
      match_id: "m1",
      user_id: "user-1",
      home_goals: 2,
      away_goals: 1,
    });
  });

  it("jogo que já começou não aceita palpite novo (sem campos)", async () => {
    loginAs();
    seed();
    mockDb.tables.bolao_matches[0].utc_date = past;
    mount();
    await screen.findByText("Flamengo");
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("a aba Admin aparece para o criador do bolão e não para os outros", async () => {
    loginAs();
    seed("user-1");
    mount();
    expect(await screen.findByText("Admin")).toBeInTheDocument();
  });
  it("participante comum não vê a aba Admin", async () => {
    loginAs();
    seed("u9");
    mount();
    await screen.findByText("Flamengo");
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
  it("admin do app vê a aba Admin em qualquer bolão", async () => {
    loginAs(ADMIN_USER);
    seed("u9");
    mockDb.tables.bolao_pools[0].bolao_pool_members = [{ user_id: "admin-1" }];
    mount();
    expect(await screen.findByText("Admin")).toBeInTheDocument();
  });

  it("a classificação lista os participantes por pontos", async () => {
    loginAs();
    seed();
    mockDb.tables.bolao_predictions = [
      { user_id: "u2", points_earned: 15, home_goals: 1, away_goals: 0, bolao_matches: { score_home: 1, score_away: 0 } },
      { user_id: "user-1", points_earned: 3, home_goals: 2, away_goals: 0, bolao_matches: { score_home: 3, score_away: 1 } },
    ];
    mount();
    fireEvent.click(await screen.findByText("Classificação"));
    expect((await screen.findAllByText(/Beltrano/)).length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Beltrano")).toBeLessThan(text.lastIndexOf("Fulano"));
  });

  it("bolão inexistente não quebra a tela", async () => {
    loginAs();
    mockDb.tables.bolao_pools = [];
    mount();
    await waitFor(() => expect(document.querySelector(".spinner")).not.toBeInTheDocument());
  });
});

describe("classificação no serviço", () => {
  const prof = (id: string, name: string) => ({ id, display_name: name, avatar_url: null });
  it("soma pontos, conta palpites e cravadas e ordena", async () => {
    mockDb.tables.bolao_pool_members = [
      { user_id: "a", profiles: prof("a", "Ana") },
      { user_id: "b", profiles: prof("b", "Bia") },
      { user_id: "c", profiles: prof("c", "Cris") },
    ];
    mockDb.tables.bolao_predictions = [
      { user_id: "a", points_earned: 15, home_goals: 1, away_goals: 0, bolao_matches: { score_home: 1, score_away: 0 } },
      { user_id: "a", points_earned: 5, home_goals: 3, away_goals: 1, bolao_matches: { score_home: 2, score_away: 1 } },
      { user_id: "b", points_earned: 30, home_goals: 0, away_goals: 0, bolao_matches: { score_home: 0, score_away: 0 } },
    ];
    const r = await fetchLeaderboard("p1");
    expect(r.map((e) => e.user_id)).toEqual(["b", "a", "c"]);
    expect(r[1]).toMatchObject({ total_points: 20, predictions_made: 2, exact_scores: 1 });
    expect(r[2]).toMatchObject({ total_points: 0, predictions_made: 0 });
  });
  it("sem membros = vazio; fetchRoundLeaderboards e fetchAllUserPredictions não quebram sem dados", async () => {
    expect(await fetchLeaderboard("p1")).toEqual([]);
    expect(await fetchRoundLeaderboards("p1")).toEqual([]);
    expect((await fetchAllUserPredictions("p1")).size).toBe(0);
  });
});

describe("BolaoDetailPage — admin e informações", () => {
  it("criador troca o modelo de pontuação: botão só habilita ao mudar; chama as RPCs e avisa", async () => {
    loginAs();
    seed("user-1");
    mockDb.tables.bolao_matches[0].status = "FINISHED";
    mockDb.tables.bolao_matches[0].score_home = 1;
    mockDb.tables.bolao_matches[0].score_away = 0;
    mount();
    fireEvent.click(await screen.findByText("Admin"));
    const save = await screen.findByRole("button", { name: "Salvar modelo" });
    expect(save).toBeDisabled();
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getAllByText("Simplificado")[0]);
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByText(/Modelo alterado para Simplificado e pontos recalculados/)).toBeInTheDocument();
    const names = supabaseMock.rpc.mock.calls.map((c) => c[0]);
    expect(names.slice(0, 2)).toEqual(["update_pool_scoring_model", "reset_pool_scores"]);
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({ p_pool_id: "p1", p_scoring_model: "simplified" });
  });

  it("criador troca a variação de posição", async () => {
    loginAs();
    seed("user-1");
    mount();
    fireEvent.click(await screen.findByText("Admin"));
    const save = await screen.findByRole("button", { name: "Salvar variação" });
    fireEvent.click(screen.getAllByText("Por partida")[0]);
    supabaseMock.rpc.mockClear();
    fireEvent.click(save);
    expect(await screen.findByText(/Variação de posição: Por partida/)).toBeInTheDocument();
    expect(supabaseMock.rpc).toHaveBeenCalledWith("update_pool_variation_mode", { p_pool_id: "p1", p_variation_mode: "match" });
  });

  it("criador (não admin do app) não vê importar/sincronizar/recalcular", async () => {
    loginAs();
    seed("user-1");
    mount();
    fireEvent.click(await screen.findByText("Admin"));
    await screen.findByRole("button", { name: "Salvar modelo" });
    expect(screen.queryByText("Recalcular pontos")).not.toBeInTheDocument();
    expect(screen.queryByText("Sincronizar resultados")).not.toBeInTheDocument();
    expect(screen.queryByText("Importar da API")).not.toBeInTheDocument();
  });

  it("admin do app recalcula os pontos e vê o resultado", async () => {
    loginAs(ADMIN_USER);
    seed("u9");
    mockDb.tables.bolao_pools[0].bolao_pool_members = [{ user_id: "admin-1" }];
    mockDb.tables.bolao_matches[0].status = "FINISHED";
    mount();
    fireEvent.click(await screen.findByText("Admin"));
    fireEvent.click(await screen.findByText("Recalcular pontos"));
    expect(await screen.findByText(/Pontos recalculados para 1 partida/)).toBeInTheDocument();
    expect(supabaseMock.rpc).toHaveBeenCalledWith("score_match_predictions", { p_match_id: "m1", p_pool_id: "p1" });
  });

  it("aba Info lista os participantes, marca '(você)' e o criador", async () => {
    loginAs();
    seed("u2");
    mount();
    fireEvent.click(await screen.findByText("Info"));
    expect(await screen.findByText("(você)")).toBeInTheDocument();
    expect(screen.getByText("criador")).toBeInTheDocument();
    expect(screen.getAllByText(/Beltrano/).length).toBeGreaterThan(0);
  });

  it("sair do bolão pede confirmação, remove a participação e volta para a lista", async () => {
    loginAs();
    seed("u9");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByText("Info"));
    fireEvent.click(await screen.findByText("Sair do bolão"));
    expect(confirm).toHaveBeenCalledWith("Sair do bolão?");
    expect(mockDb.writes.some((w) => w.table === "bolao_pool_members" && w.op === "delete")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Sair do bolão"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/bolao$/));
    expect(mockDb.writes.some((w) => w.table === "bolao_pool_members" && w.op === "delete")).toBe(true);
    confirm.mockRestore();
  });
});
