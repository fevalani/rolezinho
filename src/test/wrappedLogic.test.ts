import { describe, it, expect } from "vitest";
import {
  buildSlides,
  clampIndex,
  computeBoards,
  computeMemberRanking,
  computeStats,
  resolveAuto,
  editionYear,
  isEditionLive,
  todayStr,
  longestStreak,
  parseEdition,
  resolveGesture,
  safeUrl,
  yearRange,
} from "@/features/wrapped/wrappedLogic";
import type { WrappedRaw } from "@/features/wrapped/wrappedTypes";

const empty: WrappedRaw = { musics: [], culturaPosts: [], culturaItems: [], dice: [], games: [], predictions: [], rsvps: [] };

describe("parseEdition", () => {
  it("aceita o JSON de exemplo do pedido (aliases incluídos)", () => {
    const r = parseEdition({
      slug: "2026",
      pageTitle: "Wrapped 2026",
      isActive: true,
      slides: [
        { position: 3, type: "custom_ranking", title: "Top", items: [{ rank: 1, label: "A", sublabel: "12", imageUrl: "https://x.com/a.png" }] },
        { position: 1, type: "intro", title: "Oi" },
        { position: 2, type: "auto_user_stats", metricKey: "top_categories", title: "Explorou" },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.edition!.slides.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(r.edition!.slides[1].metricKey).toBe("top_cultura");
  });
  it("aceita top-list, order e customSlides", () => {
    const r = parseEdition({
      slug: "x",
      pageTitle: "T",
      customSlides: [{ order: 2, type: "top-list", items: [{ rank: 2, label: "B" }, { rank: 1, label: "A" }] }],
    });
    const s = r.edition!.slides[0];
    expect(s.type).toBe("custom_ranking");
    expect(s.position).toBe(2);
    expect(s.items!.map((i) => i.label)).toEqual(["A", "B"]);
  });
  it("erra sem slug ou pageTitle e para não-objeto", () => {
    expect(parseEdition({ pageTitle: "x" }).edition).toBeNull();
    expect(parseEdition({ slug: "2026" }).errors.join()).toMatch(/pageTitle/);
    expect(parseEdition("oi").errors).toHaveLength(1);
    expect(parseEdition({ slug: "a b", pageTitle: "x" }).edition).toBeNull();
  });
  it("descarta slides inválidos com aviso, sem derrubar a edição", () => {
    const r = parseEdition({
      slug: "2026",
      pageTitle: "T",
      slides: [
        { type: "banana" },
        { type: "auto_user_stats", metricKey: "nope" },
        { type: "custom_ranking", items: [] },
        { type: "media" },
        { type: "quote" },
        42,
        { type: "highlight", title: "ok" },
      ],
    });
    expect(r.edition!.slides).toHaveLength(1);
    expect(r.warnings).toHaveLength(6);
  });
  it("sanitiza URLs e cores", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://a.com/x.png")).toBe("https://a.com/x.png");
    expect(safeUrl('https://a.com/x"onerror')).toBeUndefined();
    expect(safeUrl("/wrapped/2026/media/foto-01.jpg")).toBe("/wrapped/2026/media/foto-01.jpg");
    for (const bad of ["//evil.com/x.png", "/../etc/passwd", "/a/../b.png", "/x y.png", "/a?b=c", "javascript:alert(1)", "foto.jpg"]) {
      expect(safeUrl(bad)).toBeUndefined();
    }
    const r = parseEdition({
      slug: "1",
      pageTitle: "T",
      theme: { primary: "#fff", secondary: "red; background:url(x)", background: "rgb(1,2,3)" },
      slides: [{ type: "media", imageUrl: "data:image/png;base64,AAA", backgroundImageUrl: "https://a.com/b.png" }],
    });
    expect(r.edition!.theme).toEqual({ primary: "#fff", secondary: undefined, background: "rgb(1,2,3)" });
    expect(r.edition!.slides[0].imageUrl).toBeUndefined();
    expect(r.edition!.slides[0].backgroundImageUrl).toBe("https://a.com/b.png");
  });
  it("isActive só é true quando for exatamente true", () => {
    expect(parseEdition({ slug: "1", pageTitle: "T", isActive: "true" }).edition!.isActive).toBe(false);
  });
});

describe("datas", () => {
  it("editionYear usa o slug AAAA ou o ano atual", () => {
    expect(editionYear("2025")).toBe(2025);
    expect(editionYear("verao", new Date("2030-05-05"))).toBe(2030);
  });
  it("yearRange", () => {
    expect(yearRange(2026)).toMatchObject({ startDate: "2026-01-01", endDate: "2027-01-01" });
  });
  it("longestStreak conta dias consecutivos, ignora duplicados e virada de mês", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-01", "2026-02-05"])).toBe(3);
  });
});

describe("computeStats", () => {
  it("sem dados, tudo é null", () => {
    const s = computeStats(empty, 2026);
    expect(s).toMatchObject({ totalActions: 0, music: null, cultura: null, games: null, dice: null, bolao: null, agenda: null, peakWeekday: null });
  });
  it("calcula música, cultura, jogos, dados, bolão e agenda", () => {
    const s = computeStats(
      {
        musics: [
          { pick_date: "2026-03-02", title: "a", artist: "Queen", thumbnail: "https://i.com/q.jpg" },
          { pick_date: "2026-03-03", title: "b", artist: "Queen", thumbnail: null },
          { pick_date: "2026-03-04", title: "c", artist: "ABBA", thumbnail: null },
        ],
        culturaPosts: [
          { item_id: "i1", personal_rating: 9, created_at: "2026-04-01T10:00:00Z" },
          { item_id: "i2", personal_rating: 7, created_at: "2026-04-08T10:00:00Z" },
        ],
        culturaItems: [
          { id: "i1", title: "Filme", cover_url: "https://i.com/f.jpg", type: "movie", genres: ["Drama", "Ação"] },
          { id: "i2", title: "Série", cover_url: null, type: "tv", genres: ["Drama"] },
        ],
        dice: [
          { dice_type: "d20", result: 20, created_at: "2026-05-01T10:00:00Z" },
          { dice_type: "d20", result: 1, created_at: "2026-05-01T10:00:00Z" },
          { dice_type: "d6", result: 6, created_at: "2026-05-01T10:00:00Z" },
        ],
        games: [
          { game: "sudoku", game_date: "2026-06-01", status: "won", score: 100 },
          { game: "sudoku", game_date: "2026-06-02", status: "lost", score: 0 },
          { game: "letreco", game_date: "2026-06-03", status: "won", score: 50 },
        ],
        predictions: [{ points_earned: 5, created_at: "2026-07-01T10:00:00Z" }, { points_earned: null, created_at: "2026-07-02T10:00:00Z" }],
        rsvps: [{ status: "confirmed", updated_at: "2026-08-01T10:00:00Z" }, { status: "maybe", updated_at: "2026-08-02T10:00:00Z" }],
      },
      2026,
    );
    expect(s.music!.top[0]).toEqual({ label: "Queen", count: 2, imageUrl: "https://i.com/q.jpg" });
    expect(s.cultura).toMatchObject({ total: 2, avgRating: 8, topGenres: [{ label: "Drama", count: 2 }, { label: "Ação", count: 1 }], best: { title: "Filme", rating: 9 } });
    expect(s.games).toMatchObject({ played: 3, won: 2, points: 150, favorite: { label: "Sudoku", count: 2 }, longestStreak: 3 });
    expect(s.dice).toMatchObject({ total: 3, crits: 1, fumbles: 1, favoriteDice: "D20" });
    expect(s.bolao).toEqual({ total: 2, points: 5 });
    expect(s.agenda).toEqual({ confirmed: 1, maybe: 1 });
    expect(s.totalActions).toBe(3 + 2 + 3 + 3 + 2 + 2);
    expect(s.peakWeekday).not.toBeNull();
  });
  it("dia da semana de pico", () => {
    // 2026-03-02 é segunda-feira
    const s = computeStats({ ...empty, musics: [
      { pick_date: "2026-03-02", title: "a", artist: null, thumbnail: null },
      { pick_date: "2026-03-09", title: "b", artist: null, thumbnail: null },
      { pick_date: "2026-03-03", title: "c", artist: null, thumbnail: null },
    ] }, 2026);
    expect(s.peakWeekday).toEqual({ label: "segunda", count: 2 });
  });
});

describe("buildSlides", () => {
  const ed = parseEdition({
    slug: "2026",
    pageTitle: "Wrapped 2026",
    subtitle: "sub",
    slides: [
      { position: 1, type: "intro", title: "Oi" },
      { position: 2, type: "auto_user_stats", metricKey: "games" },
      { position: 3, type: "auto_user_stats", metricKey: "top_music" },
      { position: 4, type: "custom_ranking", title: "Top", items: [{ rank: 1, label: "A" }] },
      { position: 5, type: "quote", title: "frase" },
    ],
  }).edition!;

  it("omite métricas automáticas sem dados e fecha com o resumo", () => {
    const slides = buildSlides(ed, computeStats(empty, 2026));
    expect(slides.map((s) => s.kind)).toEqual(["intro", "list", "quote", "outro"]);
  });
  it("inclui métricas com dados", () => {
    const stats = computeStats({ ...empty, games: [{ game: "letreco", game_date: "2026-01-01", status: "won", score: 10 }] }, 2026);
    const slides = buildSlides(ed, stats);
    expect(slides.map((s) => s.kind)).toEqual(["intro", "stat", "list", "quote", "outro"]);
    expect(slides[1].big!.value).toBe("1");
    expect(slides[4].facts!.length).toBeGreaterThan(0);
  });
  it("cria intro quando a edição não tem e usa título como fallback", () => {
    const slides = buildSlides({ ...ed, slides: [] }, computeStats(empty, 2026));
    expect(slides.map((s) => s.kind)).toEqual(["intro", "outro"]);
    expect(slides[0].title).toBe("Wrapped 2026");
  });
});

describe("gestos", () => {
  const base = { dx: 0, dy: 0, heldMs: 100, x: 300, width: 400 };
  it("toque curto: terço esquerdo volta, resto avança", () => {
    expect(resolveGesture({ ...base, x: 50 })).toBe("prev");
    expect(resolveGesture({ ...base, x: 300 })).toBe("next");
  });
  it("swipe horizontal", () => {
    expect(resolveGesture({ ...base, dx: -80 })).toBe("next");
    expect(resolveGesture({ ...base, dx: 80 })).toBe("prev");
  });
  it("segurar ou arrasto vertical não navega", () => {
    expect(resolveGesture({ ...base, heldMs: 600 })).toBe("none");
    expect(resolveGesture({ ...base, dy: 90 })).toBe("none");
  });
  it("clampIndex", () => {
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(9, 3)).toBe(2);
  });
});

