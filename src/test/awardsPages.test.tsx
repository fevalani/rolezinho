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
import { AwardsManagePage } from "@/features/awards/AwardsManagePage";
import { supabase } from "@/lib/supabase";
import { ADMIN_USER, TEST_USER, flush, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const edition = (phase: string) => ({ slug: "2026", title: "Awards 2026", subtitle: null, phase });
const cat = (id: string, by: string, title = `Cat ${id}`, position = 0, approved = false) => ({
  id,
  edition_slug: "2026",
  title,
  description: null,
  image_url: null,
  position,
  created_by: by,
  approved_at: approved ? "2026-11-25T00:00:00Z" : null,
});
const approvedCat = (id: string, by: string, title?: string, position = 0) => cat(id, by, title, position, true);
const asAwardsAdmin = () => {
  mockDb.rpcResults.is_awards_admin = true;
};
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
    <Route path="/awards/gerenciar" element={<AwardsManagePage />} />
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

  it("lista as suas categorias em cards e o card de indicar nova", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = [cat("c1", TEST_USER.id, "Melhor rolê"), cat("c2", TEST_USER.id, "Maior bagunça", 1)];
    mockDb.tables.awards_nominees = [nom("n1", "c1", "outro")];
    mount();
    expect(await screen.findByText("Melhor rolê")).toBeInTheDocument();
    expect(screen.getByText("Maior bagunça")).toBeInTheDocument();
    expect(screen.getByText("Indicar nova categoria")).toBeInTheDocument();
    expect(screen.getByText("Indicações abertas")).toBeInTheDocument();
  });

  it("não mostra categorias dos outros, nem abas, aprovação ou gerenciar", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = [cat("c1", TEST_USER.id, "Minha"), approvedCat("c2", "outro", "Alheia", 1)];
    mount();
    expect(await screen.findByText("Minha")).toBeInTheDocument();
    expect(screen.queryByText("Alheia")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText(/Aprovar|aprovada/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gerenciar awards")).not.toBeInTheDocument();
  });

  it("sem categorias suas avisa e oferece indicar", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = [cat("c1", "outro", "Alheia")];
    mount();
    expect(await screen.findByText("Indicar nova categoria")).toBeInTheDocument();
    expect(screen.queryByText("Alheia")).not.toBeInTheDocument();
    expect(screen.getByText(/10 nomes em cada/)).toBeInTheDocument();
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
    mockDb.tables.awards_categories = [cat("c1", TEST_USER.id)];
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
    mockDb.tables.awards_categories = [cat("c1", TEST_USER.id, "Melhor rolê")];
    mount();
    fireEvent.click(await screen.findByLabelText("Categoria Melhor rolê"));
    expect(await screen.findByRole("heading", { name: "Melhor rolê" })).toBeInTheDocument();
  });
});

