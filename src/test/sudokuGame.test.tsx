import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SudokuGame } from "@/features/letreco/SudokuGame";
import { getSudokuOfDay, getSudokuGameDate, SUDOKU_DIFFICULTIES, applyGuess } from "@/features/letreco/sudokuLogic";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const cells = () => Array.from(document.querySelectorAll<HTMLButtonElement>("button.aspect-square"));
// teclado numérico (os botões 1–9 de baixo; as células do tabuleiro também têm dígitos)
const digitBtn = (d: number) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button.w-10.h-10")).find((b) => b.textContent?.trim() === String(d))!;

const start = async (diff: "facil" | "medio" | "dificil" = "facil") => {
  loginAs();
  renderWithProviders(<SudokuGame />);
  fireEvent.click(await screen.findByText(SUDOKU_DIFFICULTIES[diff].label));
  await waitFor(() => expect(cells()).toHaveLength(81));
  return getSudokuOfDay(diff);
};

describe("SudokuGame", () => {
  it("sem partida hoje pede a dificuldade, com pontuação e pistas de cada nível", async () => {
    loginAs();
    renderWithProviders(<SudokuGame />);
    expect(await screen.findByText("Escolha a dificuldade")).toBeInTheDocument();
    for (const cfg of Object.values(SUDOKU_DIFFICULTIES)) {
      expect(screen.getByText(cfg.label)).toBeInTheDocument();
      expect(screen.getByText(`${cfg.clues} pistas no tabuleiro`)).toBeInTheDocument();
    }
  });

  it("escolher a dificuldade monta o tabuleiro e já grava a partida em andamento", async () => {
    const { puzzle } = await start("facil");
    const given = cells().filter((c) => c.textContent && /^[1-9]$/.test(c.textContent.trim())).length;
    expect(given).toBe(puzzle.split("").filter((d) => d !== "0").length);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "sudoku_games")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "sudoku_games")!.args[0]).toMatchObject({
      user_id: "user-1",
      game_date: getSudokuGameDate(),
      difficulty: "facil",
      board: puzzle,
      mistakes: 0,
      status: "playing",
    });
    expect(screen.getByText(/0 erros/)).toBeInTheDocument();
  });

  it("os números ficam desabilitados até selecionar uma célula", async () => {
    await start();
    expect(digitBtn(5)).toBeDisabled();
    const empty = cells().find((c) => !c.textContent?.trim());
    fireEvent.click(empty!);
    expect(digitBtn(5)).toBeEnabled();
  });

  it("número errado conta um erro e não altera o tabuleiro", async () => {
    const { puzzle, solution } = await start();
    const idx = puzzle.split("").findIndex((d) => d === "0");
    const wrong = (Number(solution[idx]) % 9) + 1;
    fireEvent.click(cells()[idx]);
    fireEvent.click(digitBtn(wrong));
    expect(await screen.findByText(/1 erro(?!s)/)).toBeInTheDocument();
    expect(cells()[idx].textContent?.trim()).toBe("");
  });

  it("número certo preenche a célula e grava o progresso", async () => {
    const { puzzle, solution } = await start();
    const idx = puzzle.split("").findIndex((d) => d === "0");
    mockDb.writes.length = 0;
    fireEvent.click(cells()[idx]);
    fireEvent.click(digitBtn(Number(solution[idx])));
    await waitFor(() => expect(cells()[idx].textContent?.trim()).toBe(solution[idx]));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "sudoku_games")).toBe(true));
    const saved = mockDb.writes.find((w) => w.table === "sudoku_games")!.args[0] as { board: string; status: string };
    expect(saved.status).toBe("playing");
    expect(saved.board).toBe(applyGuess(puzzle, solution, idx, Number(solution[idx])).board);
  });

  it("não deixa alterar as pistas iniciais", async () => {
    const { puzzle } = await start();
    const givenIdx = puzzle.split("").findIndex((d) => d !== "0");
    fireEvent.click(cells()[givenIdx]);
    fireEvent.click(digitBtn(Number(puzzle[givenIdx]) % 9 + 1));
    expect(screen.getByText(/0 erros/)).toBeInTheDocument();
  });

  it("completar o tabuleiro sem erros grava a vitória com pontuação", async () => {
    const { puzzle, solution } = await start();
    const empties = puzzle.split("").map((d, i) => (d === "0" ? i : -1)).filter((i) => i >= 0);
    for (const i of empties) {
      fireEvent.click(cells()[i]);
      fireEvent.click(digitBtn(Number(solution[i])));
    }
    await waitFor(() => {
      const wins = mockDb.writes.filter((w) => w.table === "sudoku_games" && (w.args[0] as { status: string }).status === "won");
      expect(wins).toHaveLength(1);
    });
    const win = mockDb.writes.filter((w) => w.table === "sudoku_games").pop()!.args[0] as Record<string, unknown>;
    expect(win).toMatchObject({ status: "won", mistakes: 0, board: solution });
    expect(Number(win.score)).toBeGreaterThan(0);
    expect(typeof win.finished_at).toBe("string");
  });

  it("retoma a partida salva: sem seletor, com os erros anteriores", async () => {
    loginAs();
    const { puzzle } = getSudokuOfDay("medio");
    mockDb.tables.sudoku_games = [
      { id: "s1", user_id: "user-1", game_date: getSudokuGameDate(), difficulty: "medio", board: puzzle, mistakes: 3, elapsed_seconds: 120, status: "playing", score: 0, started_at: new Date().toISOString() },
    ];
    renderWithProviders(<SudokuGame />);
    await waitFor(() => expect(cells()).toHaveLength(81));
    expect(screen.queryByText("Escolha a dificuldade")).not.toBeInTheDocument();
    expect(screen.getByText(/3 erros/)).toBeInTheDocument();
    expect(screen.getByText(/Médio/)).toBeInTheDocument();
  });

  it("partida já vencida não aceita mais jogadas (células desabilitadas)", async () => {
    loginAs();
    const { solution } = getSudokuOfDay("facil");
    mockDb.tables.sudoku_games = [
      { id: "s1", user_id: "user-1", game_date: getSudokuGameDate(), difficulty: "facil", board: solution, mistakes: 0, elapsed_seconds: 300, status: "won", score: 900, started_at: new Date().toISOString() },
    ];
    renderWithProviders(<SudokuGame />);
    await waitFor(() => expect(cells()).toHaveLength(81));
    expect(cells().every((c) => c.disabled)).toBe(true);
  });

  describe("cronômetro (só conta o tempo com a tela visível)", () => {
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const lastSave = () =>
      mockDb.writes.filter((w) => w.table === "sudoku_games").pop()!.args[0] as { elapsed_seconds: number; status: string };

    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });

    it("conta o tempo, pausa ao ocultar a página (gravando o tempo) e retoma ao voltar", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      await start();
      tick(90_000);
      expect(screen.getByText(/1:30/)).toBeInTheDocument();

      mockDb.writes.length = 0;
      act(() => setHidden(true));
      expect(lastSave()).toMatchObject({ status: "playing", elapsed_seconds: 90 });

      tick(60_000); // tempo fora da tela não conta
      act(() => setHidden(false));
      tick(10_000);
      expect(screen.getByText(/1:40/)).toBeInTheDocument();
    });

    it("botão de pausar congela o tempo, borra o tabuleiro e bloqueia as jogadas; retomar volta a contar", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      const { puzzle, solution } = await start();
      tick(30_000);
      expect(screen.getByText(/0:30/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Pausar partida" }));
      expect(screen.getByText("jogo pausado")).toBeInTheDocument();
      expect(cells().every((c) => c.disabled)).toBe(true);
      tick(60_000); // pausado não conta
      expect(screen.getByText(/0:30/)).toBeInTheDocument();

      // número não entra enquanto pausado
      const idx = puzzle.split("").findIndex((d) => d === "0");
      expect(digitBtn(Number(solution[idx]))).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Retomar partida" }));
      expect(screen.queryByText("jogo pausado")).not.toBeInTheDocument();
      tick(10_000);
      expect(screen.getByText(/0:40/)).toBeInTheDocument();
    });

    it("o botão ▶️ retomar do overlay também despausa", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      await start();
      fireEvent.click(screen.getByRole("button", { name: "Pausar partida" }));
      fireEvent.click(screen.getByText(/retomar$/));
      expect(screen.queryByText("jogo pausado")).not.toBeInTheDocument();
      tick(5_000);
      expect(screen.getByText(/0:05/)).toBeInTheDocument();
    });

    it("retoma a partida a partir do tempo salvo (e do backup local, se maior)", async () => {
      loginAs();
      const { puzzle } = getSudokuOfDay("medio");
      mockDb.tables.sudoku_games = [
        { id: "s1", user_id: "user-1", game_date: getSudokuGameDate(), difficulty: "medio", board: puzzle, mistakes: 0, elapsed_seconds: 120, status: "playing", score: 0, started_at: new Date(Date.now() - 3600_000).toISOString() },
      ];
      localStorage.setItem(`sudoku-elapsed:user-1:${getSudokuGameDate()}`, "150");
      renderWithProviders(<SudokuGame />);
      await waitFor(() => expect(cells()).toHaveLength(81));
      expect(screen.getByText(/2:30/)).toBeInTheDocument();
      localStorage.clear();
    });
  });
});