describe("modo grupo", () => {
  const raw: WrappedRaw = {
    ...empty,
    musics: [
      { user_id: "a", pick_date: "2026-03-02", title: "x", artist: "Queen", thumbnail: null },
      { user_id: "b", pick_date: "2026-03-02", title: "y", artist: "Queen", thumbnail: null },
      { user_id: "b", pick_date: "2026-03-03", title: "z", artist: "ABBA", thumbnail: null },
    ],
    games: [{ user_id: "b", game: "sudoku", game_date: "2026-03-02", status: "won", score: 1 }],
  };
  const names = { a: "Ana Souza", b: "Beto Lima" };

  it("computeMemberRanking ordena por ações e usa o primeiro nome", () => {
    expect(computeMemberRanking(raw, names)).toEqual([
      { rank: 1, label: "Beto", sublabel: "3 ações" },
      { rank: 2, label: "Ana", sublabel: "1 ação" },
    ]);
  });
  it("nome desconhecido vira 'Alguém'", () => {
    expect(computeMemberRanking(raw, {})[0].label).toBe("Alguém");
  });
  it("top_members só existe no grupo e com dados", () => {
    const stats = computeStats(raw, 2026);
    const members = computeMemberRanking(raw, names);
    expect(resolveAuto("top_members", stats, {}, "user", members)).toBeNull();
    expect(resolveAuto("top_members", stats, {}, "group", [])).toBeNull();
    expect(resolveAuto("top_members", stats, {}, "group", members)).toMatchObject({ kind: "list", title: "Quem mais apareceu" });
  });
  it("títulos padrão mudam no grupo, mas o título do admin vence", () => {
    const stats = computeStats(raw, 2026);
    expect(resolveAuto("top_music", stats, {}, "user")!.title).toBe("O que você mais ouviu");
    expect(resolveAuto("top_music", stats, {}, "group")!.title).toBe("O que o grupo mais ouviu");
    expect(resolveAuto("top_music", stats, { title: "Custom" }, "group")!.title).toBe("Custom");
    expect(resolveAuto("summary", stats, {}, "group")!.big!.label).toMatch(/grupo/);
  });
  it("buildSlides no grupo inclui o ranking de membros; no usuário omite", () => {
    const ed = parseEdition({ slug: "2026", pageTitle: "W", slides: [{ position: 1, type: "auto_user_stats", metricKey: "top_members" }] }).edition!;
    const stats = computeStats(raw, 2026);
    const members = computeMemberRanking(raw, names);
    expect(buildSlides(ed, stats, { mode: "group", members }).map((s) => s.kind)).toEqual(["intro", "list", "outro"]);
    expect(buildSlides(ed, stats, { mode: "user", members }).map((s) => s.kind)).toEqual(["intro", "outro"]);
  });
});