describe("AwardsCategoryPage", () => {
  beforeEach(() => loginAs(TEST_USER));

  const seed = (phase = "nominations", owner = TEST_USER.id, approved = false) => {
    mockDb.tables.awards_editions = [edition(phase)];
    mockDb.tables.awards_categories = [cat("c1", owner, "Melhor rolê", 0, approved)];
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

  it("bloqueia o 11º indicado seu na categoria (limite de 10)", async () => {
    seed();
    mockDb.tables.awards_nominees = Array.from({ length: 10 }, (_, i) => nom(`n${i}`, "c1", TEST_USER.id));
    mount("/awards/c/c1");
    const add = (await screen.findByText("Indicar mais um")).closest("button")!;
    expect(add).toBeDisabled();
    expect(screen.getByText("Limite de 10 atingido")).toBeInTheDocument();
  });

  it("indicações antigas de outras pessoas não gastam as suas vagas", async () => {
    seed();
    mockDb.tables.awards_nominees = [
      ...Array.from({ length: 9 }, (_, i) => nom(`n${i}`, "c1", TEST_USER.id)),
      nom("x", "c1", "outro", "Antiga"),
    ];
    mount("/awards/c/c1");
    expect((await screen.findByText("Indicar mais um")).closest("button")).not.toBeDisabled();
    expect(screen.getByText(/restam 1/)).toBeInTheDocument();
  });

  it("dono da categoria vê e apaga também o que outra pessoa indicou nela", async () => {
    seed();
    mockDb.tables.awards_nominees = [nom("n1", "c1", TEST_USER.id, "Meu"), nom("n2", "c1", "outro", "Dele")];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("/awards/c/c1");
    await screen.findByText("Meu");
    expect(screen.getAllByText("Apagar")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Apagar Dele"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "awards_nominees" && w.op === "delete")).toBe(true));
  });

  it("não abre a categoria de outra pessoa, mesmo tendo indicado nela", async () => {
    seed("nominations", "outro");
    mockDb.tables.awards_nominees = [nom("n1", "c1", TEST_USER.id, "Meu")];
    mount("/awards/c/c1");
    expect(await screen.findByText("Categoria não encontrada.")).toBeInTheDocument();
    expect(screen.queryByText("Meu")).not.toBeInTheDocument();
  });

  it("categoria aprovada: dono completa indicados, mas não renomeia nem apaga a categoria", async () => {
    seed("nominations", TEST_USER.id, true);
    mount("/awards/c/c1");
    expect(await screen.findByText(/o nome fica travado/)).toBeInTheDocument();
    expect(screen.getByText("Indicar mais um")).toBeInTheDocument();
    expect(screen.queryByLabelText("Apagar categoria")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Editar categoria")).not.toBeInTheDocument();
    expect(screen.queryByText(/Aprovar categoria|remover aprovação/)).not.toBeInTheDocument();
  });

  it("depois da indicação o dono não edita mais", async () => {
    seed("voting");
    mockDb.tables.awards_nominees = [nom("n1", "c1", TEST_USER.id, "Meu")];
    mount("/awards/c/c1");
    await screen.findByText("Meu");
    expect(screen.queryByText("Apagar")).not.toBeInTheDocument();
    expect(screen.queryByText("Indicar mais um")).not.toBeInTheDocument();
  });

  it("admin do awards abre qualquer categoria, aprova e apaga", async () => {
    seed("voting", "outro");
    asAwardsAdmin();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("/awards/c/c1");
    fireEvent.click(await screen.findByText("✓ Aprovar categoria"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("set_award_category_approval", { p_category_id: "c1", p_approved: true }),
    );
    fireEvent.click(screen.getByLabelText("Apagar categoria"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "awards_categories" && w.op === "delete")).toBe(true));
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
    mockDb.tables.awards_categories = [
      approvedCat("c1", "o", "Melhor rolê", 0),
      approvedCat("c2", "o", "Maior bagunça", 1),
      approvedCat("c3", "o", "Sozinha", 2),
      cat("c4", "o", "Reprovada", 3),
    ];
    mockDb.tables.awards_nominees = [
      nom("a", "c1", "o", "Ana"),
      nom("b", "c1", "o", "Beto"),
      nom("c", "c2", "o", "Caio"),
      nom("d", "c2", "o", "Dani"),
      nom("e", "c3", "o", "Eva"),
      nom("f", "c4", "o", "Fabi"),
      nom("g", "c4", "o", "Gil"),
    ];
  };

  it("fora da votação avisa que está fechada", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mount("/awards/votar");
    expect(await screen.findByText("A votação não está aberta.")).toBeInTheDocument();
  });

  it("categoria não aprovada não entra na cédula", async () => {
    seed();
    mount("/awards/votar");
    expect(await screen.findByText("Cédula · 0/2")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reprovada/)).not.toBeInTheDocument();
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
    expect(screen.queryByText("Melhor rolê")).not.toBeInTheDocument(); // as dos outros só aparecem na cédula
  });
});

describe("AwardsPage — admin do awards", () => {
  beforeEach(() => {
    loginAs(TEST_USER);
    asAwardsAdmin();
  });

  const seed = (phase = "nominations") => {
    mockDb.tables.awards_editions = [edition(phase)];
    mockDb.tables.awards_categories = [cat("c1", "outro", "Pendente"), approvedCat("c2", "outro", "Escolhida", 1)];
  };

  it("vê todas as categorias e separa as aprovadas na aba", async () => {
    seed();
    mount();
    expect(await screen.findByText("Pendente")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Todas (2)" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Aprovadas (1)" }));
    expect(screen.getByText("Escolhida")).toBeInTheDocument();
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.queryByText("Indicar nova categoria")).not.toBeInTheDocument();
  });

  it("aprova e remove aprovação pela lista", async () => {
    seed();
    mount();
    fireEvent.click(await screen.findByLabelText("Aprovar Pendente"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("set_award_category_approval", { p_category_id: "c1", p_approved: true }),
    );
    fireEvent.click(screen.getByLabelText("Remover aprovação de Escolhida"));
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("set_award_category_approval", { p_category_id: "c2", p_approved: false }),
    );
  });

  it("mostra o erro se o banco recusar a aprovação", async () => {
    seed();
    mockDb.errors["rpc:set_award_category_approval"] = { message: "Só um admin do awards pode aprovar categorias." };
    mount();
    fireEvent.click(await screen.findByLabelText("Aprovar Pendente"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Só um admin do awards");
  });

  it("aba de aprovadas vazia avisa", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Aprovadas (0)" }));
    expect(screen.getByText("Nenhuma categoria aprovada ainda.")).toBeInTheDocument();
  });

  it("não tem limite de categorias", async () => {
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.awards_categories = ["a", "b", "c", "d", "e"].map((id, i) => cat(id, TEST_USER.id, `Cat ${id}`, i));
    mount();
    expect((await screen.findByText("Indicar nova categoria")).closest("button")).not.toBeDisabled();
  });

  it("gerencia fase e quem vê, sem a lista de admins nem apagar a edição", async () => {
    seed();
    mount();
    fireEvent.click(await screen.findByLabelText("Gerenciar awards"));
    fireEvent.click(await screen.findByText("Votação aberta", { selector: "button" }));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_editions" && w.op === "update")?.args[0]).toEqual({ phase: "voting" }),
    );
    expect(screen.getByText("Pessoas escolhidas")).toBeInTheDocument();
    expect(screen.queryByText("Mostrar lista de admins")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Apagar Awards 2026")).not.toBeInTheDocument();
  });
});

