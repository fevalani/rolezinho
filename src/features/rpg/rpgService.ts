/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/lib/supabase";
import type {
  RpgTable,
  RpgTableMember,
  RpgSheet,
  RpgFeedPost,
  RpgTableRoll,
  RpgLibraryEntry,
  RpgSheetTableLink,
} from "./rpgTypes";

// ═══════════════════════════════════════════
// MESAS
// ═══════════════════════════════════════════

export async function fetchMyTables(userId: string): Promise<RpgTable[]> {
  const { data: memberRows } = await supabase
    .from("rpg_table_members")
    .select("table_id")
    .eq("user_id", userId);

  const memberTableIds = (memberRows ?? []).map((r) => r.table_id);

  // busca mesas onde sou mestre
  const { data: masterTables, error: e1 } = await supabase
    .from("rpg_tables")
    .select("*")
    .eq("master_id", userId);

  if (e1) console.error("[fetchMyTables] masterTables error:", e1);

  // busca mesas onde sou membro mas não mestre
  const { data: memberTables, error: e2 } = memberTableIds.length
    ? await supabase
        .from("rpg_tables")
        .select("*")
        .in("id", memberTableIds)
        .neq("master_id", userId)
    : { data: [], error: null };

  if (e2) console.error("[fetchMyTables] memberTables error:", e2);

  const all = [...(masterTables ?? []), ...(memberTables ?? [])];
  const unique = Array.from(new Map(all.map((t) => [t.id, t])).values());
  return unique.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  ) as RpgTable[];
}

export async function fetchTableById(
  tableId: string,
): Promise<RpgTable | null> {
  const { data, error } = await supabase
    .from("rpg_tables")
    .select("*")
    .eq("id", tableId)
    .single();
  if (error) console.error("[fetchTableById] error:", error);
  return data as RpgTable | null;
}

export async function createTable(
  name: string,
  description: string,
  masterId: string,
): Promise<{
  id: any;
  data: RpgTable | null;
  error: string | null;
}> {
  const { data: tableData, error: tableError } = await supabase
    .from("rpg_tables")
    .insert({ name, description, master_id: masterId })
    .select()
    .single();

  if (tableError || !tableData) {
    console.error("[createTable] error:", tableError);
    return {
      data: null,
      error: tableError?.message ?? "Erro desconhecido",
      id: null,
    };
  }

  // mestre também entra como membro
  const { error: memberError } = await supabase
    .from("rpg_table_members")
    .insert({
      table_id: tableData.id,
      user_id: masterId,
    });

  if (memberError) {
    console.error("[createTable] member insert error:", memberError);
  }

  return { id: tableData.id, data: tableData as RpgTable, error: null };
}

export async function updateTable(
  tableId: string,
  updates: Partial<Pick<RpgTable, "name" | "description" | "image_url">>,
): Promise<void> {
  await supabase
    .from("rpg_tables")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", tableId);
}

export async function deleteTable(tableId: string): Promise<void> {
  await supabase.from("rpg_tables").delete().eq("id", tableId);
}

export async function joinTableByCode(
  inviteCode: string,
  userId: string,
): Promise<{ table: RpgTable | null; error: string | null }> {
  const { data: table } = await supabase
    .from("rpg_tables")
    .select("*")
    .eq("invite_code", inviteCode.toUpperCase().trim())
    .single();

  if (!table) return { table: null, error: "Código de convite inválido." };

  const { error } = await supabase.from("rpg_table_members").insert({
    table_id: table.id,
    user_id: userId,
  });

  if (error?.code === "23505")
    return { table: table as RpgTable, error: "Você já está nessa Mesa!" };

  return { table: table as RpgTable, error: null };
}

export async function leaveTable(
  tableId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("rpg_table_members")
    .delete()
    .eq("table_id", tableId)
    .eq("user_id", userId);
}

