import { supabase } from "@/lib/supabase";
import { editionYear, isEditionLive, parseEdition, yearRange } from "./wrappedLogic";
import type { GameKey, WrappedEdition, WrappedRaw } from "./wrappedTypes";

// Tabela: wrapped_editions — migration: supabase/wrapped_migration.sql
// Dados do usuário vêm das tabelas dos próprios módulos (somente leitura).

type Row = Record<string, unknown>;

function fromRow(r: Row): WrappedEdition | null {
  const cfg = (r.config && typeof r.config === "object" ? r.config : {}) as Row;
  const { edition } = parseEdition({ ...cfg, slug: r.slug, isActive: r.is_active === true, startsAt: r.starts_at, endsAt: r.ends_at });
  return edition;
}

/**
 * Edição pelo slug (qualquer estado; a RLS esconde rascunhos de quem não é admin),
 * ou, sem slug, a mais recente que está no ar hoje (ativa e dentro da janela).
 */
export async function fetchEdition(slug?: string): Promise<WrappedEdition | null> {
  try {
    const base = supabase.from("wrapped_editions").select("*");
    const { data, error } = slug
      ? await base.eq("slug", slug).limit(1)
      : await base.eq("is_active", true).order("slug", { ascending: false });
    if (error || !data?.length) return null;
    const list = (data as Row[]).map(fromRow).filter((e): e is WrappedEdition => e !== null);
    return slug ? (list[0] ?? null) : (list.find((e) => isEditionLive(e)) ?? null);
  } catch {
    return null;
  }
}

/** Todas as edições (rascunhos só aparecem para o admin, via RLS). */
export async function fetchEditions(): Promise<WrappedEdition[]> {
  try {
    const { data, error } = await supabase
      .from("wrapped_editions")
      .select("*")
      .order("slug", { ascending: false });
    if (error || !data) return [];
    return (data as Row[]).map(fromRow).filter((e): e is WrappedEdition => e !== null);
  } catch {
    return [];
  }
}

export async function saveEdition(
  edition: WrappedEdition,
  userId: string,
): Promise<{ error: string | null }> {
  const { slug, isActive, startsAt, endsAt, ...config } = edition;
  const { error } = await supabase.from("wrapped_editions").upsert(
    {
      slug,
      config,
      is_active: isActive,
      starts_at: startsAt ?? null,
      ends_at: endsAt ?? null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );
  return { error: error?.message ?? null };
}

export async function deleteEdition(slug: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("wrapped_editions").delete().eq("slug", slug);
  return { error: error?.message ?? null };
}

export interface AppUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Usuários do app (perfis), para o admin escolher quem pode ver o Wrapped. */
export async function fetchAppUsers(): Promise<AppUser[]> {
  const rows = await safeRows(
    supabase.from("profiles").select("id, display_name, avatar_url").order("display_name", { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id as string,
    displayName: ((r.display_name as string) ?? "").trim() || "Sem nome",
    avatarUrl: (r.avatar_url as string | null) ?? null,
  }));
}

/** Quem pode ver a edição (ids dos perfis). Só o admin lê a lista toda (RLS). */
export async function fetchViewers(slug: string): Promise<string[]> {
  const rows = await safeRows(supabase.from("wrapped_viewers").select("user_id").eq("slug", slug));
  return rows.map((r) => r.user_id as string);
}

/** Quantos usuários podem ver cada edição (para a lista do admin). */
export async function fetchViewerCounts(): Promise<Record<string, number>> {
  const rows = await safeRows(supabase.from("wrapped_viewers").select("slug"));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.slug as string] = (out[r.slug as string] ?? 0) + 1;
  return out;
}

