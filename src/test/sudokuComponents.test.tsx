import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SudokuBoard } from "@/features/letreco/sudoku/SudokuBoard";
import { SudokuDifficultyPicker } from "@/features/letreco/sudoku/SudokuDifficultyPicker";
import { SudokuHeader } from "@/features/letreco/sudoku/SudokuHeader";
import { SudokuLeaderboard } from "@/features/letreco/sudoku/SudokuLeaderboard";
import { SudokuNumberPad } from "@/features/letreco/sudoku/SudokuNumberPad";
import { SudokuResultSheet } from "@/features/letreco/sudoku/SudokuResultSheet";
import { SudokuRules } from "@/features/letreco/sudoku/SudokuRules";
import { SudokuSolvedPanel } from "@/features/letreco/sudoku/SudokuSolvedPanel";
import { SUDOKU_DIFFICULTIES, getSudokuOfDay } from "@/features/letreco/sudokuLogic";
import type { SudokuLeaderboardEntry } from "@/features/letreco/sudokuTypes";

const entry = (over: Partial<SudokuLeaderboardEntry> = {}): SudokuLeaderboardEntry => ({
  user_id: "u1",
  display_name: "Maria Silva",
  avatar_url: null,
  status: "won",
  finished_at: null,
  difficulty: "medio",
  elapsed_seconds: 125,
  mistakes: 2,
  score: 700,
  ...over,
});

describe("SudokuLeaderboard", () => {
  it("vazio mostra o convite", () => {
    render(<SudokuLeaderboard entries={[]} meId="u1" />);
    expect(screen.getByText(/Ninguém terminou ainda hoje/)).toBeInTheDocument();
  });
  it("lista com medalha, primeiro nome, tempo, erros e pontos; marca o próprio usuário", () => {
    render(
      <SudokuLeaderboard
        entries={[entry(), entry({ user_id: "u2", display_name: "João Souza", score: 500 })]}
        meId="u1"
      />,
    );
    expect(screen.getByText("🥇")).toBeInTheDocument();
    expect(screen.getByText("🥈")).toBeInTheDocument();
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
    expect(screen.getByText("(você)")).toBeInTheDocument();
    expect(screen.getAllByText(/2:05/)).toHaveLength(2);
    expect(screen.getByText("700 pts")).toBeInTheDocument();
    expect(screen.getAllByText("(você)")).toHaveLength(1);
  });
});

describe("SudokuRules", () => {
  it("explica a pontuação", () => {
    render(<SudokuRules />);
    expect(screen.getByText("Como pontua")).toBeInTheDocument();
    expect(screen.getByText(/1000 pts/)).toBeInTheDocument();
  });
});

