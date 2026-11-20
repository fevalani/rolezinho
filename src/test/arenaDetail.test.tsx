import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { ArenaDetailPage } from "@/features/arena/ArenaDetailPage";
import { loginAs } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={["/arena/d1"]}>
      <AuthProvider>
        <Ready>
          <Routes>
            <Route path="/arena/:duelId" element={<ArenaDetailPage />} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const duel = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  created_by: "u2",
  scenario: "Quem ganha o Oscar?",
  option_a: "Filme A",
  option_b: "Filme B",
  option_c: "Nenhum",
  category: "Cinema",
  creator_context: null,
  odds_a: 2,
  odds_b: 3,
  odds_c: 4,
  odds_justification: null,
  status: "open",
  result: null,
  verdict: null,
  created_at: "",
  updated_at: "",
  profiles: { display_name: "Criador", avatar_url: null },
  ...over,
});

// Dinheiro só se move por RPC no banco (auditoria S-01): a tela chama a função certa.
const rpcCalls = (name: string) => supabaseMock.rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1]);
const calledRpc = (name: string) => rpcCalls(name).length > 0;
// nada de escrita direta em carteira/aposta pelo cliente
const noDirectMoneyWrites = () =>
  expect(mockDb.writes.some((w) => w.table === "arena_wallets" || w.table === "arena_bets")).toBe(false);

const seed = (over: Record<string, unknown> = {}, balance = 1000) => {
  mockDb.tables.arena_duels = [duel(over)];
  mockDb.tables.arena_wallets = [{ user_id: "user-1", balance }];
};

