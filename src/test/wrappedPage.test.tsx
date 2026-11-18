import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { AuthProvider } from "@/lib/AuthContext";
import { WrappedPage } from "@/features/wrapped/WrappedPage";
import { WrappedAdminPage } from "@/features/wrapped/WrappedAdminPage";
import { HomePage } from "@/pages/HomePage";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { ADMIN_USER, TEST_USER, flush, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const edition = {
  slug: "2026",
  is_active: true,
  config: {
    pageTitle: "Wrapped 2026",
    subtitle: "Seu ano",
    slides: [
      { position: 1, type: "intro", title: "Preparado?" },
      { position: 2, type: "auto_user_stats", metricKey: "games" },
      { position: 3, type: "custom_ranking", title: "Top da plataforma", items: [{ rank: 1, label: "Campeão", sublabel: "12 acessos" }] },
    ],
  },
};

const mount = (route = "/wrapped") =>
  renderWithProviders(
    <Routes>
      <Route path="/wrapped" element={<WrappedPage />} />
      <Route path="/wrapped/:slug" element={<WrappedPage />} />
      <Route path="/" element={<p>home</p>} />
    </Routes>,
    { route },
  );

describe("WrappedPage", () => {
  beforeEach(() => loginAs(TEST_USER));
  afterEach(() => vi.useRealTimers());

  it("sem edição mostra o estado vazio", async () => {
    mount();
    expect(await screen.findByText(/Nenhuma retrospectiva/)).toBeInTheDocument();
  });

  it("omite o slide automático sem dados e navega por teclado", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mount();
    expect(await screen.findByText("Preparado?")).toBeInTheDocument();
    // intro, ranking, outro (games omitido)
    expect(document.querySelectorAll(".wrapped-bar")).toHaveLength(3);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Top da plataforma")).toBeInTheDocument();
    expect(screen.getByText("Campeão")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText("Preparado?")).toBeInTheDocument();
  });

  it("inclui o slide automático quando há dados", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mockDb.tables.sudoku_games = [{ game_date: "2026-03-01", status: "won", score: 10 }];
    mount();
    await screen.findByText("Preparado?");
    await waitFor(() => expect(document.querySelectorAll(".wrapped-bar")).toHaveLength(4));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Nos jogos do grupo")).toBeInTheDocument();
  });

  it("toque nas laterais avança/volta e segurar não avança", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mount();
    await screen.findByText("Preparado?");
    const root = screen.getByTestId("wrapped-root");
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    const tap = (x: number) => {
      fireEvent.pointerDown(root, { clientX: x, clientY: 100 });
      fireEvent.pointerUp(root, { clientX: x, clientY: 100 });
    };
    tap(300);
    expect(await screen.findByText("Top da plataforma")).toBeInTheDocument();
    tap(20);
    expect(await screen.findByText("Preparado?")).toBeInTheDocument();
    // swipe para a esquerda avança
    fireEvent.pointerDown(root, { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(root, { clientX: 100, clientY: 105 });
    expect(await screen.findByText("Top da plataforma")).toBeInTheDocument();
  });

  it("avança sozinho e pausa ao segurar", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mount();
    await screen.findByText("Preparado?");
    vi.useFakeTimers();
    const root = screen.getByTestId("wrapped-root");
    fireEvent.pointerDown(root, { clientX: 300, clientY: 100 });
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText("Preparado?")).toBeInTheDocument();
    fireEvent.pointerCancel(root);
    act(() => void vi.advanceTimersByTime(6500));
    expect(screen.getByText("Top da plataforma")).toBeInTheDocument();
  });

  it("último slide mostra compartilhar e baixar imagem", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mount();
    await screen.findByText("Preparado?");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("button", { name: "Compartilhar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar imagem" })).toBeInTheDocument();
  });

  it("é o Wrapped comum: soma os dados de todos e mostra o ranking de membros", async () => {
    mockDb.tables.wrapped_editions = [
      { ...edition, config: { ...edition.config, slides: [{ position: 1, type: "auto_user_stats", metricKey: "top_members" }, { position: 2, type: "auto_user_stats", metricKey: "top_music" }] } },
    ];
    mockDb.tables.profiles = [{ id: "u2", display_name: "Beto Lima" }];
    mockDb.tables.music_picks = [{ user_id: "u2", pick_date: "2026-03-02", title: "x", artist: "Queen", thumbnail: null }];
    mount("/wrapped/2026");
    await screen.findByText("Wrapped 2026");
    await waitFor(() => expect(document.querySelectorAll(".wrapped-bar")).toHaveLength(4));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Quem mais apareceu")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("O que o grupo mais ouviu")).toBeInTheDocument();
    // não existe versão personalizada por pessoa: sem seletor "Você | Grupo"
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("edição fora da janela é bloqueada para usuário comum e liberada para admin", async () => {
    mockDb.tables.wrapped_editions = [{ ...edition, ends_at: "2000-01-01" }];
    mount("/wrapped/2026");
    expect(await screen.findByText(/Nenhuma retrospectiva/)).toBeInTheDocument();
  });

  it("mostra 'Quem mais joga' com os dados de todos", async () => {
    mockDb.tables.wrapped_editions = [
      { ...edition, config: { ...edition.config, slides: [{ position: 1, type: "auto_user_stats", metricKey: "top_players" }, { position: 2, type: "auto_user_stats", metricKey: "top_music_members" }] } },
    ];
    mockDb.tables.profiles = [{ id: "u2", display_name: "Beto Lima" }, { id: "u3", display_name: "Caio Dias" }];
    mockDb.tables.sudoku_games = [
      { user_id: "u2", game_date: "2026-03-01", status: "won", score: 1 },
      { user_id: "u2", game_date: "2026-03-02", status: "won", score: 1 },
      { user_id: "u3", game_date: "2026-03-01", status: "lost", score: 0 },
    ];
    mount("/wrapped/2026");
    await screen.findByText("Wrapped 2026");
    await waitFor(() => expect(document.querySelectorAll(".wrapped-bar")).toHaveLength(3)); // abertura, jogos, encerramento
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Quem mais joga")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("2 partidas · 2 vitórias")).toBeInTheDocument();
    expect(screen.getByText("Caio")).toBeInTheDocument();
  });

  it("fechar volta para a Home", async () => {
    mockDb.tables.wrapped_editions = [edition];
    mount();
    await screen.findByText("Preparado?");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});

describe("Home → Wrapped", () => {
  it("mostra o banner só quando há edição ativa", async () => {
    loginAs(TEST_USER);
    mockDb.tables.wrapped_editions = [edition];
    render(
      <MemoryRouter>
        <AuthProvider>
          <SeasonalThemeProvider>
            <HomePage />
          </SeasonalThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Wrapped 2026")).toBeInTheDocument();
  });
});

describe("Wrapped fora da janela (admin)", () => {
  it("admin ainda abre para pré-visualizar", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.wrapped_editions = [{ ...edition, starts_at: "2999-01-01" }];
    renderWithProviders(
      <Routes><Route path="/wrapped/:slug" element={<WrappedPage />} /></Routes>,
      { route: "/wrapped/2026" },
    );
    expect(await screen.findByText("Preparado?")).toBeInTheDocument();
  });
});

describe("WrappedAdminPage — quem vê", () => {
  const ed = { slug: "2026", is_active: true, config: { pageTitle: "Wrapped 2026", slides: [{ type: "intro", title: "Oi" }] } };
  const people = [
    { id: "u1", display_name: "Ana Souza", avatar_url: null },
    { id: "u2", display_name: "Beto Lima", avatar_url: null },
    { id: "u3", display_name: "Caio Dias", avatar_url: null },
  ];
  const open = async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.wrapped_editions = [ed];
    mockDb.tables.profiles = [...people];
    mockDb.tables.wrapped_viewers = [{ slug: "2026", user_id: "u2" }];
    renderWithProviders(<WrappedAdminPage />);
    expect(await screen.findByText(/1 pessoa vê/)).toBeInTheDocument();          // contagem na lista
    fireEvent.click(screen.getByRole("button", { name: "Quem vê" }));
    return await screen.findByRole("region", { name: /Quem vê a edição 2026/ });
  };

  it("lista os usuários do app com quem já vê marcado", async () => {
    const panel = await open();
    const boxes = within(panel).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false]);
    expect(within(panel).getByText("Ana Souza")).toBeInTheDocument();
    expect(within(panel).getByText("1 de 3")).toBeInTheDocument();
  });

  it("busca, seleciona todos, limpa e marca individualmente", async () => {
    const panel = await open();
    fireEvent.change(within(panel).getByLabelText("Buscar usuário"), { target: { value: "caio" } });
    expect(within(panel).getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.change(within(panel).getByLabelText("Buscar usuário"), { target: { value: "zzz" } });
    expect(within(panel).getByText("Nenhum usuário encontrado.")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Buscar usuário"), { target: { value: "" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Selecionar todos" }));
    expect(within(panel).getByText("3 de 3")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Limpar" }));
    expect(within(panel).getByText("0 de 3")).toBeInTheDocument();
    fireEvent.click(within(panel).getByLabelText("Ana Souza"));
    expect(within(panel).getByText("1 de 3")).toBeInTheDocument();
  });

  it("salva só a diferença: tira o Beto, põe a Ana", async () => {
    const panel = await open();
    fireEvent.click(within(panel).getByLabelText("Ana Souza"));
    fireEvent.click(within(panel).getByLabelText("Beto Lima"));
    fireEvent.click(within(panel).getByRole("button", { name: "Salvar quem vê" }));
    expect(await within(panel).findByText(/Lista salva: 1 pessoa/)).toBeInTheDocument();
    const up = mockDb.writes.find((w) => w.table === "wrapped_viewers" && w.op === "upsert")!;
    expect(up.args[0]).toEqual([{ slug: "2026", user_id: "u1" }]);
    const q = mockDb.queries.filter((x) => x.table === "wrapped_viewers").flatMap((x) => x.calls);
    expect(q).toContainEqual(["in", ["user_id", ["u2"]]]);
  });

  it("mostra o erro se o banco recusar", async () => {
    const panel = await open();
    mockDb.errors.wrapped_viewers = { message: "permission denied" };
    fireEvent.click(within(panel).getByLabelText("Ana Souza"));
    fireEvent.click(within(panel).getByRole("button", { name: "Salvar quem vê" }));
    expect(await within(panel).findByText(/Erro ao salvar: permission denied/)).toBeInTheDocument();
  });

  it("usuário comum não abre o painel de admin", async () => {
    loginAs(TEST_USER);
    renderWithProviders(<WrappedAdminPage />);
    expect(await screen.findByText(/Acesso restrito/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quem vê" })).not.toBeInTheDocument();
  });
});

describe("WrappedAdminPage", () => {
  it("bloqueia quem não é admin", async () => {
    loginAs(TEST_USER);
    renderWithProviders(<WrappedAdminPage />);
    expect(await screen.findByText(/Acesso restrito/)).toBeInTheDocument();
  });

  it("valida JSON, mostra erros/avisos e salva", async () => {
    loginAs(ADMIN_USER);
    renderWithProviders(<WrappedAdminPage />);
    const box = (await screen.findByLabelText("JSON da edição")) as HTMLTextAreaElement;
    const save = screen.getByRole("button", { name: "Validar e salvar" });

    fireEvent.change(box, { target: { value: "{ nao é json" } });
    fireEvent.click(save);
    expect(await screen.findByText(/JSON inválido/)).toBeInTheDocument();

    fireEvent.change(box, { target: { value: JSON.stringify({ slug: "2026" }) } });
    fireEvent.click(save);
    expect(await screen.findByText(/pageTitle/)).toBeInTheDocument();
    expect(mockDb.writes.filter((w) => w.table === "wrapped_editions")).toHaveLength(0);

    fireEvent.change(box, {
      target: { value: JSON.stringify({ slug: "2026", pageTitle: "W", isActive: true, slides: [{ type: "banana" }] }) },
    });
    fireEvent.click(save);
    expect(await screen.findByText(/Edição "2026" salva/)).toBeInTheDocument();
    expect(screen.getByText(/desconhecido/)).toBeInTheDocument();
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "wrapped_editions" && w.op === "upsert")).toBe(true));
    await flush();
  });
});
