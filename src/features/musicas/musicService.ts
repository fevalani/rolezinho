import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export type MusicSource = "youtube" | "spotify";
export type MediaType = "track" | "album" | "playlist" | "video";

export interface MusicMeta {
  source: MusicSource;
  media_type: MediaType;
  url: string;
  external_id: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration_ms: number | null;
}

export interface MusicPick {
  id: string;
  user_id: string;
  pick_date: string; // "YYYY-MM-DD"
  source: MusicSource;
  url: string;
  media_type: MediaType;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration_ms: number | null;
  external_id: string;
  created_at: string;
  profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  like_count: number; // total de likes recebidos
  liked_by_me: boolean; // se o usuário atual já curtiu
}

// Map: pickId → { count, likedByMe }
export type LikeMap = Record<string, { count: number; likedByMe: boolean }>;

// ═══════════════════════════════════════════
// URL Parsers
// ═══════════════════════════════════════════

export function parseUrl(
  raw: string,
): {
  source: MusicSource;
  external_id: string;
  media_type: MediaType;
  canonical: string;
} | null {
  const url = raw.trim();

  // ── YouTube ──────────────────────────────
  // youtube.com/watch?v=ID  |  youtu.be/ID  |  youtube.com/shorts/ID
  const ytWatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytWatch) {
    return {
      source: "youtube",
      external_id: ytWatch[1],
      media_type: "video",
      canonical: `https://www.youtube.com/watch?v=${ytWatch[1]}`,
    };
  }

  // youtube.com/playlist?list=ID
  const ytList = url.match(/youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/);
  if (ytList) {
    return {
      source: "youtube",
      external_id: ytList[1],
      media_type: "playlist",
      canonical: `https://www.youtube.com/playlist?list=${ytList[1]}`,
    };
  }

  // ── Spotify ──────────────────────────────
  // open.spotify.com/track/ID  |  /album/ID  |  /playlist/ID
  const spTrack = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/,
  );
  if (spTrack) {
    return {
      source: "spotify",
      external_id: spTrack[1],
      media_type: "track",
      canonical: `https://open.spotify.com/track/${spTrack[1]}`,
    };
  }

  const spAlbum = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/,
  );
  if (spAlbum) {
    return {
      source: "spotify",
      external_id: spAlbum[1],
      media_type: "album",
      canonical: `https://open.spotify.com/album/${spAlbum[1]}`,
    };
  }

  const spPlaylist = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/,
  );
  if (spPlaylist) {
    return {
      source: "spotify",
      external_id: spPlaylist[1],
      media_type: "playlist",
      canonical: `https://open.spotify.com/playlist/${spPlaylist[1]}`,
    };
  }

  return null;
}

// ═══════════════════════════════════════════
// Metadata resolvers via oEmbed (no API key needed)
// ═══════════════════════════════════════════

async function resolveYouTube(
  externalId: string,
  canonical: string,
): Promise<MusicMeta> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      // title format: "Song Name - Artist Name" or just "Video Title"
      const parts = data.title?.split(" - ");
      const title =
        parts?.length >= 2 ? parts.slice(0, -1).join(" - ") : data.title;
      const artist =
        parts?.length >= 2 ? parts[parts.length - 1] : data.author_name;
      return {
        source: "youtube",
        media_type: "video",
        url: canonical,
        external_id: externalId,
        title: title || "Vídeo sem título",
        artist: artist || null,
        thumbnail: `https://img.youtube.com/vi/${externalId}/mqdefault.jpg`,
        duration_ms: null, // oEmbed doesn't expose duration
      };
    }
  } catch {
    // fallback below
  }

  // Fallback: use thumbnail directly
  return {
    source: "youtube",
    media_type: "video",
    url: canonical,
    external_id: externalId,
    title: "YouTube",
    artist: null,
    thumbnail: `https://img.youtube.com/vi/${externalId}/mqdefault.jpg`,
    duration_ms: null,
  };
}

async function resolveSpotify(
  externalId: string,
  mediaType: MediaType,
  canonical: string,
): Promise<MusicMeta> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      // Spotify oEmbed title: "Song Name" or "Album Name"
      // provider_name: "Spotify"
      // thumbnail_url: album art
      return {
        source: "spotify",
        media_type: mediaType,
        url: canonical,
        external_id: externalId,
        title: data.title || "Sem título",
        artist: null, // oEmbed doesn't give artist separately
        thumbnail: data.thumbnail_url || null,
        duration_ms: null,
      };
    }
  } catch {
    // fallback
  }

  return {
    source: "spotify",
    media_type: mediaType,
    url: canonical,
    external_id: externalId,
    title:
      mediaType === "track"
        ? "Música"
        : mediaType === "album"
          ? "Álbum"
          : "Playlist",
    artist: null,
    thumbnail: null,
    duration_ms: null,
  };
}

export async function resolveMusicMeta(
  rawUrl: string,
): Promise<MusicMeta | null> {
  const parsed = parseUrl(rawUrl);
  if (!parsed) return null;

  if (parsed.source === "youtube") {
    return resolveYouTube(parsed.external_id, parsed.canonical);
  }
  return resolveSpotify(
    parsed.external_id,
    parsed.media_type,
    parsed.canonical,
  );
}

