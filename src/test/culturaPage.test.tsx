import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CulturaPage } from "@/features/cultura/CulturaPage";
import { currentWeekStr } from "@/features/cultura/culturaService";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const seed = () => {
  const week = currentWeekStr();
  mockDb.tables.cultura_items = [
    { id: "i1", type: "movie", title: "Matrix", subtitle: null, year: 1999, cover_url: null, genres: [] },
    { id: "i2", type: "book", title: "Dom Casmurro", subtitle: "Machado", year: 1899, cover_url: null, genres: [] },
    { id: "i3", type: "series", title: "Lost", subtitle: null, year: 2004, cover_url: null, genres: [] },
  ];
  mockDb.tables.cultura_posts = [
    { id: "p1", user_id: "u2", item_id: "i1", comment: "Imperdível", personal_rating: 5, posted_week: week, created_at: "3" },
    { id: "p2", user_id: "u3", item_id: "i2", comment: null, personal_rating: 4, posted_week: week, created_at: "2" },
    { id: "p3", user_id: "user-1", item_id: "i3", comment: "Meu favorito", personal_rating: 3, posted_week: week, created_at: "1" },
  ];
  mockDb.tables.profiles.push(
    { id: "u2", display_name: "Beltrano", avatar_url: null },
    { id: "u3", display_name: "Cris", avatar_url: null },
  );
};

const mount = async () => {
  loginAs();
  seed();
  renderWithProviders(<CulturaPage />);
  await screen.findByText("Matrix");
};

// botões do filtro de tipo ("📚 Livros") — o texto "Livros" também aparece no subtítulo da tela
const typeBtn = (name: string) => screen.getByRole("button", { name });
// carrossel de pessoas (botão com o avatar e o nome embaixo)
const personBtn = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button.flex-col")).find((b) => b.textContent?.includes(name))!;

describe("CulturaPage — filtros", () => {
  it("mostra todas as indicações da semana", async () => {
    await mount();
    for (const t of ["Matrix", "Dom Casmurro", "Lost"]) expect(screen.getByText(t)).toBeInTheDocument();
  });

  it("filtro por tipo é exclusivo e 'Tudo' limpa", async () => {
    await mount();
    fireEvent.click(typeBtn("📚 Livros"));
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.queryByText("Matrix")).not.toBeInTheDocument();
    expect(screen.queryByText("Lost")).not.toBeInTheDocument();
    fireEvent.click(typeBtn("🎬 Filmes")); // troca (não soma)
    expect(screen.getByText("Matrix")).toBeInTheDocument();
    expect(screen.queryByText("Dom Casmurro")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Tudo"));
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
  });

  it("clicar de novo no mesmo tipo desliga o filtro", async () => {
    await mount();
    fireEvent.click(typeBtn("📺 Séries"));
    expect(screen.queryByText("Matrix")).not.toBeInTheDocument();
    fireEvent.click(typeBtn("📺 Séries"));
    expect(screen.getByText("Matrix")).toBeInTheDocument();
  });

  it("filtro por pessoa aceita várias (OU)", async () => {
    await mount();
    fireEvent.click(personBtn("Beltrano"));
    expect(screen.getByText("Matrix")).toBeInTheDocument();
    expect(screen.queryByText("Dom Casmurro")).not.toBeInTheDocument();
    fireEvent.click(personBtn("Cris"));
    expect(screen.getByText("Matrix")).toBeInTheDocument();
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.queryByText("Lost")).not.toBeInTheDocument();
  });

  it("filtros combinados sem resultado mostram a mensagem", async () => {
    await mount();
    fireEvent.click(typeBtn("📚 Livros"));
    fireEvent.click(personBtn("Beltrano"));
    expect(await screen.findByText("Nenhum resultado para os filtros.")).toBeInTheDocument();
  });
});

