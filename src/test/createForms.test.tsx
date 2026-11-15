import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { DuelosPage } from "@/features/duelos/DuelosPage";
import { ArenaPage } from "@/features/arena/ArenaPage";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mount = (el: ReactNode) =>
  render(
    <MemoryRouter initialEntries={["/x"]}>
      <AuthProvider>
        <Ready>
          <Where />
          <Routes>
            <Route path="/x" element={el} />
            <Route path="*" element={<div>destino</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("Duelos — criar", () => {
  const open = async () => {
    loginAs();
    mount(<DuelosPage />);
    fireEvent.click(await screen.findByText("Criar o primeiro"));
    return {
      title: await screen.findByPlaceholderText("Ex: Melhores filmes do Nolan"),
      items: screen.getByPlaceholderText(/Item A/),
      create: screen.getByRole("button", { name: "Começar a duelar" }),
    };
  };

  it("só habilita com tema e pelo menos 2 itens distintos", async () => {
    const f = await open();
    expect(f.create).toBeDisabled();
    fireEvent.change(f.title, { target: { value: "Filmes do Nolan" } });
    expect(f.create).toBeDisabled();
    fireEvent.change(f.items, { target: { value: "Interestelar" } });
    expect(f.create).toBeDisabled();
    // repetido (mesmo ignorando maiúsculas) não conta como 2º item
    fireEvent.change(f.items, { target: { value: "Interestelar\ninterestelar\n  " } });
    expect(f.create).toBeDisabled();
    fireEvent.change(f.items, { target: { value: "Interestelar\nA Origem" } });
    expect(f.create).toBeEnabled();
  });

  it("mostra a contagem de itens válidos", async () => {
    const f = await open();
    fireEvent.change(f.items, { target: { value: "A\nB\n\nC\na" } });
    expect(screen.getByText(/mínimo 2\) — 3/)).toBeInTheDocument();
  });

  it("cria o ranking com os itens na ordem e abre a tela do duelo", async () => {
    const f = await open();
    mockDb.tables.duel_rankings = [{ id: "novo" }];
    fireEvent.change(f.title, { target: { value: "  Filmes do Nolan  " } });
    fireEvent.change(f.items, { target: { value: "Interestelar\n\nA Origem\nInterestelar" } });
    fireEvent.click(f.create);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/duelos/novo"));
    expect(mockDb.writes.find((w) => w.table === "duel_rankings")!.args[0]).toMatchObject({ owner_id: "user-1", title: "Filmes do Nolan" });
    expect(mockDb.writes.find((w) => w.table === "duel_items")!.args[0]).toEqual([
      { ranking_id: "novo", name: "Interestelar", position: 0 },
      { ranking_id: "novo", name: "A Origem", position: 1 },
    ]);
  });

  it("erro do banco aparece e não navega", async () => {
    const f = await open();
    mockDb.errors.duel_rankings = { message: "sem permissão" };
    fireEvent.change(f.title, { target: { value: "T" } });
    fireEvent.change(f.items, { target: { value: "A\nB" } });
    fireEvent.click(f.create);
    expect(await screen.findByText("sem permissão")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/x");
  });
});

describe("Arena — criar caso", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = async () => {
    loginAs();
    mount(<ArenaPage />);
    fireEvent.click(await screen.findByText("Criar o primeiro"));
    await screen.findByPlaceholderText(/Quem vai ganhar o Oscar/);
  };
  const fill = () => {
    fireEvent.change(screen.getByPlaceholderText(/Quem vai ganhar o Oscar/), { target: { value: "Quem leva o Oscar?" } });
    fireEvent.change(screen.getByPlaceholderText("Ex: Emilia Pérez"), { target: { value: "Emilia" } });
    fireEvent.change(screen.getByPlaceholderText("Ex: The Brutalist"), { target: { value: "Brutalist" } });
    fireEvent.change(screen.getByPlaceholderText("Ex: Anora"), { target: { value: "Anora" } });
  };
  const odds = () => screen.getAllByPlaceholderText("1.80");

  it("'Publicar Caso' exige tudo preenchido, categoria e odds ≥ 1,01", async () => {
    await open();
    const publish = screen.getByRole("button", { name: /Publicar Caso/ });
    expect(publish).toBeDisabled();
    fill();
    expect(publish).toBeDisabled(); // falta categoria e odds
    fireEvent.click(screen.getByText(/Cinema/));
    expect(publish).toBeDisabled(); // falta odds
    const [a, b, c] = odds();
    fireEvent.change(a, { target: { value: "1.8" } });
    fireEvent.change(b, { target: { value: "3.5" } });
    fireEvent.change(c, { target: { value: "1.0" } }); // abaixo do mínimo
    expect(publish).toBeDisabled();
    fireEvent.change(c, { target: { value: "2.1" } });
    expect(publish).toBeEnabled();
  });

  it("categoria personalizada ('Outra') pede o nome", async () => {
    await open();
    fill();
    const [a, b, c] = odds();
    for (const [el, v] of [[a, "2"], [b, "2"], [c, "3"]] as const) fireEvent.change(el, { target: { value: v } });
    const publish = screen.getByRole("button", { name: /Publicar Caso/ });
    fireEvent.click(screen.getByText(/Outra/));
    expect(publish).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Política, Tecnologia/), { target: { value: "Política" } });
    expect(publish).toBeEnabled();
  });

  it("'Sugerir com IA' só habilita com o cenário e as 3 opções e preenche as odds", async () => {
    await open();
    const ai = screen.getByRole("button", { name: /Sugerir com IA/ });
    expect(ai).toBeDisabled();
    fill();
    expect(ai).toBeEnabled();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"odds_a":1.5,"odds_b":4.2,"odds_c":3.3,"justification":"x"}' }] } }] }),
    });
    fireEvent.click(ai);
    await waitFor(() => expect(odds().map((i) => (i as HTMLInputElement).value)).toEqual(["1.5", "4.2", "3.3"]));
  });

  it("publicar grava o caso aberto e abre a tela dele", async () => {
    await open();
    fill();
    fireEvent.click(screen.getByText(/Cinema/));
    const [a, b, c] = odds();
    for (const [el, v] of [[a, "1.8"], [b, "3.5"], [c, "2.1"]] as const) fireEvent.change(el, { target: { value: v } });
    mockDb.tables.arena_duels = [{ id: "novo-caso" }];
    fireEvent.click(screen.getByRole("button", { name: /Publicar Caso/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/arena/novo-caso"));
    expect(mockDb.writes.find((w) => w.table === "arena_duels")!.args[0]).toMatchObject({
      created_by: "user-1",
      scenario: "Quem leva o Oscar?",
      option_a: "Emilia",
      category: "Cinema",
      odds_a: 1.8,
      odds_b: 3.5,
      odds_c: 2.1,
      status: "open",
    });
  });
});
