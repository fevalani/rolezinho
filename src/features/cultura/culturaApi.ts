// ══════════════════════════════════════════════════════════════
// culturaApi.ts — busca em APIs externas (sem chaves secretas)
// TMDB: requer VITE_TMDB_KEY no .env
// Google Books: pública, sem chave
// Spotify: requer VITE_SPOTIFY_CLIENT_ID + VITE_SPOTIFY_CLIENT_SECRET
// ══════════════════════════════════════════════════════════════

export type CulturaType = "movie" | "series" | "book" | "album";

export interface ExternalItem {
  external_id: string;
  external_source: "tmdb" | "google_books" | "spotify";
  type: CulturaType;
  title: string;
  subtitle: string | null; // diretor/autor/artista
  year: number | null;
  cover_url: string | null;
  runtime_info: string | null;
  genres: string[];
}

// ─── TMDB ────────────────────────────────────────────────────────
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY as string | undefined;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

async function searchTmdb(
  query: string,
  type: "movie" | "series",
): Promise<ExternalItem[]> {
  if (!TMDB_KEY) return [];
  const endpoint = type === "movie" ? "movie" : "tv";
  const url = `${TMDB_BASE}/search/${endpoint}?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=pt-BR&page=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.results ?? [])
      .slice(0, 6)
      .map((r: Record<string, unknown>) => {
        const title = (r.title ?? r.name ?? "") as string;
        const dateStr = (r.release_date ?? r.first_air_date ?? "") as string;
        const year = dateStr ? parseInt(dateStr.slice(0, 4)) : null;
        const runtime = r.runtime ? `${r.runtime}min` : null;
        const seasons = r.number_of_seasons
          ? `${r.number_of_seasons} temporada${Number(r.number_of_seasons) !== 1 ? "s" : ""}`
          : null;
        return {
          external_id: String(r.id),
          external_source: "tmdb" as const,
          type,
          title,
          subtitle: null,
          year,
          cover_url: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
          runtime_info: runtime ?? seasons,
          genres: [],
        };
      });
  } catch {
    return [];
  }
}

// ─── Google Books ────────────────────────────────────────────────
// Requires VITE_GOOGLE_BOOKS_KEY in .env
// Get free key at: https://console.cloud.google.com → APIs → Books API
const BOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY as string | undefined;

async function searchBooks(query: string): Promise<ExternalItem[]> {
  const keyParam = BOOKS_KEY ? `&key=${BOOKS_KEY}` : "";
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&langRestrict=pt${keyParam}`;
  try {
    const res = await fetch(url);
    if (res.status === 429) {
      console.warn(
        "[Google Books] Rate limit hit — add VITE_GOOGLE_BOOKS_KEY to .env",
      );
      return [];
    }
    const data = await res.json();
    return (data.items ?? [])
      .slice(0, 6)
      .map((item: Record<string, unknown>) => {
        const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
        const imgLinks = (info.imageLinks ?? {}) as Record<string, string>;
        // Prefer medium > thumbnail; force https
        const cover =
          (imgLinks.medium ?? imgLinks.thumbnail ?? null)
            ?.replace("http://", "https://")
            ?.replace("&edge=curl", "") ?? null;
        const pages = info.pageCount ? `${info.pageCount} páginas` : null;
        const authors =
          (info.authors as string[] | undefined)?.join(", ") ?? null;
        const pubDate = (info.publishedDate as string | undefined) ?? "";
        const year = pubDate ? parseInt(pubDate.slice(0, 4)) : null;
        return {
          external_id: item.id as string,
          external_source: "google_books" as const,
          type: "book" as const,
          title: (info.title as string) ?? "Sem título",
          subtitle: authors,
          year: isNaN(year!) ? null : year,
          cover_url: cover,
          runtime_info: pages,
          genres: (info.categories as string[] | undefined) ?? [],
        };
      });
  } catch {
    return [];
  }
}

// ─── Spotify via oEmbed (link) ────────────────────────────────────
// Álbuns são resolvidos por link compartilhado, sem API key,
// reutilizando a mesma lógica do musicService (oEmbed público).

/** Regex para extrair ID e tipo de um link do Spotify */
function parseSpotifyLink(
  raw: string,
): { id: string; type: "album" | "track" | "playlist" } | null {
  const album = raw.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/,
  );
  if (album) return { id: album[1], type: "album" };
  const track = raw.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/,
  );
  if (track) return { id: track[1], type: "track" };
  const playlist = raw.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/,
  );
  if (playlist) return { id: playlist[1], type: "playlist" };
  return null;
}

export async function resolveSpotifyLink(
  url: string,
): Promise<ExternalItem | null> {
  const parsed = parseSpotifyLink(url);
  if (!parsed) return null;

  const canonical = `https://open.spotify.com/${parsed.type}/${parsed.id}`;
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    return {
      external_id: parsed.id,
      external_source: "spotify",
      type: "album",
      title: data.title ?? "Sem título",
      subtitle: null, // oEmbed não expõe artista separado
      year: null,
      cover_url: data.thumbnail_url ?? null,
      runtime_info: null,
      genres: [],
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────
export async function searchExternalItems(
  query: string,
  type: CulturaType,
): Promise<ExternalItem[]> {
  if (!query.trim()) return [];
  switch (type) {
    case "movie":
      return searchTmdb(query, "movie");
    case "series":
      return searchTmdb(query, "series");
    case "book":
      return searchBooks(query);
    case "album":
      return []; // álbuns usam resolveSpotifyLink
  }
}