describe("CulturaPage — avaliar", () => {
  it("indicação de outra pessoa: marcar como visto grava e libera a nota", async () => {
    await mount();
    fireEvent.click(screen.getByText("Matrix"));
    fireEvent.click(await screen.findByText("○ Marcar como visto"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "cultura_interactions")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "cultura_interactions")!.args[0]).toMatchObject({ user_id: "user-1", item_id: "i1", watched: true });
    expect(await screen.findByText("✅ Já consumi")).toBeInTheDocument();
    // o card continua aberto e mostra o campo de nota
    expect(await screen.findByText("Minha nota:")).toBeInTheDocument();
  });

  it("o card aberto não fecha quando outra coisa da tela muda (toast, nota)", async () => {
    await mount();
    fireEvent.click(screen.getByText("Matrix"));
    fireEvent.click(await screen.findByText("○ Marcar como visto"));
    expect(await screen.findByText(/Marcado como visto!/)).toBeInTheDocument();
    expect(screen.getByText("Minha nota:")).toBeInTheDocument();
    // o toast some depois de 3s e a tela re-renderiza: o card segue aberto
    await new Promise((r) => setTimeout(r, 3200));
    expect(screen.queryByText(/Marcado como visto!/)).not.toBeInTheDocument();
    expect(screen.getByText("Minha nota:")).toBeInTheDocument();
  }, 10000);

  it("dar nota grava a nota na interação (clicar na mesma estrela remove a nota)", async () => {
    loginAs();
    seed();
    mockDb.tables.cultura_interactions = [{ user_id: "user-1", item_id: "i1", global_rating: null, watched: true }];
    renderWithProviders(<CulturaPage />);
    fireEvent.click(await screen.findByText("Matrix"));
    await screen.findByText("Minha nota:");
    const stars = screen.getAllByText("★").filter((el) => (el as HTMLButtonElement).type === "button" && !(el as HTMLButtonElement).disabled);
    fireEvent.click(stars[3]);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "cultura_interactions")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "cultura_interactions")!.args[0]).toMatchObject({ user_id: "user-1", item_id: "i1", global_rating: 4, watched: true });
  });

  it("a própria indicação não tem 'visto'/nota, só remover", async () => {
    await mount();
    fireEvent.click(screen.getByText("Lost"));
    expect(await screen.findByText("✕ Remover indicação")).toBeInTheDocument();
    expect(screen.queryByText("○ Marcar como visto")).not.toBeInTheDocument();
  });

  it("remover a própria indicação apaga o post", async () => {
    await mount();
    fireEvent.click(screen.getByText("Lost"));
    fireEvent.click(await screen.findByText("✕ Remover indicação"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "cultura_posts" && w.op === "delete")).toBe(true));
  });

  it("a nota do autor e a de quem já avaliou entram na média do card", async () => {
    loginAs();
    seed();
    mockDb.tables.cultura_interactions = [{ user_id: "u3", item_id: "i1", global_rating: 3, watched: true }];
    renderWithProviders(<CulturaPage />);
    expect((await screen.findAllByText("★ 4.0")).length).toBeGreaterThan(0); // (5 + 3) / 2
  });
});

describe("CulturaPage — indicar", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const openModal = async () => {
    loginAs();
    renderWithProviders(<CulturaPage />);
    fireEvent.click(await screen.findByText("Indicar", { selector: "button" }));
    await screen.findByText("Indicar Arte");
  };

  it("só habilita o botão depois de escolher um item", async () => {
    await openModal();
    expect(screen.getByRole("button", { name: /^Indicar Filme ✨/ })).toBeDisabled();
  });

  it("busca livro, escolhe o resultado, nota e comenta, e grava a indicação", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ items: [{ id: "b1", volumeInfo: { title: "Dom Casmurro", authors: ["Machado"], publishedDate: "1899" } }] }),
    });
    await openModal();
    fireEvent.click(screen.getByText("Livro"));
    fireEvent.change(screen.getByPlaceholderText("Buscar livros..."), { target: { value: "dom casmurro" } });
    fireEvent.click(await screen.findByText("Dom Casmurro", {}, { timeout: 3000 }));
    const save = await screen.findByRole("button", { name: /Indicar Dom Casmurro ✨/ });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(/Conte o que te marcou/), { target: { value: "Clássico" } });
    fireEvent.click(screen.getAllByText("★")[3]); // 4 estrelas
    mockDb.tables.cultura_items = [{ id: "i1", type: "book", title: "Dom Casmurro", subtitle: "Machado", year: 1899, cover_url: null, genres: [] }];
    mockDb.tables.cultura_posts = [{ id: "p9", user_id: "user-1", item_id: "i1", comment: "Clássico", personal_rating: 4, posted_week: currentWeekStr(), created_at: "x" }];
    fireEvent.click(save);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "cultura_posts" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "cultura_items")!.args[0]).toMatchObject({ external_id: "b1", external_source: "google_books", type: "book" });
    expect(mockDb.writes.find((w) => w.table === "cultura_posts")!.args[0]).toMatchObject({ user_id: "user-1", comment: "Clássico", personal_rating: 4 });
  }, 10000);

  it("álbum: cola o link do Spotify e resolve o título", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: "Abbey Road", thumbnail_url: null }) });
    await openModal();
    fireEvent.click(screen.getByText("Álbum"));
    fireEvent.change(screen.getByPlaceholderText("https://open.spotify.com/album/..."), {
      target: { value: "https://open.spotify.com/album/0ETFjACtuP2ADo6LFhL6HN" },
    });
    expect(await screen.findByRole("button", { name: /Indicar Abbey Road ✨/ }, { timeout: 3000 })).toBeEnabled();
  }, 10000);
});

void within;