export async function transferMastery(
  tableId: string,
  newMasterId: string,
): Promise<void> {
  await supabase
    .from("rpg_tables")
    .update({ master_id: newMasterId, updated_at: new Date().toISOString() })
    .eq("id", tableId);
}

// ═══════════════════════════════════════════
// MEMBROS
// ═══════════════════════════════════════════

export async function fetchTableMembers(
  tableId: string,
): Promise<RpgTableMember[]> {
  const { data, error } = await supabase
    .from("rpg_table_members")
    .select("*")
    .eq("table_id", tableId)
    .order("joined_at");

  if (error) console.error("[fetchTableMembers] error:", error);
  if (!data?.length) return [];

  // enrich with profiles separately to avoid FK name issues
  const userIds = data.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return data.map((m) => ({
    ...m,
    profile: profileMap.get(m.user_id),
  })) as RpgTableMember[];
}

// ═══════════════════════════════════════════
// SESSÃO
// ═══════════════════════════════════════════

export async function startSession(tableId: string): Promise<void> {
  await supabase
    .from("rpg_tables")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", tableId);

  await supabase.from("rpg_sessions").insert({ table_id: tableId });
}

export async function pauseSession(tableId: string): Promise<void> {
  await supabase
    .from("rpg_tables")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", tableId);

  // fecha sessão aberta
  const { data: openSession } = await supabase
    .from("rpg_sessions")
    .select("*")
    .eq("table_id", tableId)
    .is("ended_at", null)
    .single();

  if (openSession) {
    const minutes = Math.round(
      (Date.now() - new Date(openSession.started_at).getTime()) / 60000,
    );
    await supabase
      .from("rpg_sessions")
      .update({ ended_at: new Date().toISOString(), duration_minutes: minutes })
      .eq("id", openSession.id);

    // incrementa sessão dos membros
    await supabase
      .rpc("increment_member_stats", {
        p_table_id: tableId,
        p_minutes: minutes,
      })
      .maybeSingle();

    // session_count incremented via trigger or manually
    await supabase
      .rpc("increment_table_session_count", { p_table_id: tableId })
      .maybeSingle();
  }
}