describe("janela de exibição", () => {
  const live = (e: object, d: string) => isEditionLive({ isActive: true, ...e }, new Date(`${d}T15:00:00Z`));
  it("inativa nunca está no ar", () => {
    expect(isEditionLive({ isActive: false }, new Date())).toBe(false);
  });
  it("sem datas, ativa = no ar", () => {
    expect(live({}, "2026-06-01")).toBe(true);
  });
  it("entra em startsAt e sai depois de endsAt (inclusive)", () => {
    const w = { startsAt: "2026-12-01", endsAt: "2027-01-15" };
    expect(live(w, "2026-11-30")).toBe(false);
    expect(live(w, "2026-12-01")).toBe(true);
    expect(live(w, "2027-01-15")).toBe(true);
    expect(live(w, "2027-01-16")).toBe(false);
  });
  it("usa o dia de São Paulo, não o UTC", () => {
    // 02:00 UTC de 01/12 ainda é 30/11 em São Paulo
    expect(isEditionLive({ isActive: true, startsAt: "2026-12-01" }, new Date("2026-12-01T02:00:00Z"))).toBe(false);
    expect(todayStr(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-30");
  });
  it("parseEdition valida datas", () => {
    const base = { slug: "1", pageTitle: "T" };
    expect(parseEdition({ ...base, startsAt: "2026-12-01", endsAt: "2027-01-15" }).edition).toMatchObject({ startsAt: "2026-12-01", endsAt: "2027-01-15" });
    expect(parseEdition({ ...base, startsAt: "01/12/2026" }).errors[0]).toMatch(/AAAA-MM-DD/);
    expect(parseEdition({ ...base, startsAt: "2026-12-10", endsAt: "2026-12-01" }).errors[0]).toMatch(/anterior/);
    expect(parseEdition(base).edition!.startsAt).toBeUndefined();
  });
});

describe("rankings de pessoas por módulo (grupo)", () => {
  const names = { a: "Ana Souza", b: "Beto Lima", c: "Caio" };
  const raw: WrappedRaw = {
    musics: [
      { user_id: "a", pick_date: "2026-01-01", title: "x", artist: "Q", thumbnail: null },
      { user_id: "a", pick_date: "2026-01-02", title: "y", artist: "Q", thumbnail: null },
      { user_id: "b", pick_date: "2026-01-03", title: "z", artist: "Q", thumbnail: null },
    ],
    culturaPosts: [
      { user_id: "b", item_id: "i", personal_rating: 8, created_at: "2026-02-01T00:00:00Z" },
      { user_id: "b", item_id: "j", personal_rating: 9, created_at: "2026-02-08T00:00:00Z" },
      { user_id: "a", item_id: "k", personal_rating: null, created_at: "2026-02-09T00:00:00Z" },
    ],
    culturaItems: [],
    dice: [
      { user_id: "c", dice_type: "d20", result: 20, created_at: "2026-03-01T00:00:00Z" },
      { user_id: "c", dice_type: "d20", result: 3, created_at: "2026-03-01T00:00:00Z" },
      { user_id: "a", dice_type: "d6", result: 6, created_at: "2026-03-01T00:00:00Z" },
    ],
    games: [
      { user_id: "c", game: "sudoku", game_date: "2026-04-01", status: "won", score: 1 },
      { user_id: "c", game: "letreco", game_date: "2026-04-02", status: "lost", score: 0 },
      { user_id: "a", game: "sudoku", game_date: "2026-04-01", status: "won", score: 1 },
      { user_id: "a", game: "letroso", game_date: "2026-04-02", status: "won", score: 1 },
      { user_id: "a", game: "word500", game_date: "2026-04-03", status: "won", score: 1 },
    ],
    predictions: [
      { user_id: "b", points_earned: 5, created_at: "2026-05-01T00:00:00Z" },
      { user_id: "b", points_earned: null, created_at: "2026-05-02T00:00:00Z" },
      { user_id: "a", points_earned: 3, created_at: "2026-05-01T00:00:00Z" },
    ],
    rsvps: [
      { user_id: "c", status: "confirmed", updated_at: "2026-06-01T00:00:00Z" },
      { user_id: "c", status: "maybe", updated_at: "2026-06-02T00:00:00Z" },
      { user_id: "a", status: "maybe", updated_at: "2026-06-02T00:00:00Z" },
    ],
  };

  it("ordena por quantidade, usa o primeiro nome e explica o valor", () => {
    const b = computeBoards(raw, names);
    expect(b.players).toEqual([
      { rank: 1, label: "Ana", sublabel: "3 partidas · 3 vitórias" },
      { rank: 2, label: "Caio", sublabel: "2 partidas · 1 vitória" },
    ]);
    expect(b.music).toEqual([
      { rank: 1, label: "Ana", sublabel: "2 indicações" },
      { rank: 2, label: "Beto", sublabel: "1 indicação" },
    ]);
    expect(b.cultura![0]).toEqual({ rank: 1, label: "Beto", sublabel: "2 posts · nota média 8,5" });
    expect(b.cultura![1].sublabel).toBe("1 post"); // sem nota: não inventa média
    expect(b.dice).toEqual([
      { rank: 1, label: "Caio", sublabel: "2 rolagens · 1 crítico" },
      { rank: 2, label: "Ana", sublabel: "1 rolagem" },
    ]);
    expect(b.bolao).toEqual([
      { rank: 1, label: "Beto", sublabel: "5 pontos · 2 palpites" },
      { rank: 2, label: "Ana", sublabel: "3 pontos · 1 palpite" },
    ]);
    expect(b.agenda).toEqual([{ rank: 1, label: "Caio", sublabel: "1 presença confirmada" }]); // "talvez" não conta
  });

  it("limita a 5, ignora linhas sem user_id e devolve undefined sem dados", () => {
    const many: WrappedRaw = { ...raw, musics: Array.from({ length: 7 }, (_, i) => ({ user_id: `u${i}`, pick_date: "2026-01-01", title: "t", artist: null, thumbnail: null })) };
    expect(computeBoards(many, {}).music).toHaveLength(5);
    expect(computeBoards(many, {}).music![0].label).toBe("Alguém"); // perfil desconhecido
    const none = computeBoards({ ...empty, games: [{ game: "sudoku", game_date: "2026-01-01", status: "won", score: 1 }] }, {});
    expect(none).toEqual({ players: undefined, music: undefined, cultura: undefined, dice: undefined, bolao: undefined, agenda: undefined });
    expect(computeBoards({ ...raw, predictions: [{ user_id: "a", points_earned: null, created_at: "2026-01-01T00:00:00Z" }] }, names).bolao).toBeUndefined();
  });

  it("os slides só existem no grupo, com dados, e o título do admin vence", () => {
    const boards = computeBoards(raw, names);
    const stats = computeStats(empty, 2026);
    const keys = ["top_players", "top_music_members", "top_cultura_members", "top_dice_members", "top_bolao_members", "top_agenda_members"] as const;
    const titles = keys.map((k) => resolveAuto(k, stats, {}, "group", [], boards)!.title);
    expect(titles).toEqual(["Quem mais joga", "Quem mais indica música", "Quem mais posta em Cultura", "Quem mais rola dados", "Quem lidera o bolão", "Quem mais confirma presença"]);
    for (const k of keys) {
      expect(resolveAuto(k, stats, {}, "user", [], boards)).toBeNull(); // no modo pessoal não faz sentido
      expect(resolveAuto(k, stats, {}, "group", [], {})).toBeNull(); // sem dados: omitido
    }
    expect(resolveAuto("top_players", stats, { title: "Os viciados" }, "group", [], boards)!.title).toBe("Os viciados");
  });

  it("parseEdition aceita as novas chaves", () => {
    const r = parseEdition({ slug: "x", pageTitle: "T", slides: [{ type: "auto_user_stats", metricKey: "top_players" }, { type: "auto_user_stats", metricKey: "top_bolao_members" }] });
    expect(r.warnings).toEqual([]);
    expect(r.edition!.slides.map((s) => s.metricKey)).toEqual(["top_players", "top_bolao_members"]);
  });
});
