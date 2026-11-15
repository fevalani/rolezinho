import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  currentWeekStr,
  formatWeekLabel,
  fetchAllPosts,
  fetchPostsByUser,
  groupByWeek,
  upsertItem,
  createPost,
  deletePost,
  upsertInteraction,
  TYPE_CONFIG,
  type CulturaPost,
} from "@/features/cultura/culturaService";
import { searchExternalItems, resolveSpotifyLink } from "@/features/cultura/culturaApi";
import { mockDb } from "./supabaseMock";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("semana (segunda-feira)", () => {
  it.each([
    [new Date(2026, 10, 16), "2026-11-16"], // segunda
    [new Date(2026, 10, 18), "2026-11-16"], // quarta
    [new Date(2026, 10, 22), "2026-11-16"], // domingo fecha a semana anterior
    [new Date(2026, 10, 23), "2026-11-23"], // segunda seguinte
    [new Date(2027, 0, 1), "2026-12-28"], // virada de ano
  ])("%s → %s", (now, expected) => {
    vi.useFakeTimers({ toFake: ["Date"], now });
    expect(currentWeekStr()).toBe(expected);
  });
  it("formatWeekLabel: 'Esta semana' ou 'Semana de ...'", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18) });
    expect(formatWeekLabel("2026-11-16")).toBe("Esta semana");
    expect(formatWeekLabel("2026-11-02")).toMatch(/^Semana de /);
  });
  it("TYPE_CONFIG cobre os 4 tipos", () => {
    expect(Object.keys(TYPE_CONFIG).sort()).toEqual(["album", "book", "movie", "series"]);
  });
});

const post = (over: Partial<CulturaPost>): CulturaPost =>
  ({ id: "p", posted_week: "2026-11-02", global_rating: null, ...over }) as CulturaPost;

describe("groupByWeek", () => {
  it("agrupa por semana, da mais nova para a mais antiga", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18) });
    const g = groupByWeek([
      post({ id: "a", posted_week: "2026-11-02" }),
      post({ id: "b", posted_week: "2026-11-16" }),
      post({ id: "c", posted_week: "2026-11-02" }),
    ]);
    expect(g.map((w) => w.week)).toEqual(["2026-11-16", "2026-11-02"]);
    expect(g[0].label).toBe("Esta semana");
    expect(g[1].posts.map((p) => p.id)).toEqual(["a", "c"]);
  });
  it("semanas passadas ordenam pela nota global; a atual mantém a ordem", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18) });
    const g = groupByWeek([
      post({ id: "x", posted_week: "2026-11-02", global_rating: 3 }),
      post({ id: "y", posted_week: "2026-11-02", global_rating: 9 }),
      post({ id: "z", posted_week: "2026-11-02", global_rating: null }),
      post({ id: "n1", posted_week: "2026-11-16", global_rating: 1 }),
      post({ id: "n2", posted_week: "2026-11-16", global_rating: 10 }),
    ]);
    expect(g[1].posts.map((p) => p.id)).toEqual(["y", "x", "z"]);
    expect(g[0].posts.map((p) => p.id)).toEqual(["n1", "n2"]);
  });
  it("sem posts = vazio", () => {
    expect(groupByWeek([])).toEqual([]);
  });
});