export async function applyRest(
  tableId: string,
  restType: "short" | "long",
): Promise<void> {
  // Busca fichas vinculadas a esta mesa
  const { data: links } = await supabase
    .from("rpg_sheet_table_link")
    .select("sheet_id")
    .eq("table_id", tableId);

  if (!links?.length) return;

  const sheetIds = links.map((l) => l.sheet_id);

  if (restType === "short") {
    // Descanso curto: recupera hit dice (simplificado: recupera 1 hit die de HP)
    const { data: sheets } = await supabase
      .from("rpg_sheets")
      .select("id, current_hp, max_hp, hit_dice_used, constitution")
      .in("id", sheetIds);

    for (const sheet of sheets ?? []) {
      const conMod = Math.floor((sheet.constitution - 10) / 2);
      const recovered = Math.max(1 + conMod, 1);
      await supabase
        .from("rpg_sheets")
        .update({
          current_hp: Math.min(sheet.current_hp + recovered, sheet.max_hp),
          hit_dice_used: Math.max(sheet.hit_dice_used - 1, 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sheet.id);
    }
  } else {
    // Descanso longo: recupera toda HP, metade dos hit dice, slots de magia
    const { data: sheets } = await supabase
      .from("rpg_sheets")
      .select("id, max_hp, level, hit_dice_used, spell_slots")
      .in("id", sheetIds);

    for (const sheet of sheets ?? []) {
      const hdRecovered = Math.max(Math.floor(sheet.level / 2), 1);
      // Reseta spell slots
      const resetSlots: Record<string, { max: number; used: number }> = {};
      for (const [key, val] of Object.entries(
        sheet.spell_slots as Record<string, { max: number; used: number }>,
      )) {
        resetSlots[key] = { max: val.max, used: 0 };
      }
      await supabase
        .from("rpg_sheets")
        .update({
          current_hp: sheet.max_hp,
          hit_dice_used: Math.max(sheet.hit_dice_used - hdRecovered, 0),
          spell_slots: resetSlots,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sheet.id);
    }
  }
}

// ═══════════════════════════════════════════
// FEED
// ═══════════════════════════════════════════

export async function fetchFeedPosts(tableId: string): Promise<RpgFeedPost[]> {
  const { data, error } = await supabase
    .from("rpg_feed_posts")
    .select("*")
    .eq("table_id", tableId)
    .order("created_at", { ascending: true });

  if (error) console.error("[fetchFeedPosts] error:", error);
  if (!data?.length) return [];

  const authorIds = [...new Set(data.map((p) => p.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", authorIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return data.map((p) => ({
    ...p,
    author: profileMap.get(p.author_id),
  })) as RpgFeedPost[];
}

export async function createFeedPost(
  tableId: string,
  authorId: string,
  content: string,
  imageUrl?: string,
  videoUrl?: string,
): Promise<RpgFeedPost | null> {
  const postType = videoUrl ? "video" : imageUrl ? "image" : "text";
  const { data, error } = await supabase
    .from("rpg_feed_posts")
    .insert({
      table_id: tableId,
      author_id: authorId,
      content,
      image_url: imageUrl ?? null,
      video_url: videoUrl ?? null,
      post_type: postType,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createFeedPost] error:", error);
    return null;
  }

  // enrich author
  const { data: author } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authorId)
    .single();

  return { ...data, author } as RpgFeedPost;
}

export async function updateFeedPost(
  postId: string,
  content: string,
  imageUrl?: string | null,
): Promise<void> {
  await supabase
    .from("rpg_feed_posts")
    .update({
      content,
      image_url: imageUrl ?? null,
      post_type: imageUrl ? "image" : "text",
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
}

export async function deleteFeedPost(postId: string): Promise<void> {
  await supabase.from("rpg_feed_posts").delete().eq("id", postId);
}

export async function uploadFeedImage(
  file: File,
  tableId: string,
): Promise<string | null> {
  const ext = file.name.split(".").pop();
  const path = `rpg-feed/${tableId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("public-assets")
    .upload(path, file, { upsert: false });
  if (error) return null;
  const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
  return data.publicUrl;
}

export function subscribeFeedPosts(
  tableId: string,
  onInsert: (post: RpgFeedPost) => void,
  onDelete: (id: string) => void,
) {
  return supabase
    .channel(`feed:${tableId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "rpg_feed_posts",
        filter: `table_id=eq.${tableId}`,
      },
      async (payload) => {
        const { data: post } = await supabase
          .from("rpg_feed_posts")
          .select("*")
          .eq("id", payload.new.id)
          .single();
        if (!post) return;
        const { data: author } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", post.author_id)
          .single();
        onInsert({ ...post, author } as RpgFeedPost);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "rpg_feed_posts",
        filter: `table_id=eq.${tableId}`,
      },
      (payload) => onDelete(payload.old.id),
    )
    .subscribe();
}

// ═══════════════════════════════════════════
// ROLAGENS NA MESA
// ═══════════════════════════════════════════

export async function rollTableDice(
  tableId: string,
  userId: string,
  diceType: string,
  quantity: number,
  isMaster: boolean,
): Promise<RpgTableRoll | null> {
  const sides = parseInt(diceType.replace("d", ""));
  const results = Array.from(
    { length: quantity },
    () => Math.floor(Math.random() * sides) + 1,
  );
  const total = results.reduce((s, r) => s + r, 0);

  const { data } = await supabase
    .from("rpg_table_rolls")
    .insert({
      table_id: tableId,
      user_id: userId,
      dice_type: diceType,
      results,
      total,
      is_master: isMaster,
    })
    .select()
    .single();
  return data as RpgTableRoll | null;
}

export function subscribeTableRolls(
  tableId: string,
  onNew: (roll: RpgTableRoll) => void,
) {
  return supabase
    .channel(`rolls:${tableId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "rpg_table_rolls",
        filter: `table_id=eq.${tableId}`,
      },
      async (payload) => {
        if (payload.new.is_master) return; // oculta rolagens do mestre
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", payload.new.user_id)
          .single();
        onNew({ ...payload.new, profile: data } as RpgTableRoll);
      },
    )
    .subscribe();
}

// ═══════════════════════════════════════════
// FICHAS
// ═══════════════════════════════════════════

export async function fetchMySheets(userId: string): Promise<RpgSheet[]> {
  const { data } = await supabase
    .from("rpg_sheets")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as RpgSheet[];
}

export async function fetchSheetById(
  sheetId: string,
): Promise<RpgSheet | null> {
  const { data } = await supabase
    .from("rpg_sheets")
    .select("*")
    .eq("id", sheetId)
    .single();
  return data as RpgSheet | null;
}

export async function fetchTableSheets(
  tableId: string,
): Promise<{ sheet: RpgSheet; userId: string }[]> {
  const { data: links } = await supabase
    .from("rpg_sheet_table_link")
    .select("*, sheet:rpg_sheets(*)")
    .eq("table_id", tableId);

  return (links ?? [])
    .filter((l) => l.sheet)
    .map((l) => ({ sheet: l.sheet as RpgSheet, userId: l.user_id }));
}

export async function createSheet(
  userId: string,
  characterName: string,
): Promise<{
  id: any;
  data: RpgSheet | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("rpg_sheets")
    .insert({ user_id: userId, character_name: characterName })
    .select()
    .single();

  if (error) {
    console.error("[createSheet] error:", error);
    return { id: null, data: null, error: error.message };
  }

  return { id: data.id, data: data as RpgSheet, error: null };
}

export async function updateSheet(
  sheetId: string,
  updates: Partial<RpgSheet>,
): Promise<void> {
  await supabase
    .from("rpg_sheets")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", sheetId);
}

export async function deleteSheet(sheetId: string): Promise<void> {
  await supabase.from("rpg_sheets").delete().eq("id", sheetId);
}

export async function linkSheetToTable(
  sheetId: string,
  tableId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("rpg_sheet_table_link").upsert(
    {
      sheet_id: sheetId,
      table_id: tableId,
      user_id: userId,
    },
    { onConflict: "table_id,user_id" },
  );

  if (error) return { error: error.message };
  return { error: null };
}

export async function fetchMyLinkForTable(
  tableId: string,
  userId: string,
): Promise<RpgSheetTableLink | null> {
  const { data } = await supabase
    .from("rpg_sheet_table_link")
    .select("*")
    .eq("table_id", tableId)
    .eq("user_id", userId)
    .single();
  return data as RpgSheetTableLink | null;
}

// ═══════════════════════════════════════════
// BIBLIOTECA
// ═══════════════════════════════════════════

export async function fetchLibrary(
  tableId: string,
): Promise<RpgLibraryEntry[]> {
  const { data } = await supabase
    .from("rpg_library_entries")
    .select("*")
    .eq("table_id", tableId)
    .order("sort_order");
  return (data ?? []) as RpgLibraryEntry[];
}

export async function createLibraryEntry(
  tableId: string,
  title: string,
  content: string,
): Promise<RpgLibraryEntry | null> {
  const { data } = await supabase
    .from("rpg_library_entries")
    .insert({ table_id: tableId, title, content })
    .select()
    .single();
  return data as RpgLibraryEntry | null;
}

export async function updateLibraryEntry(
  entryId: string,
  updates: Partial<Pick<RpgLibraryEntry, "title" | "content" | "sort_order">>,
): Promise<void> {
  await supabase
    .from("rpg_library_entries")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", entryId);
}

export async function deleteLibraryEntry(entryId: string): Promise<void> {
  await supabase.from("rpg_library_entries").delete().eq("id", entryId);
}