/** Grava a lista de quem vê a edição (só aplica a diferença; falha de leitura não apaga nada). */
export async function saveViewers(slug: string, userIds: string[]): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.from("wrapped_viewers").select("user_id").eq("slug", slug);
    if (error) return { error: error.message };
    const current = new Set(((data ?? []) as Row[]).map((r) => r.user_id as string));
    const wanted = new Set(userIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));
    if (removed.length) {
      const { error: e } = await supabase.from("wrapped_viewers").delete().eq("slug", slug).in("user_id", removed);
      if (e) return { error: e.message };
    }
    if (added.length) {
      const { error: e } = await supabase
        .from("wrapped_viewers")
        .upsert(added.map((user_id) => ({ slug, user_id })), { onConflict: "slug,user_id" });
      if (e) return { error: e.message };
    }
    return { error: null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const GAME_TABLES: [GameKey, string][] = [
  ["letreco", "letreco_games"],
  ["letroso", "letroso_games"],
  ["sudoku", "sudoku_games"],
  ["word500", "word500_games"],
  ["fronteiras", "fronteiras_games"],
];

/** Dado de uma consulta que pode falhar (tabela ausente/migration pendente) sem derrubar o resto. */
async function safeRows(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  try {
    const { data, error } = await p;
    return error || !Array.isArray(data) ? [] : (data as Row[]);
  } catch {
    return [];
  }
}

/** Perfis (id → nome) para o ranking de membros do grupo. */
export async function fetchProfileNames(): Promise<Record<string, string>> {
  const rows = await safeRows(supabase.from("profiles").select("id, display_name"));
  return Object.fromEntries(rows.map((r) => [r.id as string, (r.display_name as string) ?? ""]));
}

/**
 * Dados crus no ano da edição: do usuário, ou do grupo inteiro com `userId = null`.
 * `user_id` sempre vem no select (o grupo usa no ranking de membros). Cada fonte é
 * independente: falha vira lista vazia. No grupo vale o limite de linhas do PostgREST
 * (1000 por padrão, configurável no Supabase).
 */
export async function fetchUserRaw(userId: string | null, slug: string): Promise<WrappedRaw> {
  const { startDate, endDate, startTs, endTs } = yearRange(editionYear(slug));

  const rows = (table: string, cols: string, dateCol: string, from: string, to: string, finishedOnly = false) => {
    let q = supabase.from(table).select(`user_id, ${cols}`).gte(dateCol, from).lt(dateCol, to);
    if (userId) q = q.eq("user_id", userId);
    if (finishedOnly) q = q.neq("status", "playing");
    return safeRows(q);
  };

  const [musics, posts, dice, preds, rsvps, ...gameRows] = await Promise.all([
    rows("music_picks", "pick_date, title, artist, thumbnail", "pick_date", startDate, endDate),
    rows("cultura_posts", "item_id, personal_rating, created_at", "created_at", startTs, endTs),
    rows("dice_rolls", "dice_type, result, created_at", "created_at", startTs, endTs),
    rows("bolao_predictions", "points_earned, created_at", "created_at", startTs, endTs),
    rows("agenda_rsvps", "status, updated_at", "updated_at", startTs, endTs),
    ...GAME_TABLES.map(([, table]) =>
      rows(table, "game_date, status, score", "game_date", startDate, endDate, true),
    ),
  ]);

  const itemIds = [...new Set(posts.map((p) => p.item_id as string))];
  const items = itemIds.length
    ? await safeRows(
        supabase.from("cultura_items").select("id, title, cover_url, type, genres").in("id", itemIds),
      )
    : [];

  return {
    musics: musics as WrappedRaw["musics"],
    culturaPosts: posts as WrappedRaw["culturaPosts"],
    culturaItems: items.map((i) => ({ ...i, genres: Array.isArray(i.genres) ? i.genres : [] })) as WrappedRaw["culturaItems"],
    dice: dice as WrappedRaw["dice"],
    games: gameRows.flatMap((rs, i) =>
      rs.map((r) => ({ user_id: r.user_id as string, game: GAME_TABLES[i][0], game_date: r.game_date as string, status: r.status as string, score: Number(r.score ?? 0) })),
    ),
    predictions: preds as WrappedRaw["predictions"],
    rsvps: rsvps as WrappedRaw["rsvps"],
  };
}