describe("fetchAllPosts (nota global)", () => {
  const seed = () => {
    mockDb.tables.cultura_posts = [
      { id: "p1", user_id: "u1", item_id: "i1", personal_rating: 8, posted_week: "2026-11-16" },
    ];
    mockDb.tables.cultura_items = [{ id: "i1", title: "Filme X", type: "movie" }];
    mockDb.tables.profiles = [
      { id: "u1", display_name: "Autor", avatar_url: null },
      { id: "u2", display_name: "Votante", avatar_url: null },
    ];
  };
  it("sem posts = vazio; erro = vazio", async () => {
    expect(await fetchAllPosts("u1")).toEqual([]);
    mockDb.errors.cultura_posts = { message: "x" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchAllPosts("u1")).toEqual([]);
    spy.mockRestore();
  });
  it("a nota do autor entra na média junto com a dos outros", async () => {
    seed();
    mockDb.tables.cultura_interactions = [
      { user_id: "u2", item_id: "i1", global_rating: 6, watched: true },
    ];
    const [p] = await fetchAllPosts("u2");
    expect(p.global_rating).toBe(7);
    expect(p.global_count).toBe(2);
    expect(p.raters[0]).toMatchObject({ user_id: "u1", is_author: true, rating: 8 });
    expect(p.raters[1]).toMatchObject({ user_id: "u2", is_author: false, rating: 6 });
    expect(p.my_interaction).toEqual({ global_rating: 6, watched: true });
    expect(p.profile.display_name).toBe("Autor");
  });
  it("o voto do próprio autor na interação não conta em dobro", async () => {
    seed();
    mockDb.tables.cultura_interactions = [{ user_id: "u1", item_id: "i1", global_rating: 2 }];
    const [p] = await fetchAllPosts("u1");
    expect(p.global_rating).toBe(8);
    expect(p.global_count).toBe(1);
  });
  it("votos nulos são ignorados; sem nenhuma nota = null", async () => {
    seed();
    mockDb.tables.cultura_posts[0].personal_rating = null;
    mockDb.tables.cultura_interactions = [{ user_id: "u2", item_id: "i1", global_rating: null, watched: true }];
    const [p] = await fetchAllPosts("u1");
    expect(p.global_rating).toBeNull();
    expect(p.global_count).toBe(0);
    expect(p.my_interaction).toBeNull();
  });
  it("média com uma casa decimal", async () => {
    seed();
    mockDb.tables.cultura_posts[0].personal_rating = 7;
    mockDb.tables.cultura_interactions = [
      { user_id: "u2", item_id: "i1", global_rating: 8 },
      { user_id: "u3", item_id: "i1", global_rating: 8 },
    ];
    expect((await fetchAllPosts())[0].global_rating).toBe(7.7);
  });
  it("fetchPostsByUser usa o mesmo enriquecimento", async () => {
    seed();
    expect((await fetchPostsByUser("u1", "u1"))[0].item.title).toBe("Filme X");
  });
});

describe("mutações de cultura", () => {
  const ext = {
    external_id: "603",
    external_source: "tmdb" as const,
    type: "movie" as const,
    title: "Matrix",
    subtitle: null,
    year: 1999,
    cover_url: null,
    runtime_info: null,
    genres: [],
  };
  it("upsertItem usa (fonte, id externo) como chave", async () => {
    mockDb.tables.cultura_items = [{ id: "i1", title: "Matrix" }];
    const r = await upsertItem(ext);
    expect(r.data).toMatchObject({ id: "i1" });
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "external_source,external_id" });
  });
  it("upsertItem devolve o erro", async () => {
    mockDb.errors.cultura_items = { message: "rls" };
    expect(await upsertItem(ext)).toEqual({ data: null, error: "rls" });
  });
  it("createPost grava na semana atual", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18) });
    mockDb.tables.cultura_posts = [{ id: "p1", user_id: "u1", item_id: "i1", posted_week: "2026-11-16" }];
    mockDb.tables.cultura_items = [{ id: "i1" }];
    const r = await createPost("u1", "i1", "ótimo", 9);
    expect(mockDb.writes[0].args[0]).toMatchObject({
      user_id: "u1",
      item_id: "i1",
      comment: "ótimo",
      personal_rating: 9,
      posted_week: "2026-11-16",
    });
    expect(r.error).toBeNull();
    expect(r.data?.id).toBe("p1");
  });
  it("indicar o mesmo item de novo (23505) tem mensagem amigável", async () => {
    mockDb.errors.cultura_posts = { message: "dup", code: "23505" };
    expect(await createPost("u1", "i1", null, null)).toEqual({ data: null, error: "Você já indicou este item!" });
  });
  it("deletePost", async () => {
    expect(await deletePost("p1")).toEqual({ error: null });
  });
  it("upsertInteraction mescla com o que já existia", async () => {
    mockDb.tables.cultura_interactions = [{ global_rating: 7, watched: true }];
    await upsertInteraction("u1", "i1", { global_rating: 9 });
    expect(mockDb.writes[0].args[0]).toMatchObject({ user_id: "u1", item_id: "i1", global_rating: 9, watched: true });
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "user_id,item_id" });
  });
  it("upsertInteraction sem registro anterior parte de nota nula e não visto", async () => {
    await upsertInteraction("u1", "i1", { watched: true });
    expect(mockDb.writes[0].args[0]).toMatchObject({ global_rating: null, watched: true });
  });
});