describe("SudokuGame — número travado no rascunho", () => {
  const emptyCells = (puzzle: string) => cells().filter((_, i) => puzzle[i] === "0");
  const lock = (d: number) => {
    vi.useFakeTimers();
    const btn = digitBtn(d);
    fireEvent.pointerDown(btn);
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    vi.useRealTimers();
  };

  it("com o número travado, tocar em várias células já anota nele, sem selecionar de novo", async () => {
    const { puzzle, solution } = await start("facil");
    fireEvent.click(screen.getByText(/Rascunho desligado/));
    // células vazias cuja solução é o dígito escolhido: nunca conflitam com as pistas
    const digit = Number(solution[cells().indexOf(emptyCells(puzzle)[0])]);
    const targets = emptyCells(puzzle)
      .filter((c) => solution[cells().indexOf(c)] === String(digit))
      .slice(0, 2);
    expect(targets).toHaveLength(2);
    lock(digit);
    expect(digitBtn(digit)).toHaveAttribute("aria-pressed", "true");
    for (const c of targets) fireEvent.click(c);
    // anotado nas duas, sem ter selecionado nenhuma antes; o número segue travado
    for (const c of targets) expect(c.textContent?.trim()).toBe(String(digit));
    expect(digitBtn(digit)).toHaveAttribute("aria-pressed", "true");
  });

  it("ao desligar o rascunho o número é destravado", async () => {
    const { puzzle, solution } = await start("facil");
    fireEvent.click(screen.getByText(/Rascunho desligado/));
    const first = emptyCells(puzzle)[0];
    const digit = Number(solution[cells().indexOf(first)]);
    lock(digit);
    expect(digitBtn(digit)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText(/Rascunho ativo/)); // volta ao modo normal
    fireEvent.click(screen.getByText(/Rascunho desligado/)); // e entra de novo
    expect(digitBtn(digit)).toHaveAttribute("aria-pressed", "false");
    // tocar na célula agora só seleciona: nada é anotado
    fireEvent.click(first);
    expect(first.textContent?.trim()).toBe("");
  });
});