describe("SudokuDifficultyPicker", () => {
  it("mostra a data, os 3 níveis e devolve o escolhido", () => {
    const onPick = vi.fn();
    render(<SudokuDifficultyPicker gameDate="2026-11-19" onPick={onPick} />);
    expect(screen.getByText(/19\/11\/2026/)).toBeInTheDocument();
    for (const cfg of Object.values(SUDOKU_DIFFICULTIES)) {
      expect(screen.getByText(`${cfg.clues} pistas no tabuleiro`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText(SUDOKU_DIFFICULTIES.dificil.label));
    expect(onPick).toHaveBeenCalledWith("dificil");
  });
});

describe("SudokuHeader", () => {
  const base = {
    gameDate: "2026-11-19",
    difficulty: "facil" as const,
    elapsedSeconds: 65,
    mistakes: 1,
    ranked: true,
    status: "playing" as const,
    manualPaused: false,
    onTogglePause: vi.fn(),
    onToggleRules: vi.fn(),
    onToggleRanked: vi.fn(),
    onNewPractice: vi.fn(),
    onShowResult: vi.fn(),
  };
  const setup = (over = {}) => {
    const props = { ...base, onTogglePause: vi.fn(), onToggleRules: vi.fn(), onToggleRanked: vi.fn(), onNewPractice: vi.fn(), onShowResult: vi.fn(), ...over };
    render(<SudokuHeader {...props} />);
    return props;
  };

  it("mostra data, dificuldade, tempo e erro no singular", () => {
    setup();
    expect(screen.getByText(/19\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
    expect(screen.getByText(/1 erro(?!s)/)).toBeInTheDocument();
    expect(screen.queryByText(/Modo treino/)).not.toBeInTheDocument();
  });
  it("botão de pausa aparece só jogando e alterna o rótulo", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pausar partida" }));
    expect(p.onTogglePause).toHaveBeenCalled();
  });
  it("pausado mostra 'Retomar partida'; terminada não mostra o botão", () => {
    setup({ manualPaused: true });
    expect(screen.getByRole("button", { name: "Retomar partida" })).toBeInTheDocument();
  });
  it("partida terminada esconde o botão de pausa e o menu oferece Resultado", () => {
    const p = setup({ status: "won" });
    expect(screen.queryByRole("button", { name: /partida/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mais opções"));
    fireEvent.click(screen.getByText(/Resultado/));
    expect(p.onShowResult).toHaveBeenCalled();
    expect(screen.queryByText(/Resultado/)).not.toBeInTheDocument(); // menu fecha
  });
  it("menu: Regras e Treino chamam os callbacks e fecham o menu", () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText("Mais opções"));
    fireEvent.click(screen.getByText(/Regras/));
    expect(p.onToggleRules).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Mais opções"));
    fireEvent.click(screen.getByRole("switch"));
    expect(p.onToggleRanked).toHaveBeenCalled();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
  it("modo treino mostra o aviso e 'Novo puzzle' no menu", () => {
    const p = setup({ ranked: false });
    expect(screen.getByText(/Modo treino/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mais opções"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByText(/Novo puzzle/));
    expect(p.onNewPractice).toHaveBeenCalled();
  });
});

describe("SudokuBoard", () => {
  const { puzzle } = getSudokuOfDay("facil");
  const setup = (over = {}) => {
    const props = {
      puzzle,
      board: puzzle,
      notes: {} as Record<number, number[]>,
      selected: null as number | null,
      flashIndex: null as number | null,
      flashConflicts: [] as number[],
      notesBlockMode: false,
      status: "playing" as const,
      isPaused: false,
      onSelect: vi.fn(),
      onResume: vi.fn(),
      onToggleNotesBlockMode: vi.fn(),
      ...over,
    };
    render(<SudokuBoard {...props} />);
    return props;
  };
  const cells = () => Array.from(document.querySelectorAll<HTMLButtonElement>("button.aspect-square"));

  it("desenha 81 células com as pistas e seleciona ao clicar", () => {
    const p = setup();
    expect(cells()).toHaveLength(81);
    fireEvent.click(cells()[10]);
    expect(p.onSelect).toHaveBeenCalledWith(10);
  });
  it("pausado: células desabilitadas e overlay com retomar", () => {
    const p = setup({ isPaused: true });
    expect(cells().every((c) => c.disabled)).toBe(true);
    expect(screen.getByText("jogo pausado")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/retomar/));
    expect(p.onResume).toHaveBeenCalled();
    fireEvent.click(cells()[0]);
    expect(p.onSelect).not.toHaveBeenCalled();
  });
  it("partida terminada desabilita as células", () => {
    setup({ status: "won" });
    expect(cells().every((c) => c.disabled)).toBe(true);
    expect(screen.queryByText("jogo pausado")).not.toBeInTheDocument();
  });
  it("mostra as anotações numa célula vazia (números ou blocos)", () => {
    const empty = puzzle.split("").findIndex((d) => d === "0");
    setup({ notes: { [empty]: [2, 5] } });
    const cell = cells()[empty];
    expect(cell.textContent).toContain("2");
    expect(cell.textContent).toContain("5");
  });
  it("modo bloco pinta quadradinhos em vez de números", () => {
    const empty = puzzle.split("").findIndex((d) => d === "0");
    setup({ notes: { [empty]: [2, 5] }, notesBlockMode: true });
    expect(cells()[empty].textContent).toBe("");
    expect(cells()[empty].querySelectorAll("span.bg-\\[var\\(--gold\\)\\]")).toHaveLength(2);
  });
  it("toggle da visualização de rascunho chama o callback", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("switch"));
    expect(p.onToggleNotesBlockMode).toHaveBeenCalled();
  });
});

describe("SudokuNumberPad", () => {
  const board = "0".repeat(81);
  it("teclado desabilitado sem célula selecionada; com seleção envia o dígito", () => {
    const onDigit = vi.fn();
    const { rerender } = render(
      <SudokuNumberPad board={board} selected={null} pencilMode={false} isPaused={false} onTogglePencil={vi.fn()} onDigit={onDigit} />,
    );
    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
    rerender(
      <SudokuNumberPad board={board} selected={3} pencilMode={false} isPaused={false} onTogglePencil={vi.fn()} onDigit={onDigit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(onDigit).toHaveBeenCalledWith(5);
  });
  it("dígito com as 9 ocorrências no tabuleiro fica desabilitado", () => {
    // 9 uns espalhados (um por linha/coluna/bloco não importa p/ isDigitComplete)
    const full = Array.from({ length: 81 }, (_, i) => (i % 9 === 0 ? "1" : "0")).join("");
    render(<SudokuNumberPad board={full} selected={3} pencilMode={false} isPaused={false} onTogglePencil={vi.fn()} onDigit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2" })).toBeEnabled();
  });
  it("pausado desabilita tudo, inclusive o rascunho", () => {
    render(<SudokuNumberPad board={board} selected={3} pencilMode={false} isPaused onTogglePencil={vi.fn()} onDigit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
    expect(screen.getByText(/Rascunho/)).toBeDisabled();
  });
  it("botão de rascunho mostra o estado e alterna", () => {
    const onTogglePencil = vi.fn();
    const { rerender } = render(
      <SudokuNumberPad board={board} selected={null} pencilMode={false} isPaused={false} onTogglePencil={onTogglePencil} onDigit={vi.fn()} />,
    );
    expect(screen.getByText(/Rascunho desligado/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Rascunho/));
    expect(onTogglePencil).toHaveBeenCalled();
    rerender(
      <SudokuNumberPad board={board} selected={null} pencilMode isPaused={false} onTogglePencil={onTogglePencil} onDigit={vi.fn()} />,
    );
    expect(screen.getByText(/Rascunho ativo/)).toBeInTheDocument();
  });
});

describe("SudokuSolvedPanel", () => {
  const base = { difficulty: "medio" as const, score: 800, elapsedSeconds: 125, mistakes: 0 };
  it("ranqueado: resumo e 'Ver placar do dia'", () => {
    const onShowResult = vi.fn();
    render(<SudokuSolvedPanel {...base} ranked onShowResult={onShowResult} onNewPractice={vi.fn()} />);
    expect(screen.getByText(/\+800 pts/)).toBeInTheDocument();
    expect(screen.getByText(/2:05/)).toBeInTheDocument();
    expect(screen.getByText(/0 erros/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver placar do dia"));
    expect(onShowResult).toHaveBeenCalled();
  });
  it("treino: oferece novo puzzle em vez do placar", () => {
    const onNewPractice = vi.fn();
    render(<SudokuSolvedPanel {...base} mistakes={1} ranked={false} onShowResult={vi.fn()} onNewPractice={onNewPractice} />);
    expect(screen.queryByText("Ver placar do dia")).not.toBeInTheDocument();
    expect(screen.getByText(/1 erro(?!s)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Novo puzzle/));
    expect(onNewPractice).toHaveBeenCalled();
  });
});

describe("SudokuResultSheet", () => {
  const setup = (over = {}) => {
    const props = { status: "won" as const, shareLabel: "Compartilhar resultado", leaderboard: [entry()], meId: "u1", onShare: vi.fn(), onClose: vi.fn(), ...over };
    render(<SudokuResultSheet {...props} />);
    return props;
  };
  it("ganhou: título, placar e compartilhar", () => {
    const p = setup();
    expect(screen.getByText(/Resolvido!/)).toBeInTheDocument();
    expect(screen.getByText("Placar do dia")).toBeInTheDocument();
    expect(screen.getByText("700 pts")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Compartilhar resultado/));
    expect(p.onShare).toHaveBeenCalled();
  });
  it("em andamento: título 'Resultado de hoje'; ✕ fecha", () => {
    const p = setup({ status: "playing", leaderboard: [] });
    expect(screen.getByText("Resultado de hoje")).toBeInTheDocument();
    expect(screen.getByText(/Ninguém terminou ainda hoje/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("✕"));
    expect(p.onClose).toHaveBeenCalled();
  });
  it("clicar no fundo fecha", () => {
    const p = setup();
    fireEvent.click(document.querySelector(".fixed.inset-0")!);
    expect(p.onClose).toHaveBeenCalled();
  });
});
