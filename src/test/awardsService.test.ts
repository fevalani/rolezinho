import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "./supabaseMock";
import {
  addNominee,
  castVote,
  createCategory,
  deleteCategory,
  deleteNominee,
  fetchContent,
  fetchAppUsers,
  fetchEdition,
  fetchViewers,
  saveViewers,
  setAudience,
  fetchMyVotes,
  fetchResults,
  reorderCategories,
  saveEdition,
  setPhase,
  uploadAwardImage,
} from "@/features/awards/awardsService";
import { supabase } from "@/lib/supabase";

beforeEach(() => {
  mockDb.reset();
  vi.mocked(supabase.rpc).mockClear();
  vi.mocked(supabase.storage.from).mockClear();
});

describe("awardsService — leitura", () => {
  it("fetchEdition mapeia a edição e normaliza fase inválida para hidden", async () => {
    mockDb.tables.awards_editions = [{ slug: "2026", title: "Awards 2026", subtitle: null, phase: "nominations" }];
    expect(await fetchEdition()).toEqual({
      slug: "2026",
      title: "Awards 2026",
      subtitle: null,
      phase: "nominations",
      audience: "all",
    });
    mockDb.tables.awards_editions = [{ slug: "x", title: "X", phase: "lixo" }];
    expect((await fetchEdition("x"))?.phase).toBe("hidden");
  });
  it("sem slug prefere a edição visível mais recente à oculta mais nova (bug da Home)", async () => {
    mockDb.tables.awards_editions = [
      { slug: "novo", title: "Novo", phase: "hidden" },
      { slug: "velho", title: "Velho", phase: "voting" },
    ];
    expect((await fetchEdition())?.slug).toBe("velho");
  });
  it("sem slug e só com edição oculta (admin) devolve a oculta para prévia", async () => {
    mockDb.tables.awards_editions = [{ slug: "novo", title: "Novo", phase: "hidden" }];
    expect((await fetchEdition())?.slug).toBe("novo");
  });
  it("lê a audiência da edição", async () => {
    mockDb.tables.awards_editions = [{ slug: "a", title: "A", phase: "voting", audience: "selected" }];
    expect((await fetchEdition("a"))?.audience).toBe("selected");
  });
  it("fetchEdition devolve null sem linhas ou com erro", async () => {
    expect(await fetchEdition()).toBeNull();
    mockDb.errors.awards_editions = { message: "boom" };
    expect(await fetchEdition("2026")).toBeNull();
  });
  it("fetchContent traz categorias e indicados", async () => {
    mockDb.tables.awards_categories = [
      { id: "c1", edition_slug: "2026", title: "Melhor", description: "d", image_url: null, position: 0, created_by: "u1" },
    ];
    mockDb.tables.awards_nominees = [
      { id: "n1", category_id: "c1", label: "Ana", image_url: "https://img/a.webp", created_by: "u2" },
    ];
    const { data, error } = await fetchContent("2026");
    expect(error).toBeNull();
    expect(data.categories[0]).toMatchObject({ id: "c1", editionSlug: "2026", createdBy: "u1" });
    expect(data.nominees[0]).toMatchObject({ categoryId: "c1", label: "Ana", imageUrl: "https://img/a.webp" });
  });
  it("fetchContent sem categorias não consulta indicados", async () => {
    const { data } = await fetchContent("2026");
    expect(data).toEqual({ categories: [], nominees: [] });
    expect(mockDb.queries.some((q) => q.table === "awards_nominees")).toBe(false);
  });
  it("fetchContent devolve a mensagem de erro", async () => {
    mockDb.errors.awards_categories = { message: "sem permissão" };
    expect((await fetchContent("2026")).error).toBe("sem permissão");
  });
});