describe("culturaApi", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("busca vazia não chama a rede", async () => {
    expect(await searchExternalItems("   ", "book")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("álbum não tem busca (usa link do Spotify)", async () => {
    expect(await searchExternalItems("abbey road", "album")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("filme/série sem chave do TMDB = vazio, sem rede", async () => {
    expect(await searchExternalItems("matrix", "movie")).toEqual([]);
    expect(await searchExternalItems("lost", "series")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("livros: mapeia a resposta do Google Books", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        items: [
          {
            id: "b1",
            volumeInfo: {
              title: "Dom Casmurro",
              authors: ["Machado", "Outro"],
              publishedDate: "1899-01-01",
              pageCount: 256,
              categories: ["Ficção"],
              imageLinks: { thumbnail: "http://img/x.jpg&edge=curl" },
            },
          },
          { id: "b2", volumeInfo: { publishedDate: "abcd" } },
        ],
      }),
    });
    const r = await searchExternalItems("dom casmurro", "book");
    expect(r[0]).toEqual({
      external_id: "b1",
      external_source: "google_books",
      type: "book",
      title: "Dom Casmurro",
      subtitle: "Machado, Outro",
      year: 1899,
      cover_url: "https://img/x.jpg",
      runtime_info: "256 páginas",
      genres: ["Ficção"],
    });
    expect(r[1]).toMatchObject({ title: "Sem título", year: null, cover_url: null });
    expect(fetchMock.mock.calls[0][0]).toContain("q=dom%20casmurro");
  });
  it("livros: limite de cota (429) e falha de rede devolvem vazio", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({ status: 429 });
    expect(await searchExternalItems("x", "book")).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await searchExternalItems("x", "book")).toEqual([]);
    warn.mockRestore();
  });
  it("filme/série com chave do TMDB: mapeia pôster, ano e temporadas", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_TMDB_KEY", "k123");
    const api = await import("@/features/cultura/culturaApi");
    fetchMock.mockResolvedValue({
      json: async () => ({
        results: [
          { id: 603, title: "Matrix", release_date: "1999-03-31", poster_path: "/p.jpg", runtime: 136 },
          { id: 1, name: "Lost", first_air_date: "2004-09-22", number_of_seasons: 6 },
          { id: 2, name: "Sem data" },
        ],
      }),
    });
    const r = await api.searchExternalItems("matrix", "movie");
    expect(fetchMock.mock.calls[0][0]).toContain("/search/movie?api_key=k123&query=matrix");
    expect(r[0]).toMatchObject({
      external_id: "603",
      external_source: "tmdb",
      type: "movie",
      title: "Matrix",
      year: 1999,
      cover_url: "https://image.tmdb.org/t/p/w500/p.jpg",
      runtime_info: "136min",
    });
    expect(r[1]).toMatchObject({ title: "Lost", year: 2004, runtime_info: "6 temporadas", cover_url: null });
    expect(r[2].year).toBeNull();
    await api.searchExternalItems("lost", "series");
    expect(fetchMock.mock.calls[1][0]).toContain("/search/tv?");
    vi.unstubAllEnvs();
  });
  it("resolveSpotifyLink: link de álbum vira item", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: "Abbey Road", thumbnail_url: "https://img/c.jpg" }) });
    expect(await resolveSpotifyLink("https://open.spotify.com/intl-pt/album/1DFixLWuPkv3KT3TnV35m3?si=x")).toEqual({
      external_id: "1DFixLWuPkv3KT3TnV35m3",
      external_source: "spotify",
      type: "album",
      title: "Abbey Road",
      subtitle: null,
      year: null,
      cover_url: "https://img/c.jpg",
      runtime_info: null,
      genres: [],
    });
  });
  it("resolveSpotifyLink: link inválido, erro HTTP ou rede = null", async () => {
    expect(await resolveSpotifyLink("https://exemplo.com")).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await resolveSpotifyLink("https://open.spotify.com/album/abc")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("x"));
    expect(await resolveSpotifyLink("https://open.spotify.com/album/abc")).toBeNull();
  });
});
