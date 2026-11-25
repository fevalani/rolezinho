import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { AuthProvider } from "@/lib/AuthContext";
import { SeasonalThemeProvider } from "@/lib/seasonal/SeasonalThemeContext";
import { HomePage } from "@/pages/HomePage";
import { AwardsPage } from "@/features/awards/AwardsPage";
import { AwardsCategoryPage } from "@/features/awards/AwardsCategoryPage";
import { AwardsBallotPage } from "@/features/awards/AwardsBallotPage";
import { AwardsAdminPage } from "@/features/awards/AwardsAdminPage";
import { supabase } from "@/lib/supabase";
import { ADMIN_USER, TEST_USER, flush, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const edition = (phase: string) => ({ slug: "2026", title: "Awards 2026", subtitle: null, phase });
const cat = (id: string, by: string, title = `Cat ${id}`, position = 0) => ({
  id,
  edition_slug: "2026",
  title,
  description: null,
  image_url: null,
  position,
  created_by: by,
});
const nom = (id: string, categoryId: string, by: string, label: string | null = `Nome ${id}`, image: string | null = null) => ({
  id,
  category_id: categoryId,
  label,
  image_url: image,
  created_by: by,
});

beforeEach(() => vi.mocked(supabase.rpc).mockClear());

const routes = (
  <Routes>
    <Route path="/awards" element={<AwardsPage />} />
    <Route path="/awards/votar" element={<AwardsBallotPage />} />
    <Route path="/awards/c/:categoryId" element={<AwardsCategoryPage />} />
    <Route path="/" element={<p>home</p>} />
  </Routes>
);
const mount = (route = "/awards") => renderWithProviders(routes, { route });

describe("AwardsPage — indicação", () => {
  beforeEach(() => loginAs(TEST_USER));

  it("sem edição mostra o estado vazio", async () => {
    mount();
    expect(await screen.findByText(/Nenhum awards no ar/)).toBeInTheDocument();
  });

  it("lista as categorias em cards e o card de indicar nova", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = [cat("c1", "outro", "Melhor rolê"), cat("c2", "outro", "Maior bagunça", 1)];
    mockDb.tables.awards_nominees = [nom("n1", "c1", "outro")];
    mount();
    expect(await screen.findByText("Melhor rolê")).toBeInTheDocument();
    expect(screen.getByText("Maior bagunça")).toBeInTheDocument();
    expect(screen.getByText("Indicar nova categoria")).toBeInTheDocument();
    expect(screen.getByText("Indicações abertas")).toBeInTheDocument();
  });

  it("criar categoria chama a RPC com a edição e fecha o formulário", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mount();
    fireEvent.click(await screen.findByText("Indicar nova categoria"));
    fireEvent.change(screen.getByLabelText(/Nome da categoria/), { target: { value: "Melhor churrasco" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_award_category",
        expect.objectContaining({ p_edition: "2026", p_title: "Melhor churrasco" }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("não envia categoria sem nome", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mount();
    fireEvent.click(await screen.findByText("Indicar nova categoria"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nome para a categoria/);
    expect(supabase.rpc).not.toHaveBeenCalledWith("create_award_category", expect.anything());
  });

  it("mostra o erro do banco ao passar do limite", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.errors["rpc:create_award_category"] = { message: "Você já indicou 5 categorias." };
    mount();
    fireEvent.click(await screen.findByText("Indicar nova categoria"));
    fireEvent.change(screen.getByLabelText(/Nome da categoria/), { target: { value: "X" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Você já indicou 5 categorias.");
  });

  it("com 5 categorias suas o card de indicar fica desabilitado", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = ["a", "b", "c", "d", "e"].map((id, i) => cat(id, TEST_USER.id, `Cat ${id}`, i));
    mount();
    const add = (await screen.findByText("Indicar nova categoria")).closest("button")!;
    expect(add).toBeDisabled();
    expect(screen.getByText(/Limite de 5 atingido/)).toBeInTheDocument();
  });

  it("admin não tem limite", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = ["a", "b", "c", "d", "e", "f"].map((id, i) => cat(id, ADMIN_USER.id, `Cat ${id}`, i));
    mount();
    const add = (await screen.findByText("Indicar nova categoria")).closest("button")!;
    await waitFor(() => expect(add).not.toBeDisabled());
  });

  it("fora da fase de indicação não há card de indicar", async () => {
    mockDb.tables.awards_editions = [edition("voting")];
    mockDb.tables.awards_categories = [cat("c1", "o")];
    mount();
    await screen.findByText("Cat c1");
    expect(screen.queryByText("Indicar nova categoria")).not.toBeInTheDocument();
  });

  it("erro ao carregar aparece na tela", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.errors.awards_categories = { message: "falhou" };
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("falhou");
  });

  it("abre a categoria ao tocar no card", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = [cat("c1", "outro", "Melhor rolê")];
    mount();
    fireEvent.click(await screen.findByLabelText("Categoria Melhor rolê"));
    expect(await screen.findByRole("heading", { name: "Melhor rolê" })).toBeInTheDocument();
  });
});

describe("AwardsCategoryPage", () => {
  beforeEach(() => loginAs(TEST_USER));

  const seed = (phase = "nominations") => {
    mockDb.tables.awards_editions = [edition(phase)];
    mockDb.tables.awards_categories = [cat("c1", "outro", "Melhor rolê")];
    mockDb.tables.profiles = [{ id: "outro", display_name: "Beto" }];
  };

  it("mostra indicados (texto e imagem) sem revelar quem indicou", async () => {
    seed();
    mockDb.tables.awards_nominees = [nom("n1", "c1", "outro", "Ana"), nom("n2", "c1", "outro", null, "https://img/x.webp")];
    mount("/awards/c/c1");
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Sem nome")).toBeInTheDocument();
    expect(screen.queryByText(/Beto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^por /)).not.toBeInTheDocument();
    expect(mockDb.queries.some((q) => q.table === "profiles" && q.calls.some(([m, a]) => m === "select" && String(a[0]).includes("display_name") && !String(a[0]).includes("avatar")))).toBe(false);
    expect(screen.getByText("Indicar mais um")).toBeInTheDocument();
  });

  it("adicionar indicado por texto chama a RPC", async () => {
    seed();
    mount("/awards/c/c1");
    fireEvent.click(await screen.findByText("Indicar mais um"));
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: "Caio" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("add_award_nominee", {
        p_category_id: "c1",
        p_label: "Caio",
        p_image_url: null,
      }),
    );
  });

  it("não aceita indicado sem texto nem imagem", async () => {
    seed();
    mount("/awards/c/c1");
    fireEvent.click(await screen.findByText("Indicar mais um"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nome ou uma imagem/);
  });

  it("bloqueia o 6º indicado seu na categoria (limite de 5)", async () => {
    seed();
    mockDb.tables.awards_nominees = ["a", "b", "c", "d", "e"].map((id) => nom(id, "c1", TEST_USER.id));
    mount("/awards/c/c1");
    const add = (await screen.findByText("Indicar mais um")).closest("button")!;
    expect(add).toBeDisabled();
  });

  it("dono vê editar/apagar só nos seus; apagar chama delete", async () => {
    seed();
    mockDb.tables.awards_nominees = [nom("n1", "c1", TEST_USER.id, "Meu"), nom("n2", "c1", "outro", "Dele")];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("/awards/c/c1");
    await screen.findByText("Meu");
    expect(screen.getAllByText("Apagar")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("Apagar Meu"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "awards_nominees" && w.op === "delete")).toBe(true));
  });

  it("depois da indicação o dono não edita mais", async () => {
    seed("voting");
    mockDb.tables.awards_nominees = [nom("n1", "c1", TEST_USER.id, "Meu")];
    mount("/awards/c/c1");
    await screen.findByText("Meu");
    expect(screen.queryByText("Apagar")).not.toBeInTheDocument();
    expect(screen.queryByText("Indicar mais um")).not.toBeInTheDocument();
  });

  it("categoria inexistente mostra aviso", async () => {
    seed();
    mount("/awards/c/zzz");
    expect(await screen.findByText("Categoria não encontrada.")).toBeInTheDocument();
  });
});

describe("AwardsBallotPage — cédula", () => {
  beforeEach(() => loginAs(TEST_USER));

  const seed = () => {
    mockDb.tables.awards_editions = [edition("voting")];
    mockDb.tables.awards_categories = [cat("c1", "o", "Melhor rolê", 0), cat("c2", "o", "Maior bagunça", 1), cat("c3", "o", "Sozinha", 2)];
    mockDb.tables.awards_nominees = [
      nom("a", "c1", "o", "Ana"),
      nom("b", "c1", "o", "Beto"),
      nom("c", "c2", "o", "Caio"),
      nom("d", "c2", "o", "Dani"),
      nom("e", "c3", "o", "Eva"),
    ];
  };

  it("fora da votação avisa que está fechada", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mount("/awards/votar");
    expect(await screen.findByText("A votação não está aberta.")).toBeInTheDocument();
  });

  it("votar grava via RPC, marca o card e permite trocar", async () => {
    seed();
    mount("/awards/votar");
    expect(await screen.findByText("Melhor rolê")).toBeInTheDocument();
    expect(screen.getByText("Cédula · 0/2")).toBeInTheDocument(); // categoria com 1 indicado fica fora
    fireEvent.click(screen.getByText("Ana"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("cast_award_vote", { p_category_id: "c1", p_nominee_id: "a" }),
    );
    expect(await screen.findByText("Cédula · 1/2")).toBeInTheDocument();
    expect(screen.getByText("Ana").closest("button")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText("Beto"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("cast_award_vote", { p_category_id: "c1", p_nominee_id: "b" }),
    );
  });

  it("avança para a próxima categoria depois de votar", async () => {
    seed();
    mount("/awards/votar");
    fireEvent.click(await screen.findByText("Ana"));
    expect(await screen.findByText("Maior bagunça", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("reverte o voto e mostra o erro se o banco recusar", async () => {
    seed();
    mockDb.errors["rpc:cast_award_vote"] = { message: "A votação não está aberta." };
    mount("/awards/votar");
    fireEvent.click(await screen.findByText("Ana"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A votação não está aberta.");
    expect(screen.getByText("Cédula · 0/2")).toBeInTheDocument();
  });

  it("revisão lista as escolhas e as categorias sem voto", async () => {
    seed();
    mockDb.rpcResults.my_award_votes = [{ category_id: "c1", nominee_id: "a" }];
    mount("/awards/votar");
    await screen.findByText("Melhor rolê");
    fireEvent.click(screen.getByLabelText("Revisar cédula"));
    expect(await screen.findByText("Revisar cédula", { selector: "h1" })).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Sem voto")).toBeInTheDocument();
    expect(screen.getByText(/Faltam 1 categoria/)).toBeInTheDocument();
  });

  it("cédula completa mostra a confirmação", async () => {
    seed();
    mockDb.rpcResults.my_award_votes = [
      { category_id: "c1", nominee_id: "a" },
      { category_id: "c2", nominee_id: "c" },
    ];
    mount("/awards/votar");
    await screen.findByText("Melhor rolê");
    fireEvent.click(screen.getByLabelText("Revisar cédula"));
    expect(await screen.findByText(/Cédula completa/)).toBeInTheDocument();
  });

  it("a página inicial oferece votar e mostra o progresso", async () => {
    seed();
    mockDb.rpcResults.my_award_votes = [{ category_id: "c1", nominee_id: "a" }];
    mount("/awards");
    expect(await screen.findByText(/Votar · 1\/2/)).toBeInTheDocument();
  });
});

describe("AwardsPage — resultado", () => {
  beforeEach(() => loginAs(TEST_USER));

  it("edição encerrada mostra vencedor e ranking", async () => {
    mockDb.tables.awards_editions = [edition("closed")];
    mockDb.tables.awards_categories = [cat("c1", "o", "Melhor rolê")];
    mockDb.tables.awards_nominees = [nom("a", "c1", "o", "Ana"), nom("b", "c1", "o", "Beto")];
    mockDb.rpcResults.award_results = [
      { category_id: "c1", nominee_id: "a", votes: 1 },
      { category_id: "c1", nominee_id: "b", votes: 3 },
    ];
    mount("/awards");
    expect(await screen.findByText("🏆 Vencedor")).toBeInTheDocument();
    expect(screen.getByText("3 votos · 75%")).toBeInTheDocument();
    expect(screen.queryByText("Indicar nova categoria")).not.toBeInTheDocument();
  });
});

describe("AwardsAdminPage", () => {
  it("bloqueia quem não é admin", async () => {
    loginAs(TEST_USER);
    renderWithProviders(<AwardsAdminPage />);
    expect(await screen.findByText(/Acesso restrito/)).toBeInTheDocument();
  });

  it("admin cria edição oculta e troca a fase", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [edition("hidden")];
    renderWithProviders(<AwardsAdminPage />);
    fireEvent.change(await screen.findByLabelText("Slug"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Awards 2027" } });
    fireEvent.click(screen.getByText("Criar (começa oculta)"));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_editions" && w.op === "upsert")?.args[0]).toMatchObject({ slug: "2027", phase: "hidden" }),
    );
    fireEvent.click(await screen.findByText("Votação aberta"));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_editions" && w.op === "update")?.args[0]).toEqual({ phase: "voting" }),
    );
  });

  it("admin escolhe 'Pessoas escolhidas', marca usuários e salva a lista", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [{ ...edition("nominations"), audience: "selected" }];
    mockDb.tables.profiles = [
      { id: "u1", display_name: "Ana", avatar_url: null },
      { id: "u2", display_name: "Beto", avatar_url: null },
    ];
    renderWithProviders(<AwardsAdminPage />);
    fireEvent.click(await screen.findByLabelText("Ana"));
    expect(await screen.findByText(/1 selecionada\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Salvar quem vê"));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_viewers" && w.op === "upsert")?.args[0]).toEqual([
        { slug: "2026", user_id: "u1" },
      ]),
    );
    expect(await screen.findByText(/1 pessoa\(s\) podem ver/)).toBeInTheDocument();
  });

  it("a lista de pessoas recolhe e reabre, mantendo a contagem e a seleção", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [{ ...edition("nominations"), audience: "selected" }];
    mockDb.tables.profiles = [{ id: "u1", display_name: "Ana", avatar_url: null }];
    mockDb.tables.awards_viewers = [{ user_id: "u1" }];
    renderWithProviders(<AwardsAdminPage />);
    expect(await screen.findByLabelText("Ana")).toBeChecked();
    fireEvent.click(screen.getByText("Recolher lista de pessoas"));
    expect(screen.queryByLabelText("Ana")).not.toBeInTheDocument();
    expect(screen.queryByText("Salvar quem vê")).not.toBeInTheDocument();
    expect(screen.getByText(/1 selecionada\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mostrar lista de pessoas"));
    expect(await screen.findByLabelText("Ana")).toBeChecked();
  });

  it("depois de salvar a lista recolhe sozinha", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [{ ...edition("nominations"), audience: "selected" }];
    mockDb.tables.profiles = [{ id: "u1", display_name: "Ana", avatar_url: null }];
    renderWithProviders(<AwardsAdminPage />);
    fireEvent.click(await screen.findByLabelText("Ana"));
    fireEvent.click(screen.getByText("Salvar quem vê"));
    expect(await screen.findByText("Mostrar lista de pessoas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ana")).not.toBeInTheDocument();
  });

  it("trocar para 'Todos' grava a audiência e esconde a lista de pessoas", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [{ ...edition("nominations"), audience: "selected" }];
    mockDb.tables.profiles = [{ id: "u1", display_name: "Ana", avatar_url: null }];
    renderWithProviders(<AwardsAdminPage />);
    await screen.findByText("Salvar quem vê");
    fireEvent.click(screen.getByText("Todos", { selector: "button[aria-pressed]" }));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_editions" && w.op === "update")?.args[0]).toEqual({
        audience: "all",
      }),
    );
  });

  it("recusa slug inválido", async () => {
    loginAs(ADMIN_USER);
    renderWithProviders(<AwardsAdminPage />);
    fireEvent.change(await screen.findByLabelText("Slug"), { target: { value: "ab cd" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "X" } });
    fireEvent.click(screen.getByText("Criar (começa oculta)"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Slug inválido/);
  });
});

describe("Card do Awards na Home", () => {
  const home = () =>
    render(
      <MemoryRouter>
        <AuthProvider>
          <SeasonalThemeProvider>
            <HomePage />
          </SeasonalThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  beforeEach(() => loginAs(TEST_USER));

  it("aparece na fase de indicação, com a chamada certa", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    home();
    expect(await screen.findByText("Awards 2026")).toBeInTheDocument();
    expect(screen.getByText("Indique categorias e nomes")).toBeInTheDocument();
  });

  it("muda a chamada na votação e no resultado", async () => {
    mockDb.tables.awards_editions = [edition("voting")];
    const { unmount } = home();
    expect(await screen.findByText("A votação está aberta")).toBeInTheDocument();
    unmount();
    mockDb.tables.awards_editions = [edition("closed")];
    home();
    expect(await screen.findByText("Veja os resultados")).toBeInTheDocument();
  });

  it("não aparece quando a edição está oculta ou não existe", async () => {
    mockDb.tables.awards_editions = [edition("hidden")];
    home();
    await flush();
    expect(screen.queryByText("Awards 2026")).not.toBeInTheDocument();
  });
});
