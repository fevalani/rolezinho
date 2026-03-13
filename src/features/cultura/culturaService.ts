import { supabase } from "@/lib/supabase";
import { CulturaType, ExternalItem } from "./culturaApi";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type { CulturaType };

export interface CulturaItem {
  id: string;
  type: CulturaType;
  title: string;
  subtitle: string | null;
  year: number | null;
  cover_url: string | null;
  external_id: string;
  external_source: string;
  runtime_info: string | null;
  genres: string[];
  created_at: string;
}

export interface CulturaPost {
  id: string;
  user_id: string;
  item_id: string;
  comment: string | null;
  personal_rating: number | null;
  posted_week: string; // "YYYY-MM-DD" (monday of the week)
  created_at: string;
  // joined
  item: CulturaItem;
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  // computed
  global_rating: number | null; // AVG of all interactions
  global_count: number; // how many people rated
  my_interaction: {
    global_rating: number | null;
    watched: boolean;
  } | null;
}

export interface WeekGroup {
  week: string; // "YYYY-MM-DD"
  label: string; // "Esta semana" / "Semana de 10 jun"
  posts: CulturaPost[];
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

export function currentWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)); // Monday
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWeekLabel(weekStr: string): string {
  const current = currentWeekStr();
  if (weekStr === current) return "Esta semana";
  const d = new Date(weekStr + "T12:00:00");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `Semana de ${d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;
}

export const TYPE_CONFIG: Record<
  CulturaType,
  { label: string; icon: string; plural: string }
> = {
  movie: { label: "Filme", icon: "🎬", plural: "Filmes" },
  series: { label: "Série", icon: "📺", plural: "Séries" },
  book: { label: "Livro", icon: "📚", plural: "Livros" },
  album: { label: "Álbum", icon: "🎵", plural: "Álbuns" },
};

// ══════════════════════════════════════════════════════════════
// Fetch
// ══════════════════════════════════════════════════════════════

async function enrichPosts(
  posts: Record<string, unknown>[],
  currentUserId?: string,
): Promise<CulturaPost[]> {
  if (!posts.length) return [];

  const itemIds = [...new Set(posts.map((p) => p.item_id as string))];
  const userIds = [...new Set(posts.map((p) => p.user_id as string))];

  const [itemsRes, profilesRes, interactionsRes] = await Promise.all([
    supabase.from("cultura_items").select("*").in("id", itemIds),
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds),
    supabase.from("cultura_interactions").select("*").in("item_id", itemIds),
  ]);

  const itemsMap = new Map(
    (itemsRes.data ?? []).map((i) => [i.id, i as CulturaItem]),
  );
  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const interactions = interactionsRes.data ?? [];

  return posts.map((p) => {
    const item = itemsMap.get(p.item_id as string)!;
    const itemInteractions = interactions.filter(
      (i) => i.item_id === p.item_id,
    );
    const ratings = itemInteractions
      .map((i) => i.global_rating)
      .filter((r): r is number => r !== null);
    const global_rating = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;
    const myInteraction = currentUserId
      ? (itemInteractions.find((i) => i.user_id === currentUserId) ?? null)
      : null;

    return {
      ...(p as unknown as CulturaPost),
      item,
      profile: profilesMap.get(p.user_id as string) ?? {
        id: p.user_id as string,
        display_name: "?",
        avatar_url: null,
      },
      global_rating,
      global_count: ratings.length,
      my_interaction: myInteraction
        ? {
            global_rating: myInteraction.global_rating,
            watched: myInteraction.watched,
          }
        : null,
    };
  });
}

export async function fetchAllPosts(
  currentUserId?: string,
): Promise<CulturaPost[]> {
  const { data, error } = await supabase
    .from("cultura_posts")
    .select("*")
    .order("posted_week", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchAllPosts]", error);
    return [];
  }
  return enrichPosts((data ?? []) as Record<string, unknown>[], currentUserId);
}

export async function fetchPostsByUser(
  userId: string,
  currentUserId?: string,
): Promise<CulturaPost[]> {
  const { data, error } = await supabase
    .from("cultura_posts")
    .select("*")
    .eq("user_id", userId)
    .order("personal_rating", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchPostsByUser]", error);
    return [];
  }
  return enrichPosts((data ?? []) as Record<string, unknown>[], currentUserId);
}

// Group posts into weeks and sort past weeks by global rating
export function groupByWeek(posts: CulturaPost[]): WeekGroup[] {
  const current = currentWeekStr();
  const map = new Map<string, CulturaPost[]>();

  for (const post of posts) {
    const w = post.posted_week;
    if (!map.has(w)) map.set(w, []);
    map.get(w)!.push(post);
  }

  // Sort weeks descending
  const weeks = [...map.keys()].sort((a, b) => b.localeCompare(a));

  return weeks.map((week) => {
    let weekPosts = map.get(week)!;
    // Past weeks: sort by global rating desc
    if (week !== current) {
      weekPosts = [...weekPosts].sort(
        (a, b) => (b.global_rating ?? 0) - (a.global_rating ?? 0),
      );
    }
    return { week, label: formatWeekLabel(week), posts: weekPosts };
  });
}

// ══════════════════════════════════════════════════════════════
// Mutations
// ══════════════════════════════════════════════════════════════

export async function upsertItem(
  ext: ExternalItem,
): Promise<{ data: CulturaItem | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cultura_items")
    .upsert(
      {
        external_id: ext.external_id,
        external_source: ext.external_source,
        type: ext.type,
        title: ext.title,
        subtitle: ext.subtitle,
        year: ext.year,
        cover_url: ext.cover_url,
        runtime_info: ext.runtime_info,
        genres: ext.genres,
      },
      { onConflict: "external_source,external_id" },
    )
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as CulturaItem, error: null };
}

export async function createPost(
  userId: string,
  itemId: string,
  comment: string | null,
  personalRating: number | null,
): Promise<{ data: CulturaPost | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cultura_posts")
    .insert({
      user_id: userId,
      item_id: itemId,
      comment,
      personal_rating: personalRating,
      posted_week: currentWeekStr(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505")
      return { data: null, error: "Você já indicou este item!" };
    return { data: null, error: error.message };
  }
  return enrichPosts([data as Record<string, unknown>], userId).then(([p]) => ({
    data: p ?? null,
    error: null,
  }));
}

export async function deletePost(
  postId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("cultura_posts")
    .delete()
    .eq("id", postId);
  return { error: error?.message ?? null };
}

export async function upsertInteraction(
  userId: string,
  itemId: string,
  updates: { global_rating?: number | null; watched?: boolean },
): Promise<{ error: string | null }> {
  // Read existing first to merge
  const { data: existing } = await supabase
    .from("cultura_interactions")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .maybeSingle();

  const payload = {
    user_id: userId,
    item_id: itemId,
    global_rating:
      updates.global_rating !== undefined
        ? updates.global_rating
        : (existing?.global_rating ?? null),
    watched:
      updates.watched !== undefined
        ? updates.watched
        : (existing?.watched ?? false),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("cultura_interactions")
    .upsert(payload, { onConflict: "user_id,item_id" });

  return { error: error?.message ?? null };
}

// ══════════════════════════════════════════════════════════════
// Realtime
// ══════════════════════════════════════════════════════════════

export function subscribeCultura(onRefresh: () => void) {
  return supabase
    .channel("cultura_realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cultura_posts" },
      onRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cultura_interactions" },
      onRefresh,
    )
    .subscribe();
}
