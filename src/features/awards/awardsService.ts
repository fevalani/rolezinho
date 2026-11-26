import { supabase } from "@/lib/supabase";
import { PHASES } from "./awardsLogic";
import type {
  AwardsCategory,
  AwardsAudience,
  AwardsEdition,
  AwardsUser,
  AwardsNominee,
  AwardsPhase,
  AwardsResults,
  MyVotes,
} from "./awardsTypes";

// Único lugar que fala com o Supabase no Awards. Migration: supabase/awards_migration.sql
// Criação de categoria/indicado e voto passam por RPC (limites e fase são checados no banco).

type Row = Record<string, unknown>;
type Result = { error: string | null };

const isPhase = (v: unknown): v is AwardsPhase => PHASES.includes(v as AwardsPhase);

function editionFromRow(r: Row): AwardsEdition {
  return {
    slug: r.slug as string,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? null,
    phase: isPhase(r.phase) ? r.phase : "hidden",
    audience: r.audience === "selected" ? "selected" : "all",
  };
}

const categoryFromRow = (r: Row): AwardsCategory => ({
  id: r.id as string,
  editionSlug: r.edition_slug as string,
  title: r.title as string,
  description: (r.description as string | null) ?? null,
  imageUrl: (r.image_url as string | null) ?? null,
  position: (r.position as number) ?? 0,
  createdBy: r.created_by as string,
  approved: !!r.approved_at,
});

const nomineeFromRow = (r: Row): AwardsNominee => ({
  id: r.id as string,
  categoryId: r.category_id as string,
  label: (r.label as string | null) ?? null,
  imageUrl: (r.image_url as string | null) ?? null,
  createdBy: r.created_by as string,
});

// ─── Leitura ────────────────────────────────────────────────────────────────

/**
 * Edição pelo slug, ou (sem slug) a mais recente que o grupo já enxerga. Se só houver edição oculta
 * (a RLS só a entrega ao admin), devolve a mais recente para ele pré-visualizar.
 */
export async function fetchEdition(slug?: string): Promise<AwardsEdition | null> {
  try {
    const base = supabase.from("awards_editions").select("*");
    const { data, error } = slug
      ? await base.eq("slug", slug).limit(1)
      : await base.order("created_at", { ascending: false }).limit(20);
    if (error || !data?.length) return null;
    const list = (data as Row[]).map(editionFromRow);
    return slug ? list[0] : (list.find((e) => e.phase !== "hidden") ?? list[0]);
  } catch {
    return null;
  }
}

export async function fetchEditions(): Promise<AwardsEdition[]> {
  try {
    const { data, error } = await supabase.from("awards_editions").select("*").order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as Row[]).map(editionFromRow);
  } catch {
    return [];
  }
}

export interface AwardsContent {
  categories: AwardsCategory[];
  nominees: AwardsNominee[];
}

export async function fetchContent(slug: string): Promise<{ data: AwardsContent; error: string | null }> {
  const empty = { categories: [], nominees: [] };
  try {
    const cats = await supabase.from("awards_categories").select("*").eq("edition_slug", slug).order("position");
    if (cats.error) return { data: empty, error: cats.error.message };
    const categories = ((cats.data ?? []) as Row[]).map(categoryFromRow);
    if (!categories.length) return { data: empty, error: null };
    const noms = await supabase
      .from("awards_nominees")
      .select("*")
      .in("category_id", categories.map((c) => c.id))
      .order("created_at");
    if (noms.error) return { data: { categories, nominees: [] }, error: noms.error.message };
    return { data: { categories, nominees: ((noms.data ?? []) as Row[]).map(nomineeFromRow) }, error: null };
  } catch (e) {
    return { data: empty, error: e instanceof Error ? e.message : "Erro ao carregar." };
  }
}

// ─── Indicações (RPC) ───────────────────────────────────────────────────────

export async function createCategory(
  edition: string,
  title: string,
  description: string | null,
  imageUrl: string | null,
): Promise<Result> {
  const { error } = await supabase.rpc("create_award_category", {
    p_edition: edition,
    p_title: title,
    p_description: description,
    p_image_url: imageUrl,
  });
  return { error: error?.message ?? null };
}

export async function addNominee(categoryId: string, label: string | null, imageUrl: string | null): Promise<Result> {
  const { error } = await supabase.rpc("add_award_nominee", {
    p_category_id: categoryId,
    p_label: label,
    p_image_url: imageUrl,
  });
  return { error: error?.message ?? null };
}

