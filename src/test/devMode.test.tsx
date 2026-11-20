import { describe, it, expect } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { DEV_MODE_KEY, readDevMode, setDevMode, useDevMode } from "@/lib/useDevMode";
import { DevModeCard } from "@/components/DevModeCard";
import { ProfilePage } from "@/pages/ProfilePage";
import { LetrecoPage } from "@/features/letreco/LetrecoPage";
import { OverallRankingModal } from "@/features/letreco/LetrecoOverallModal";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";
import { render } from "@testing-library/react";

describe("useDevMode", () => {
  it("começa desligado", () => {
    expect(readDevMode()).toBe(false);
    const { result } = renderHook(() => useDevMode());
    expect(result.current[0]).toBe(false);
  });

  it("liga e desliga, persistindo no localStorage", () => {
    const { result } = renderHook(() => useDevMode());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(DEV_MODE_KEY)).toBe("1");
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(DEV_MODE_KEY)).toBeNull();
  });

  it("lê o valor já guardado", () => {
    localStorage.setItem(DEV_MODE_KEY, "1");
    expect(readDevMode()).toBe(true);
  });

  it("todos os componentes ouvintes atualizam juntos", () => {
    const a = renderHook(() => useDevMode());
    const b = renderHook(() => useDevMode());
    act(() => setDevMode(true));
    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
  });

  it("reage a mudança vinda de outra aba (evento storage)", () => {
    const { result } = renderHook(() => useDevMode());
    localStorage.setItem(DEV_MODE_KEY, "1");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: DEV_MODE_KEY }));
    });
    expect(result.current[0]).toBe(true);
  });

  it("sem acesso ao storage fica desligado e não quebra", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(readDevMode()).toBe(false);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});

describe("DevModeCard / Perfil", () => {
  it("o switch liga e desliga o modo", () => {
    render(<DevModeCard />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Desligado")).toBeInTheDocument();
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Ligado")).toBeInTheDocument();
    expect(readDevMode()).toBe(true);
  });

  it("aparece no Perfil", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByText("Modo desenvolvedor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(readDevMode()).toBe(true);
  });
});

describe("LetrecoPage — jogos em teste", () => {
  const open = async () => {
    loginAs();
    renderWithProviders(<LetrecoPage />);
    await screen.findByText("🎯 Word500");
  };

  it("o Fronteiras aparece para todos, sem o modo desenvolvedor", async () => {
    await open();
    fireEvent.click(await screen.findByText(/Fronteiras/));
    fireEvent.click(await screen.findByRole("button", { name: /Fácil/ }));
    expect(await screen.findByLabelText("Palpite de país")).toBeInTheDocument();
  });

  it("com o modo ligado, a aba continua abrindo o jogo", async () => {
    setDevMode(true);
    await open();
    fireEvent.click(await screen.findByText(/Fronteiras/));
    fireEvent.click(await screen.findByRole("button", { name: /Fácil/ }));
    expect(await screen.findByLabelText("Palpite de país")).toBeInTheDocument();
  });

  it("o ranking geral do Fronteiras usa o próprio título e dados", async () => {
    setDevMode(true);
    mockDb.tables.fronteiras_games = [
      { user_id: "u9", status: "won", score: 100, profiles: { display_name: "Beto Silva", avatar_url: null } },
    ];
    await open();
    fireEvent.click(await screen.findByText(/Fronteiras/));
    fireEvent.click(screen.getByText("🏆 Ranking"));
    expect(await screen.findByText("Ranking Fronteiras 🗺️")).toBeInTheDocument();
    expect(await screen.findByText("Beto")).toBeInTheDocument();
  });
});

describe("OverallRankingModal", () => {
  it("mostra carregando enquanto não há dados e fecha pelo ✕", async () => {
    let closed = false;
    const { container } = render(
      <OverallRankingModal gameMode="word500" entries={null} meId="u1" onClose={() => (closed = true)} />,
    );
    expect(screen.getByText("Ranking Word500 🎯")).toBeInTheDocument();
    expect(container.querySelector(".spinner")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Fechar"));
    await waitFor(() => expect(closed).toBe(true));
  });

  it("lista vazia mostra a mensagem de estado vazio", () => {
    render(<OverallRankingModal gameMode="letreco" entries={[]} meId="u1" onClose={() => {}} />);
    expect(screen.getByText(/Ainda não há pontuação acumulada/)).toBeInTheDocument();
  });

  it("destaca o próprio jogador", () => {
    render(
      <OverallRankingModal
        gameMode="sudoku"
        entries={[{ user_id: "u1", display_name: "Ana Souza", avatar_url: null, totalScore: 50, games: 2, wins: 1 }]}
        meId="u1"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("(você)")).toBeInTheDocument();
    expect(screen.getByText("50 pts")).toBeInTheDocument();
  });
});
