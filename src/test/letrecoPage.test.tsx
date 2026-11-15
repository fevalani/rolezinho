import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LetrecoPage } from "@/features/letreco/LetrecoPage";
import { getWordOfDay, getGameDate, pointsFor, WORD_LIST } from "@/features/letreco/letrecoLogic";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const type = (word: string) => {
  for (const ch of word) fireEvent.keyDown(window, { key: ch });
};
const enter = () => fireEvent.keyDown(window, { key: "Enter" });

const ready = async () => {
  loginAs();
  renderWithProviders(<LetrecoPage />);
  await screen.findByText(/Letreco/);
};

describe("LetrecoPage — jogando", () => {
  it("mostra os 4 modos de jogo", async () => {
    await ready();
    for (const label of ["🟩 Letreco", "🔠 Letroso", "🧩 Sudoku", "🎯 Word500"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("Enter com palavra incompleta avisa 'Faltam letras'", async () => {
    await ready();
    type("AB");
    enter();
    expect(await screen.findByText("Faltam letras")).toBeInTheDocument();
    expect(mockDb.writes.filter((w) => w.table === "letreco_games")).toHaveLength(0);
  });

  it("palavra fora da lista é recusada e não grava", async () => {
    await ready();
    type("ZZZZZ");
    enter();
    expect(await screen.findByText("Palavra não está na lista")).toBeInTheDocument();
    expect(mockDb.writes.filter((w) => w.table === "letreco_games")).toHaveLength(0);
  });

  it("palpite válido errado grava a tentativa em andamento", async () => {
    await ready();
    const answer = getWordOfDay();
    const wrong = WORD_LIST.find((w) => w !== answer)!;
    type(wrong);
    enter();
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "letreco_games")).toBe(true));
    const row = mockDb.writes.find((w) => w.table === "letreco_games")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: "user-1", game_date: getGameDate(), status: "playing", attempts: 1, score: 0 });
    expect(row.guesses).toHaveLength(1);
  });

  it("acertar de primeira grava vitória com a pontuação máxima", async () => {
    await ready();
    type(getWordOfDay());
    enter();
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "letreco_games")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "letreco_games")!.args[0]).toMatchObject({
      status: "won",
      attempts: 1,
      score: pointsFor(1),
    });
  });

  it("Backspace apaga a última letra digitada", async () => {
    await ready();
    type("AB");
    fireEvent.keyDown(window, { key: "Backspace" });
    type("C");
    type("DE"); // A, C, D, E = 4 letras → ainda faltam
    enter();
    expect(await screen.findByText("Faltam letras")).toBeInTheDocument();
  });

  it("ignora teclas com Ctrl/Alt (atalhos do navegador)", async () => {
    await ready();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    type("ABCD");
    enter();
    expect(await screen.findByText("Faltam letras")).toBeInTheDocument();
  });

  it("partida já finalizada hoje não aceita novos palpites", async () => {
    loginAs();
    mockDb.tables.letreco_games = [
      { id: "g1", user_id: "user-1", game_date: getGameDate(), guesses: [getWordOfDay()], status: "won", attempts: 1, score: pointsFor(1), finished_at: "x", created_at: "x" },
    ];
    renderWithProviders(<LetrecoPage />);
    await screen.findByText(/Letreco/);
    await new Promise((r) => setTimeout(r, 50)); // deixa o carregamento terminar
    const before = mockDb.writes.filter((w) => w.table === "letreco_games").length;
    type(WORD_LIST.find((w) => w !== getWordOfDay())!);
    enter();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockDb.writes.filter((w) => w.table === "letreco_games").length).toBe(before);
  });
});

describe("LetrecoPage — outros modos", () => {
  it("trocar de modo monta o jogo correspondente", async () => {
    await ready();
    const header = screen.getByText("🧩 Sudoku");
    fireEvent.click(header);
    // sai da tela do Letreco: o cabeçalho "Faltam letras"/teclado do Letreco some
    await waitFor(() => expect(within(document.body).queryByText("↵")).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("🟩 Letreco"));
    await waitFor(() => expect(screen.getAllByText("↵").length).toBeGreaterThan(0));
  });
});