export async function updateCategory(
  id: string,
  patch: { title: string; description: string | null; imageUrl: string | null },
): Promise<Result> {
  const { error } = await supabase
    .from("awards_categories")
    .update({ title: patch.title, description: patch.description, image_url: patch.imageUrl })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteCategory(id: string): Promise<Result> {
  const { error } = await supabase.from("awards_categories").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function updateNominee(
  id: string,
  patch: { label: string | null; imageUrl: string | null },
): Promise<Result> {
  const { error } = await supabase
    .from("awards_nominees")
    .update({ label: patch.label, image_url: patch.imageUrl })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteNominee(id: string): Promise<Result> {
  const { error } = await supabase.from("awards_nominees").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Aprovação e papel (RPC) ────────────────────────────────────────────────

export async function setCategoryApproval(categoryId: string, approved: boolean): Promise<Result> {
  const { error } = await supabase.rpc("set_award_category_approval", {
    p_category_id: categoryId,
    p_approved: approved,
  });
  return { error: error?.message ?? null };
}

/** Sou admin deste awards? (admin do app ou da lista da edição). Em erro, não. */
export async function fetchIsAwardsAdmin(slug: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_awards_admin", { p_slug: slug });
    return !error && data === true;
  } catch {
    return false;
  }
}

// ─── Votação (RPC) ──────────────────────────────────────────────────────────

export async function castVote(categoryId: string, nomineeId: string): Promise<Result> {
  const { error } = await supabase.rpc("cast_award_vote", { p_category_id: categoryId, p_nominee_id: nomineeId });
  return { error: error?.message ?? null };
}

export async function fetchMyVotes(slug: string): Promise<MyVotes> {
  try {
    const { data, error } = await supabase.rpc("my_award_votes", { p_edition: slug });
    if (error || !Array.isArray(data)) return {};
    return Object.fromEntries((data as Row[]).map((r) => [r.category_id as string, r.nominee_id as string]));
  } catch {
    return {};
  }
}

export async function fetchResults(slug: string): Promise<{ data: AwardsResults; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("award_results", { p_edition: slug });
    if (error) return { data: {}, error: error.message };
    const out: AwardsResults = {};
    for (const r of (Array.isArray(data) ? data : []) as Row[]) {
      (out[r.category_id as string] ??= []).push({ nomineeId: r.nominee_id as string, votes: Number(r.votes) || 0 });
    }
    for (const list of Object.values(out)) list.sort((a, b) => b.votes - a.votes);
    return { data: out, error: null };
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : "Erro ao carregar." };
  }
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export async function saveEdition(e: AwardsEdition): Promise<Result> {
  const { error } = await supabase
    .from("awards_editions")
    .upsert(
      { slug: e.slug, title: e.title, subtitle: e.subtitle, phase: e.phase, audience: e.audience },
      { onConflict: "slug" },
    );
  return { error: error?.message ?? null };
}

export async function setPhase(slug: string, phase: AwardsPhase): Promise<Result> {
  const { error } = await supabase.from("awards_editions").update({ phase }).eq("slug", slug);
  return { error: error?.message ?? null };
}

export async function setAudience(slug: string, audience: AwardsAudience): Promise<Result> {
  const { error } = await supabase.from("awards_editions").update({ audience }).eq("slug", slug);
  return { error: error?.message ?? null };
}

/** Usuários do app (perfis), para o admin escolher quem pode ver. */
export async function fetchAppUsers(): Promise<AwardsUser[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .order("display_name", { ascending: true });
    if (error || !data) return [];
    return (data as Row[]).map((r) => ({
      id: r.id as string,
      displayName: ((r.display_name as string) ?? "").trim() || "Sem nome",
      avatarUrl: (r.avatar_url as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Listas de pessoas por edição: quem vê (`audience = 'selected'`) e quem administra o awards. */
export type AwardsPeopleList = "awards_viewers" | "awards_admins";

/** Ids das pessoas da lista. Só admins leem a lista toda (RLS). */
export async function fetchPeople(table: AwardsPeopleList, slug: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.from(table).select("user_id").eq("slug", slug);
    if (error || !data) return [];
    return (data as Row[]).map((r) => r.user_id as string);
  } catch {
    return [];
  }
}

/** Grava a lista (só aplica a diferença; falha de leitura não apaga nada). */
export async function savePeople(table: AwardsPeopleList, slug: string, userIds: string[]): Promise<Result> {
  try {
    const { data, error } = await supabase.from(table).select("user_id").eq("slug", slug);
    if (error) return { error: error.message };
    const current = new Set(((data ?? []) as Row[]).map((r) => r.user_id as string));
    const wanted = new Set(userIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));
    if (removed.length) {
      const { error: e } = await supabase.from(table).delete().eq("slug", slug).in("user_id", removed);
      if (e) return { error: e.message };
    }
    if (added.length) {
      const { error: e } = await supabase
        .from(table)
        .upsert(added.map((user_id) => ({ slug, user_id })), { onConflict: "slug,user_id" });
      if (e) return { error: e.message };
    }
    return { error: null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteEdition(slug: string): Promise<Result> {
  const { error } = await supabase.from("awards_editions").delete().eq("slug", slug);
  return { error: error?.message ?? null };
}

export async function reorderCategories(orderedIds: string[]): Promise<Result> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("awards_categories").update({ position: i }).eq("id", orderedIds[i]);
    if (error) return { error: error.message };
  }
  return { error: null };
}

// ─── Imagens ────────────────────────────────────────────────────────────────

const BUCKET = "awards";

/** Envia a imagem (já comprimida) para `awards/<uid>/<arquivo>` e devolve a URL pública. */
export async function uploadAwardImage(userId: string, blob: Blob): Promise<{ url: string | null; error: string | null }> {
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) return { url: null, error: error.message };
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, error: null };
}

// ─── Realtime ───────────────────────────────────────────────────────────────

export function subscribeAwards(onRefresh: () => void) {
  return supabase
    .channel("awards_content")
    .on("postgres_changes", { event: "*", schema: "public", table: "awards_categories" }, onRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "awards_nominees" }, onRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "awards_editions" }, onRefresh)
    .subscribe();
}