describe("AwardsManagePage — acesso", () => {
  it("quem não é admin do awards é barrado", async () => {
    loginAs(TEST_USER);
    mockDb.tables.awards_editions = [edition("nominations")];
    mount("/awards/gerenciar");
    expect(await screen.findByText("Acesso restrito aos admins do awards.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Fase" })).not.toBeInTheDocument();
  });
});

describe("AwardsPage — resultado", () => {
  const seed = () => {
    mockDb.tables.awards_editions = [edition("closed")];
    mockDb.tables.awards_categories = [approvedCat("c1", "o", "Melhor rolê"), cat("c2", "o", "Reprovada", 1)];
    mockDb.tables.awards_nominees = [nom("a", "c1", "o", "Ana"), nom("b", "c1", "o", "Beto"), nom("z", "c2", "o", "Zeca")];
    mockDb.rpcResults.award_results = [
      { category_id: "c1", nominee_id: "a", votes: 1 },
      { category_id: "c1", nominee_id: "b", votes: 3 },
    ];
  };

  it("admin do awards vê vencedor e ranking só das aprovadas", async () => {
    loginAs(TEST_USER);
    asAwardsAdmin();
    seed();
    mount("/awards");
    expect(await screen.findByText("🏆 Vencedor")).toBeInTheDocument();
    expect(screen.getByText("3 votos · 75%")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resultado" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Reprovada")).not.toBeInTheDocument();
    expect(screen.queryByText("Indicar nova categoria")).not.toBeInTheDocument();
  });

  it("admin do app também vê o resultado", async () => {
    loginAs(ADMIN_USER);
    seed();
    mount("/awards");
    expect(await screen.findByText("🏆 Vencedor")).toBeInTheDocument();
  });

  it("usuário comum não vê o resultado nem o pede ao banco", async () => {
    loginAs(TEST_USER);
    seed();
    mount("/awards");
    expect(await screen.findByText(/vai aparecer no Wrapped/)).toBeInTheDocument();
    expect(screen.queryByText("🏆 Vencedor")).not.toBeInTheDocument();
    expect(screen.queryByText(/votos ·/)).not.toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalledWith("award_results", expect.anything());
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

  it("admin do app monta a lista de admins do awards", async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.awards_editions = [edition("nominations")];
    mockDb.tables.profiles = [{ id: "u1", display_name: "Ana", avatar_url: null }];
    renderWithProviders(<AwardsAdminPage />);
    fireEvent.click(await screen.findByText("Mostrar lista de admins"));
    fireEvent.click(await screen.findByLabelText("Ana"));
    fireEvent.click(screen.getByText("Salvar admins"));
    await waitFor(() =>
      expect(mockDb.writes.find((w) => w.table === "awards_admins" && w.op === "upsert")?.args[0]).toEqual([
        { slug: "2026", user_id: "u1" },
      ]),
    );
    expect(await screen.findByText(/1 admin\(s\) do awards/)).toBeInTheDocument();
    expect(mockDb.writes.some((w) => w.table === "awards_viewers")).toBe(false);
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
    expect(await screen.findByText("Encerrado: resultado em breve no Wrapped")).toBeInTheDocument();
  });

  it("não aparece quando a edição está oculta ou não existe", async () => {
    mockDb.tables.awards_editions = [edition("hidden")];
    home();
    await flush();
    expect(screen.queryByText("Awards 2026")).not.toBeInTheDocument();
  });
});
