import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { AuthProvider } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { ChatStatsPage } from "@/features/chatstats/ChatStatsPage";
import { ChatStatsAdminPage } from "@/features/chatstats/ChatStatsAdminPage";
import { HomePage } from "@/pages/HomePage";
import { ADMIN_USER, TEST_USER, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";
import { MENTIRAS, RAW } from "./chatStatsFixtures";

const { slug, ...config } = RAW;
const snapshot = {
  slug,
  is_active: true,
  config: {
    ...config,
    activeDays: 40,
    conversations: 12,
    periodStart: "2026-01-05",
    periodEnd: "2026-10-29",
    generatedAt: "2026-11-01T00:00:00+00:00",
    byMonth: [{ month: "2026-01", messages: 30, avgChars: 10 }, { month: "2026-02", messages: 70, avgChars: 12 }],
    longestStreak: { days: 4, start: "2026-01-10", end: "2026-01-13" },
    catchphrases: [{ phrase: "manda a localização", count: 61, topAuthor: "Ana" }],
    topWords: [{ word: "churrasco", count: 9 }],
    topics: {
      categories: [{ name: "Esporte", messages: 50, conversations: 4, share: 50 }],
      byMonth: [], byPerson: [{ name: "Ana", categories: [{ name: "Esporte", messages: 30 }] }],
      highlights: [{ label: "Final do campeonato", category: "Esporte", date: "2026-03-01", messages: 40 }],
    },
  },
};

const mount = (route = "/estatisticas") =>
  renderWithProviders(
    <Routes>
      <Route path="/estatisticas" element={<ChatStatsPage />} />
      <Route path="/estatisticas/:slug" element={<ChatStatsPage />} />
      <Route path="/" element={<p>home</p>} />
    </Routes>,
    { route },
  );

describe("ChatStatsPage", () => {
  beforeEach(() => loginAs(TEST_USER));

  it("sem acesso (RLS devolve nada) mostra estado vazio", async () => {
    mount();
    expect(await screen.findByText(/Nada para mostrar/)).toBeInTheDocument();
  });

  it("renderiza totais, rankings, bordões e assuntos", async () => {
    mockDb.tables.chat_stats_snapshots = [snapshot];
    mount();
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("4 dias")).toBeInTheDocument();
    expect(screen.getByText(/Horário de pico: 22h · dia mais movimentado: sexta/)).toBeInTheDocument();
    const talkers = screen.getByText("Quem mais fala").closest("section")!;
    expect(within(talkers).getByText("Ana")).toBeInTheDocument();
    expect(within(talkers).getByText("60 mensagens")).toBeInTheDocument();
    expect(screen.getByText("Demora mais para responder")).toBeInTheDocument(); // sem pudor: os piores também
    expect(screen.getByText("Ana ↔ Beto")).toBeInTheDocument();
    expect(screen.getByText(/manda a localização/)).toBeInTheDocument();
    expect(screen.getByText(/churrasco \(9\)/)).toBeInTheDocument();
    expect(screen.getByText("Assuntos mais discutidos")).toBeInTheDocument();
    expect(screen.getByText(/Final do campeonato/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mensagens por hora do dia" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mensagens por mês" })).toBeInTheDocument();
  });

  it("mentiras confirmadas: ranking, as 3 frases literais e o aviso de revisão", async () => {
    mockDb.tables.chat_stats_snapshots = [{ slug, is_active: true, config: { ...config, mentiras: MENTIRAS } }];
    mount();
    const sec = (await screen.findByText(/Mentiras confirmadas/)).closest("section")!;
    expect(within(sec).getByText(/revisado pelo administrador/)).toBeInTheDocument();
    expect(within(sec).getByText("2 casos")).toBeInTheDocument();
    expect(within(sec).getByText("“eu corri 10km ontem”", { exact: false })).toBeInTheDocument();
    expect(within(sec).getByText("“mentira, você nem saiu de casa”", { exact: false })).toBeInTheDocument();
    expect(within(sec).getByText("↳ “tá bom, menti, fiquei deitada”")).toBeInTheDocument();
    expect(within(sec).getByText(/o chat provou que era falso/)).toBeInTheDocument();
    expect(within(sec).getByText(/01\/03\/2026 · admitiu/)).toBeInTheDocument();
  });

  it("sem casos aprovados a seção não aparece", async () => {
    mockDb.tables.chat_stats_snapshots = [snapshot];
    mount();
    await screen.findByText("Quem mais fala");
    expect(screen.queryByText(/Mentiras confirmadas/)).not.toBeInTheDocument();
  });

  it("sem assuntos nem meses, essas seções não aparecem", async () => {
    mockDb.tables.chat_stats_snapshots = [{ slug, is_active: true, config }];
    mount();
    await screen.findByText("Quem mais fala");
    expect(screen.queryByText("Assuntos mais discutidos")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mensagens por mês" })).not.toBeInTheDocument();
  });

  it("a rota com slug abre o snapshot pedido e o botão voltar vai para a Home", async () => {
    mockDb.tables.chat_stats_snapshots = [snapshot];
    mount("/estatisticas/2026");
    await screen.findByText("Quem mais fala");
    expect(mockDb.queries.find((q) => q.table === "chat_stats_snapshots")!.calls).toContainEqual(["eq", ["slug", "2026"]]);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});

describe("na Home (feature como as outras)", () => {
  it("é uma feature registrada, na categoria Outros, apontando para /estatisticas", async () => {
    const { APP_FEATURES } = await import("@/lib/types");
    expect(APP_FEATURES.find((f) => f.id === "estatisticas")).toMatchObject({ path: "/estatisticas", enabled: true, name: "Estatísticas do chat" });
    loginAs(TEST_USER);
    render(
      <MemoryRouter>
        <AuthProvider>
          <SeasonalThemeProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/estatisticas" element={<p>stats</p>} />
            </Routes>
          </SeasonalThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Estatísticas do chat")).closest("button")!;
    const group = card.parentElement!.parentElement!;
    expect(within(group).getByText("✨ Outros")).toBeInTheDocument();
    fireEvent.click(card);
    expect(await screen.findByText("stats")).toBeInTheDocument();
  });
});

describe("ChatStatsAdminPage", () => {
  it("bloqueia quem não é admin", async () => {
    loginAs(TEST_USER);
    renderWithProviders(<ChatStatsAdminPage />);
    expect(await screen.findByText(/Acesso restrito/)).toBeInTheDocument();
  });

  it("valida o JSON, mostra erros e salva o snapshot", async () => {
    loginAs(ADMIN_USER);
    renderWithProviders(<ChatStatsAdminPage />);
    const box = (await screen.findByLabelText("JSON do snapshot")) as HTMLTextAreaElement;
    const save = screen.getByRole("button", { name: "Validar e salvar" });

    fireEvent.change(box, { target: { value: "{ nao é json" } });
    fireEvent.click(save);
    expect(await screen.findByText(/JSON inválido/)).toBeInTheDocument();

    fireEvent.change(box, { target: { value: JSON.stringify({ slug: "2026" }) } });
    fireEvent.click(save);
    expect(await screen.findByText(/byHour/)).toBeInTheDocument();
    expect(mockDb.writes.filter((w) => w.table === "chat_stats_snapshots")).toHaveLength(0);

    fireEvent.change(box, { target: { value: JSON.stringify(RAW) } });
    fireEvent.click(save);
    expect(await screen.findByText(/Snapshot "2026" salvo/)).toBeInTheDocument();
    const w = mockDb.writes.find((x) => x.table === "chat_stats_snapshots")!;
    expect((w.args[0] as { is_active: boolean }).is_active).toBe(true);
  });

  it("lista snapshots com contagem de quem vê e edita a lista de viewers", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.chat_stats_snapshots = [snapshot];
    mockDb.tables.chat_stats_viewers = [{ slug: "2026", user_id: "u2" }];
    mockDb.tables.profiles = [
      { id: "u1", display_name: "Ana Souza", avatar_url: null },
      { id: "u2", display_name: "Beto Lima", avatar_url: null },
    ];
    renderWithProviders(<ChatStatsAdminPage />);
    expect(await screen.findByText(/1 pessoa vê/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quem vê" }));
    const panel = await screen.findByRole("region", { name: /Quem vê 2026/ });
    expect((within(panel).getAllByRole("checkbox") as HTMLInputElement[]).map((b) => b.checked)).toEqual([false, true]);
    fireEvent.click(within(panel).getByLabelText("Ana Souza"));
    expect(within(panel).getByText("2 de 2")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Salvar quem vê" }));
    await waitFor(() => expect(within(panel).getByRole("status")).toHaveTextContent("2 pessoa(s) podem ver"));
    expect(mockDb.writes.find((w) => w.op === "upsert" && w.table === "chat_stats_viewers")!.args[0]).toEqual([{ slug: "2026", user_id: "u1" }]);
  });

  it("desativa um snapshot", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.chat_stats_snapshots = [snapshot];
    renderWithProviders(<ChatStatsAdminPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Desativar" }));
    await waitFor(() => expect((mockDb.writes.find((w) => w.table === "chat_stats_snapshots")!.args[0] as { is_active: boolean }).is_active).toBe(false));
  });
});