describe("ArenaDetailPage — apostar", () => {
  it("sem escolher opção o botão pede para selecionar", async () => {
    loginAs();
    seed();
    mount();
    expect(await screen.findByText("Selecione uma opção para apostar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecione uma opção para apostar" })).toBeDisabled();
    expect(screen.getByText(/Saldo disponível: 1\.000 pts/)).toBeInTheDocument();
  });

  it("escolher opção e valor mostra o ganho potencial (valor × odd, arredondado para baixo)", async () => {
    loginAs();
    seed();
    mount();
    fireEvent.click(await screen.findByText("Filme B")); // odd 3
    fireEvent.click(screen.getByText("50", { selector: "button" }));
    expect(await screen.findByRole("button", { name: "Apostar 50 pts" })).toBeEnabled();
    expect(screen.getByText("Ganho potencial")).toBeInTheDocument();
    expect(screen.getByText("150 pts")).toBeInTheDocument();
  });

  it("confirmar grava a aposta e desconta o saldo", async () => {
    loginAs();
    seed();
    mount();
    fireEvent.click(await screen.findByText("Filme A"));
    fireEvent.click(screen.getByText("100", { selector: "button" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apostar 100 pts" }));
    await waitFor(() => expect(calledRpc("arena_place_bet")).toBe(true));
    // o cliente só manda caso, lado e valor: usuário, odd e saldo são do banco
    expect(rpcCalls("arena_place_bet")[0]).toEqual({ p_duel_id: "d1", p_side: "A", p_amount: 100 });
    noDirectMoneyWrites();
  });

  it("saldo insuficiente bloqueia a aposta", async () => {
    loginAs();
    seed({}, 30);
    mount();
    fireEvent.click(await screen.findByText("Filme A"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "500" } });
    const btn = await screen.findByRole("button", { name: "Saldo insuficiente" });
    expect(btn).toBeDisabled();
    expect(mockDb.writes.some((w) => w.table === "arena_bets")).toBe(false);
  });

  it("os atalhos de valor nunca passam do saldo", async () => {
    loginAs();
    seed({}, 40);
    mount();
    fireEvent.click(await screen.findByText("Filme A"));
    fireEvent.click(screen.getByText("200", { selector: "button" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(40);
  });

  it("erro do banco ao apostar é mostrado", async () => {
    loginAs();
    seed();
    mockDb.errors["rpc:arena_place_bet"] = { message: "dup", code: "23505" };
    mount();
    fireEvent.click(await screen.findByText("Filme A"));
    fireEvent.click(screen.getByText("10", { selector: "button" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apostar 10 pts" }));
    expect(await screen.findByText("Você já apostou neste caso")).toBeInTheDocument();
  });

  it("caso fechado não aceita aposta", async () => {
    loginAs();
    seed({ status: "closed" });
    mount();
    await screen.findByText("Quem ganha o Oscar?");
    expect(screen.queryByText("Selecione uma opção para apostar")).not.toBeInTheDocument();
  });
});

describe("ArenaDetailPage — criador e prêmios", () => {
  it("só o criador vê 'Fechar Apostas' e ele fecha o caso", async () => {
    loginAs();
    seed({ created_by: "user-1" });
    mount();
    fireEvent.click(await screen.findByText(/Fechar Apostas/));
    await waitFor(() => expect(calledRpc("arena_close_duel")).toBe(true));
    expect(rpcCalls("arena_close_duel")[0]).toEqual({ p_duel_id: "d1" });
    expect(mockDb.writes.some((w) => w.table === "arena_duels")).toBe(false);
  });
  it("quem não criou não vê 'Fechar Apostas'", async () => {
    loginAs();
    seed({ created_by: "u2" });
    mount();
    await screen.findByText("Quem ganha o Oscar?");
    expect(screen.queryByText(/Fechar Apostas/)).not.toBeInTheDocument();
  });

  it("o veredito exige resultado e pelo menos 10 caracteres", async () => {
    loginAs();
    seed({ created_by: "user-1", status: "closed" });
    mount();
    const publish = await screen.findByRole("button", { name: /Publicar Veredito/ });
    expect(publish).toBeDisabled();
    const optA = screen.getAllByText("Filme A");
    fireEvent.click(optA[optA.length - 1]); // a opção do veredito vem depois da lista de apostas
    fireEvent.change(screen.getByPlaceholderText(/Explique o que aconteceu/), { target: { value: "curto" } });
    expect(publish).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Explique o que aconteceu/), { target: { value: "Filme A levou o prêmio" } });
    expect(publish).toBeEnabled();
  });

  it("publicar o veredito resolve o caso", async () => {
    loginAs();
    seed({ created_by: "user-1", status: "closed" });
    mount();
    const optB = await screen.findAllByText("Filme B");
    fireEvent.click(optB[optB.length - 1]);
    fireEvent.change(screen.getByPlaceholderText(/Explique o que aconteceu/), { target: { value: "Filme B levou o prêmio" } });
    fireEvent.click(screen.getByRole("button", { name: /Publicar Veredito/ }));
    await waitFor(() => expect(calledRpc("arena_resolve_duel")).toBe(true));
    expect(rpcCalls("arena_resolve_duel")[0]).toEqual({ p_duel_id: "d1", p_result: "B", p_verdict: "Filme B levou o prêmio" });
    noDirectMoneyWrites();
  });

  it("vencedor resgata o prêmio e o saldo é creditado", async () => {
    loginAs();
    seed({ status: "resolved", result: "A", verdict: "A venceu" }, 500);
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "user-1", side: "A", amount: 100, potential_payout: 200, actual_payout: 200, payout_claimed: false, created_at: "" }];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Resgatar 200 pts/ }));
    await waitFor(() => expect(calledRpc("arena_claim_payout")).toBe(true));
    // o valor do prêmio não viaja do cliente: o banco usa o actual_payout gravado
    expect(rpcCalls("arena_claim_payout")[0]).toEqual({ p_bet_id: "b1" });
    noDirectMoneyWrites();
  });

  it("prêmio já resgatado não mostra o botão", async () => {
    loginAs();
    seed({ status: "resolved", result: "A", verdict: "A venceu" });
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "user-1", side: "A", amount: 100, actual_payout: 200, payout_claimed: true, created_at: "" }];
    mount();
    await screen.findByText("Quem ganha o Oscar?");
    expect(screen.queryByRole("button", { name: /Resgatar/ })).not.toBeInTheDocument();
  });

  it("quem apostou no lado errado não tem prêmio para resgatar", async () => {
    loginAs();
    seed({ status: "resolved", result: "A", verdict: "A venceu" });
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "user-1", side: "B", amount: 100, actual_payout: 0, payout_claimed: false, created_at: "" }];
    mount();
    await screen.findByText("Quem ganha o Oscar?");
    expect(screen.queryByRole("button", { name: /Resgatar/ })).not.toBeInTheDocument();
  });

  it("cancelar a aposta devolve o valor", async () => {
    loginAs();
    seed({}, 400);
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "user-1", side: "A", amount: 100, potential_payout: 200, actual_payout: null, payout_claimed: false, created_at: "" }];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Cancelar aposta · \+100 pts de volta/ }));
    await waitFor(() => expect(calledRpc("arena_delete_bet")).toBe(true));
    expect(rpcCalls("arena_delete_bet")[0]).toEqual({ p_bet_id: "b1" });
    noDirectMoneyWrites();
  });
});
