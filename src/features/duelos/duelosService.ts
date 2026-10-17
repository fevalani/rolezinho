import { supabase } from "@/lib/supabase";
import {
  DEFAULT_DUEL_ICON,
  type DuelComparisonRow,
  type DuelItem,
  type DuelMyStatus,
  type DuelParticipant,
  type DuelRanking,
  type DuelRankingDetail,
  type DuelRankingSummary,
} from "./duelosTypes";
import { isFinished, result } from "./pairwiseEngine";

function mapRanking(row: Record<string, unknown>): DuelRanking {
  return {
    id: row.id as string,
    owner_id: row.owner_id as string,
    title: row.title as string,
    icon: (row.icon as string) ?? DEFAULT_DUEL_ICON,
    created_at: row.created_at as string,
  };
}

function groupByUser(
  comps: DuelComparisonRow[],
): Map<string, DuelComparisonRow[]> {
  const byUser = new Map<string, DuelComparisonRow[]>();
  for (const c of comps) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id)!.push(c);
  }
  return byUser;
}

function userState(items: DuelItem[], comps: DuelComparisonRow[]) {
  const ids = items.map((i) => i.id);
  const cmps = comps.map((c) => ({ winner: c.winner_id, loser: c.loser_id }));
  const finished = isFinished(ids, cmps);
  return { finished, order: finished ? result(ids, cmps) : [] };
}

export async function fetchAllDuels(
  currentUserId: string,
): Promise<DuelRankingSummary[]> {
  const { data: rows } = await supabase
    .from("duel_rankings")
    .select("*")
    .order("created_at", { ascending: false });
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.id as string);
  const [{ data: items }, { data: comps }] = await Promise.all([
    supabase
      .from("duel_items")
      .select("*")
      .in("ranking_id", ids)
      .order("position"),
    supabase
      .from("duel_comparisons")
      .select("id, ranking_id, winner_id, loser_id, user_id, created_at")
      .in("ranking_id", ids)
      .order("created_at"),
  ]);

  return rows.map((r) => {
    const rid = r.id as string;
    const rItems = ((items ?? []) as DuelItem[]).filter(
      (i) => i.ranking_id === rid,
    );
    const rComps = (
      (comps ?? []) as (DuelComparisonRow & { ranking_id: string })[]
    ).filter((c) => c.ranking_id === rid);
    const byUser = groupByUser(rComps);
    let finishedCount = 0;
    for (const uc of byUser.values()) {
      if (userState(rItems, uc).finished) finishedCount++;
    }
    const mine = byUser.get(currentUserId);
    const myStatus: DuelMyStatus = !mine
      ? "not_started"
      : userState(rItems, mine).finished
        ? "finished"
        : "in_progress";
    return {
      ranking: mapRanking(r),
      itemCount: rItems.length,
      participantCount: byUser.size,
      finishedCount,
      myStatus,
    };
  });
}

export async function fetchRankingDetail(
  id: string,
): Promise<DuelRankingDetail | null> {
  const [{ data: ranking }, { data: items }, { data: comps }] =
    await Promise.all([
      supabase.from("duel_rankings").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("duel_items")
        .select("*")
        .eq("ranking_id", id)
        .order("position"),
      supabase
        .from("duel_comparisons")
        .select(
          "id, winner_id, loser_id, user_id, created_at, profiles:user_id(display_name, avatar_url)",
        )
        .eq("ranking_id", id)
        .order("created_at"),
    ]);
  if (!ranking) return null;

  const itemList = (items ?? []) as DuelItem[];
  const profiles = new Map<
    string,
    { name: string; avatarUrl: string | null }
  >();
  const rows: DuelComparisonRow[] = (comps ?? []).map((c) => {
    const p = c.profiles as unknown as {
      display_name?: string;
      avatar_url?: string | null;
    } | null;
    profiles.set(c.user_id as string, {
      name: p?.display_name ?? "Alguém",
      avatarUrl: p?.avatar_url ?? null,
    });
    return {
      id: c.id as string,
      winner_id: c.winner_id as string,
      loser_id: c.loser_id as string,
      user_id: c.user_id as string,
      created_at: c.created_at as string,
    };
  });

  const participants: DuelParticipant[] = [...groupByUser(rows)].map(
    ([userId, uc]) => ({
      userId,
      name: profiles.get(userId)?.name ?? "Alguém",
      avatarUrl: profiles.get(userId)?.avatarUrl ?? null,
      comparisons: uc,
      ...userState(itemList, uc),
    }),
  );

  return { ranking: mapRanking(ranking), items: itemList, participants };
}

export async function createRanking(
  ownerId: string,
  title: string,
  icon: string,
  names: string[],
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("duel_rankings")
    .insert({ owner_id: ownerId, title, icon })
    .select("id")
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Erro" };

  const { error: itemsErr } = await supabase
    .from("duel_items")
    .insert(
      names.map((name, position) => ({ ranking_id: data.id, name, position })),
    );
  if (itemsErr) {
    await supabase.from("duel_rankings").delete().eq("id", data.id);
    return { data: null, error: itemsErr.message };
  }
  return { data: data.id as string, error: null };
}

export async function submitWinner(
  rankingId: string,
  userId: string,
  winnerId: string,
  loserId: string,
): Promise<string | null> {
  const { error } = await supabase.from("duel_comparisons").insert({
    ranking_id: rankingId,
    user_id: userId,
    winner_id: winnerId,
    loser_id: loserId,
  });
  return error?.message ?? null;
}

export async function undoComparison(
  comparisonId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("duel_comparisons")
    .delete()
    .eq("id", comparisonId);
  return error?.message ?? null;
}

export async function resetComparisons(
  rankingId: string,
  userId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("duel_comparisons")
    .delete()
    .eq("ranking_id", rankingId)
    .eq("user_id", userId);
  return error?.message ?? null;
}

export async function deleteRanking(rankingId: string): Promise<string | null> {
  const { error } = await supabase
    .from("duel_rankings")
    .delete()
    .eq("id", rankingId);
  return error?.message ?? null;
}