// ═══════════════════════════════════════════
// Supabase CRUD
// ═══════════════════════════════════════════

export function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchPicksByDate(
  date: string,
  currentUserId?: string,
): Promise<MusicPick[]> {
  const { data, error } = await supabase
    .from("music_picks")
    .select("*")
    .eq("pick_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchPicksByDate]", error);
    return [];
  }
  if (!data?.length) return [];

  // enrich profiles
  const userIds = [...new Set(data.map((p) => p.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const pm = new Map((profiles ?? []).map((p) => [p.id, p]));

  // fetch likes for all picks
  const pickIds = data.map((p) => p.id);
  const likeMap = await fetchLikeMap(pickIds, currentUserId);

  return data.map((p) => ({
    ...p,
    profile: pm.get(p.user_id),
    like_count: likeMap[p.id]?.count ?? 0,
    liked_by_me: likeMap[p.id]?.likedByMe ?? false,
  })) as MusicPick[];
}

export async function fetchMyPickForDate(
  userId: string,
  date: string,
): Promise<MusicPick | null> {
  const { data } = await supabase
    .from("music_picks")
    .select("*")
    .eq("user_id", userId)
    .eq("pick_date", date)
    .maybeSingle();
  return data as MusicPick | null;
}

export async function fetchAvailableDates(): Promise<string[]> {
  const { data } = await supabase
    .from("music_picks")
    .select("pick_date")
    .order("pick_date", { ascending: false });

  const unique = [...new Set((data ?? []).map((r) => r.pick_date as string))];
  return unique;
}

export async function savePick(
  userId: string,
  meta: MusicMeta,
): Promise<{ data: MusicPick | null; error: string | null }> {
  const date = todayDateStr();

  const { data, error } = await supabase
    .from("music_picks")
    .insert({
      user_id: userId,
      pick_date: date,
      source: meta.source,
      url: meta.url,
      media_type: meta.media_type,
      title: meta.title,
      artist: meta.artist,
      thumbnail: meta.thumbnail,
      duration_ms: meta.duration_ms,
      external_id: meta.external_id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505")
      return { data: null, error: "Você já indicou uma música hoje!" };
    return { data: null, error: error.message };
  }
  return { data: data as MusicPick, error: null };
}

export async function deletePick(pickId: string): Promise<void> {
  await supabase.from("music_picks").delete().eq("id", pickId);
}

// ═══════════════════════════════════════════
// Likes
// ═══════════════════════════════════════════

/** Busca contagens e "liked_by_me" para um conjunto de pickIds */
export async function fetchLikeMap(
  pickIds: string[],
  currentUserId?: string,
): Promise<LikeMap> {
  if (!pickIds.length) return {};

  const { data: likes } = await supabase
    .from("music_pick_likes")
    .select("pick_id, user_id")
    .in("pick_id", pickIds);

  const map: LikeMap = {};
  for (const id of pickIds) map[id] = { count: 0, likedByMe: false };
  for (const like of likes ?? []) {
    map[like.pick_id].count++;
    if (currentUserId && like.user_id === currentUserId) {
      map[like.pick_id].likedByMe = true;
    }
  }
  return map;
}

export async function toggleLike(
  userId: string,
  pickId: string,
  currentlyLiked: boolean,
): Promise<{ liked: boolean; error: string | null }> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from("music_pick_likes")
      .delete()
      .eq("user_id", userId)
      .eq("pick_id", pickId);
    if (error) return { liked: true, error: error.message };
    return { liked: false, error: null };
  } else {
    const { error } = await supabase
      .from("music_pick_likes")
      .insert({ user_id: userId, pick_id: pickId });
    if (error) {
      if (error.code === "23505") return { liked: true, error: null }; // already liked
      return { liked: false, error: error.message };
    }
    return { liked: true, error: null };
  }
}

export function subscribeLikesByDate(
  date: string,
  onLikeChange: (pickId: string, delta: 1 | -1, fromUserId: string) => void,
) {
  // Supabase realtime não permite filter em FK, então recebemos todos os
  // eventos de likes e deixamos a página filtrar por picks conhecidos.
  // O fromUserId é passado para que o chamador ignore seus próprios eventos
  // (já tratados pelo optimistic update).
  return supabase
    .channel(`music_likes:${date}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "music_pick_likes" },
      (payload) => onLikeChange(payload.new.pick_id, 1, payload.new.user_id),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "music_pick_likes" },
      (payload) => onLikeChange(payload.old.pick_id, -1, payload.old.user_id),
    )
    .subscribe();
}

export function subscribePicksByDate(
  date: string,
  onInsert: (pick: MusicPick) => void,
  onDelete: (id: string) => void,
) {
  return supabase
    .channel(`music:${date}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "music_picks",
        filter: `pick_date=eq.${date}`,
      },
      async (payload) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .eq("id", payload.new.user_id)
          .single();
        onInsert({ ...payload.new, profile } as MusicPick);
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "music_picks" },
      (payload) => onDelete(payload.old.id),
    )
    .subscribe();
}