describe("awardsService — indicações (RPC)", () => {
  it("createCategory chama a RPC com os parâmetros certos", async () => {
    const r = await createCategory("2026", "Melhor rolê", "desc", null);
    expect(r.error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("create_award_category", {
      p_edition: "2026",
      p_title: "Melhor rolê",
      p_description: "desc",
      p_image_url: null,
    });
  });
  it("devolve o erro do limite de 5 categorias", async () => {
    mockDb.errors["rpc:create_award_category"] = { message: "Você já indicou 5 categorias." };
    expect((await createCategory("2026", "X", null, null)).error).toBe("Você já indicou 5 categorias.");
  });
  it("addNominee chama a RPC e devolve o erro do limite de 5 por categoria", async () => {
    expect((await addNominee("c1", "Ana", null)).error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("add_award_nominee", {
      p_category_id: "c1",
      p_label: "Ana",
      p_image_url: null,
    });
    mockDb.errors["rpc:add_award_nominee"] = { message: "Você já indicou 5 nomes nesta categoria." };
    expect((await addNominee("c1", "Beto", null)).error).toContain("5 nomes");
  });
  it("apagar categoria e indicado grava delete", async () => {
    await deleteCategory("c1");
    await deleteNominee("n1");
    expect(mockDb.writes.map((w) => [w.table, w.op])).toEqual([
      ["awards_categories", "delete"],
      ["awards_nominees", "delete"],
    ]);
  });
});

describe("awardsService — votação", () => {
  it("castVote usa a RPC", async () => {
    await castVote("c1", "n1");
    expect(supabase.rpc).toHaveBeenCalledWith("cast_award_vote", { p_category_id: "c1", p_nominee_id: "n1" });
  });
  it("castVote devolve erro com a votação fechada", async () => {
    mockDb.errors["rpc:cast_award_vote"] = { message: "A votação não está aberta." };
    expect((await castVote("c1", "n1")).error).toBe("A votação não está aberta.");
  });
  it("fetchMyVotes vira mapa categoria → indicado", async () => {
    mockDb.rpcResults.my_award_votes = [{ category_id: "c1", nominee_id: "n1" }];
    expect(await fetchMyVotes("2026")).toEqual({ c1: "n1" });
  });
  it("fetchMyVotes é vazio em erro", async () => {
    mockDb.errors["rpc:my_award_votes"] = { message: "x" };
    expect(await fetchMyVotes("2026")).toEqual({});
  });
  it("fetchResults agrupa e ordena por votos", async () => {
    mockDb.rpcResults.award_results = [
      { category_id: "c1", nominee_id: "a", votes: 1 },
      { category_id: "c1", nominee_id: "b", votes: "4" },
    ];
    const { data, error } = await fetchResults("2026");
    expect(error).toBeNull();
    expect(data.c1).toEqual([
      { nomineeId: "b", votes: 4 },
      { nomineeId: "a", votes: 1 },
    ]);
  });
  it("fetchResults devolve o erro (resultado indisponível)", async () => {
    mockDb.errors["rpc:award_results"] = { message: "Resultado indisponível." };
    expect((await fetchResults("2026")).error).toBe("Resultado indisponível.");
  });
});

describe("awardsService — admin e imagens", () => {
  it("saveEdition faz upsert e setPhase atualiza a fase", async () => {
    await saveEdition({ slug: "2026", title: "A", subtitle: null, phase: "hidden", audience: "all" });
    await setPhase("2026", "voting");
    expect(mockDb.writes[0]).toMatchObject({ table: "awards_editions", op: "upsert" });
    expect(mockDb.writes[1]).toMatchObject({ table: "awards_editions", op: "update", args: [{ phase: "voting" }] });
  });
  it("reorderCategories grava a posição de cada id", async () => {
    await reorderCategories(["b", "a"]);
    expect(mockDb.writes.map((w) => w.args[0])).toEqual([{ position: 0 }, { position: 1 }]);
  });
  it("uploadAwardImage envia para a pasta do usuário e devolve a URL pública", async () => {
    const blob = new Blob(["x"], { type: "image/webp" });
    const r = await uploadAwardImage("u1", blob);
    expect(r.error).toBeNull();
    expect(r.url).toBe("https://test/x.png");
    expect(supabase.storage.from).toHaveBeenCalledWith("awards");
  });
});

describe("awardsService — quem vê", () => {
  it("setAudience atualiza a coluna", async () => {
    await setAudience("2026", "selected");
    expect(mockDb.writes[0]).toMatchObject({ table: "awards_editions", op: "update", args: [{ audience: "selected" }] });
  });
  it("fetchAppUsers mapeia perfis com nome padrão", async () => {
    mockDb.tables.profiles = [
      { id: "u1", display_name: "Ana", avatar_url: null },
      { id: "u2", display_name: " ", avatar_url: "https://a/b.png" },
    ];
    expect(await fetchAppUsers()).toEqual([
      { id: "u1", displayName: "Ana", avatarUrl: null },
      { id: "u2", displayName: "Sem nome", avatarUrl: "https://a/b.png" },
    ]);
  });
  it("fetchViewers lê os ids", async () => {
    mockDb.tables.awards_viewers = [{ user_id: "u1" }, { user_id: "u2" }];
    expect(await fetchViewers("2026")).toEqual(["u1", "u2"]);
  });
  it("saveViewers aplica só a diferença (remove quem saiu, adiciona quem entrou)", async () => {
    mockDb.tables.awards_viewers = [{ user_id: "u1" }, { user_id: "u2" }];
    const r = await saveViewers("2026", ["u2", "u3"]);
    expect(r.error).toBeNull();
    const del = mockDb.writes.find((w) => w.op === "delete");
    const up = mockDb.writes.find((w) => w.op === "upsert");
    expect(del?.table).toBe("awards_viewers");
    expect(mockDb.queries.some((q) => q.calls.some(([m, a]) => m === "in" && JSON.stringify(a) === JSON.stringify(["user_id", ["u1"]])))).toBe(true);
    expect(up?.args[0]).toEqual([{ slug: "2026", user_id: "u3" }]);
  });
  it("saveViewers não apaga nada se a leitura falhar", async () => {
    mockDb.errors.awards_viewers = { message: "sem acesso" };
    expect((await saveViewers("2026", ["u1"])).error).toBe("sem acesso");
    expect(mockDb.writes).toHaveLength(0);
  });
});
