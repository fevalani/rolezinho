import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseUrl,
  resolveMusicMeta,
  todayDateStr,
  fetchPicksByDate,
  fetchAvailableDates,
  savePick,
  deletePick,
  toggleLike,
  fetchLikeMap,
  type MusicMeta,
} from "@/features/musicas/musicService";
import { mockDb } from "./supabaseMock";

describe("parseUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", "video"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "youtube", "dQw4w9WgXcQ", "video"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", "video"],
    ["https://www.youtube.com/playlist?list=PL123abc", "youtube", "PL123abc", "playlist"],
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "spotify", "4uLU6hMCjMI75M1A2tKUQC", "track"],
    ["https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC?si=x", "spotify", "4uLU6hMCjMI75M1A2tKUQC", "track"],
    ["https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", "spotify", "1DFixLWuPkv3KT3TnV35m3", "album"],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify", "37i9dQZF1DXcBWIGoYBM5M", "playlist"],
  ])("%s", (url, source, id, type) => {
    expect(parseUrl(url)).toMatchObject({ source, external_id: id, media_type: type });
  });
  it("aceita espaços em volta e devolve link canônico", () => {
    expect(parseUrl("  https://youtu.be/dQw4w9WgXcQ  ")?.canonical).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
  it.each(["", "texto qualquer", "https://exemplo.com/musica", "https://youtu.be/curto"])(
    "rejeita %j",
    (u) => {
      expect(parseUrl(u)).toBeNull();
    },
  );
});

describe("resolveMusicMeta", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("link inválido = null (sem rede)", async () => {
    expect(await resolveMusicMeta("lixo")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("YouTube: separa título e artista de 'Música - Artista'", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Never Gonna Give You Up - Rick Astley", author_name: "canal" }),
    });
    const m = await resolveMusicMeta("https://youtu.be/dQw4w9WgXcQ");
    expect(m).toMatchObject({
      source: "youtube",
      title: "Never Gonna Give You Up",
      artist: "Rick Astley",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    });
  });
  it("YouTube: título sem hífen usa o nome do canal como artista", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: "Vlog", author_name: "Canal X" }) });
    const m = await resolveMusicMeta("https://youtu.be/dQw4w9WgXcQ");
    expect(m).toMatchObject({ title: "Vlog", artist: "Canal X" });
  });
  it("YouTube: sem rede cai no fallback com miniatura", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const m = await resolveMusicMeta("https://youtu.be/dQw4w9WgXcQ");
    expect(m).toMatchObject({ title: "YouTube", artist: null });
    expect(m?.thumbnail).toContain("dQw4w9WgXcQ");
  });
  it("Spotify: usa o título e a capa do oEmbed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Álbum Legal", thumbnail_url: "https://img/x.jpg" }),
    });
    const m = await resolveMusicMeta("https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3");
    expect(m).toMatchObject({ source: "spotify", media_type: "album", title: "Álbum Legal", thumbnail: "https://img/x.jpg" });
  });
  it("Spotify: resposta de erro cai no fallback", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const m = await resolveMusicMeta("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(m).toMatchObject({ source: "spotify", media_type: "track" });
    expect(m?.title).toBeTruthy();
  });
});

describe("persistência das indicações", () => {
  const meta: MusicMeta = {
    source: "spotify",
    media_type: "track",
    url: "https://open.spotify.com/track/x",
    external_id: "x",
    title: "Faixa",
    artist: "Fulano",
    thumbnail: null,
    duration_ms: null,
  };

  it("todayDateStr é YYYY-MM-DD local", () => {
    expect(todayDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fetchPicksByDate sem dados = vazio", async () => {
    expect(await fetchPicksByDate("2026-12-01", "u1")).toEqual([]);
  });

  it("fetchPicksByDate junta perfil e curtidas", async () => {
    mockDb.tables.music_picks = [{ id: "p1", user_id: "u2", pick_date: "2026-12-01", title: "X" }];
    mockDb.tables.profiles = [{ id: "u2", display_name: "Beltrano", avatar_url: null }];
    mockDb.tables.music_pick_likes = [
      { pick_id: "p1", user_id: "u1" },
      { pick_id: "p1", user_id: "u3" },
    ];
    const [p] = await fetchPicksByDate("2026-12-01", "u1");
    expect(p.profile?.display_name).toBe("Beltrano");
    expect(p.like_count).toBe(2);
    expect(p.liked_by_me).toBe(true);
  });

  it("fetchAvailableDates remove duplicadas", async () => {
    mockDb.tables.music_picks = [
      { pick_date: "2026-12-02" },
      { pick_date: "2026-12-02" },
      { pick_date: "2026-12-01" },
    ];
    expect(await fetchAvailableDates()).toEqual(["2026-12-02", "2026-12-01"]);
  });

  it("savePick grava a indicação de hoje", async () => {
    mockDb.tables.music_picks = [{ id: "novo" }];
    const r = await savePick("u1", meta);
    expect(r.error).toBeNull();
    expect(mockDb.writes[0].args[0]).toMatchObject({
      user_id: "u1",
      pick_date: todayDateStr(),
      title: "Faixa",
      external_id: "x",
    });
  });

  it("savePick: segunda indicação no dia (23505) tem mensagem amigável", async () => {
    mockDb.errors.music_picks = { message: "duplicate key", code: "23505" };
    expect(await savePick("u1", meta)).toEqual({ data: null, error: "Você já indicou uma música hoje!" });
  });

  it("savePick repassa outros erros", async () => {
    mockDb.errors.music_picks = { message: "rls" };
    expect((await savePick("u1", meta)).error).toBe("rls");
  });

  it("deletePick apaga pelo id", async () => {
    await deletePick("p1");
    expect(mockDb.writes[0]).toMatchObject({ table: "music_picks", op: "delete" });
  });
});

describe("curtidas", () => {
  it("fetchLikeMap sem ids = vazio", async () => {
    expect(await fetchLikeMap([])).toEqual({});
  });
  it("curtir grava e devolve liked", async () => {
    expect(await toggleLike("u1", "p1", false)).toEqual({ liked: true, error: null });
    expect(mockDb.writes[0]).toMatchObject({ table: "music_pick_likes", op: "insert" });
    expect(mockDb.writes[0].args[0]).toEqual({ user_id: "u1", pick_id: "p1" });
  });
  it("descurtir apaga e devolve não-liked", async () => {
    expect(await toggleLike("u1", "p1", true)).toEqual({ liked: false, error: null });
    expect(mockDb.writes[0].op).toBe("delete");
  });
  it("curtir duas vezes (23505) é idempotente", async () => {
    mockDb.errors.music_pick_likes = { message: "dup", code: "23505" };
    expect(await toggleLike("u1", "p1", false)).toEqual({ liked: true, error: null });
  });
  it("erro ao curtir mantém o estado anterior", async () => {
    mockDb.errors.music_pick_likes = { message: "rls" };
    expect(await toggleLike("u1", "p1", false)).toEqual({ liked: false, error: "rls" });
    expect(await toggleLike("u1", "p1", true)).toEqual({ liked: true, error: "rls" });
  });
});
