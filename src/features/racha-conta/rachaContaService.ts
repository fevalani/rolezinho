import { supabase } from "@/lib/supabase";
import type {
  Group,
  GroupMember,
  Expense,
  Payment,
  SplitsMap,
  SplitType,
  ExpenseCategory,
} from "@/lib/types";
import { getInitials } from "@/lib/utils";

// ─── Helpers de mapeamento ────────────────────────────────────────────────────

/** Converte o path do storage (ex: "uuid/avatar.webp") para URL pública.
 *  Se já for uma URL http completa, devolve como está. Se null, devolve null. */
function toPublicAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl ?? null;
}

function mapMember(
  row: Record<string, unknown>,
  myProfileId: string,
): GroupMember {
  const profile = row.profiles as Record<string, unknown> | null;
  const isAppUser = row.profile_id !== null;
  const displayName = isAppUser
    ? ((profile?.display_name as string) ?? "Usuário")
    : (row.external_name as string);

  return {
    id: row.id as string,
    display_name: displayName,
    avatar_letter: getInitials(displayName),
    avatar_url: isAppUser
      ? toPublicAvatarUrl(profile?.avatar_url as string | null)
      : null,
    is_app_user: isAppUser,
    is_me: isAppUser && (row.profile_id as string) === myProfileId,
  };
}

function mapExpense(
  row: Record<string, unknown>,
  participantIds: string[],
): Expense {
  return {
    id: row.id as string,
    group_id: row.group_id as string,
    name: row.name as string,
    amount: Number(row.amount),
    paid_by: row.paid_by_member as string,
    split_type: row.split_type as SplitType,
    participant_ids: participantIds,
    splits: (row.splits as SplitsMap) ?? {},
    category: row.category as ExpenseCategory,
    date: row.date as string,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
  };
}

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    group_id: row.group_id as string,
    from_member_id: row.from_member_id as string,
    to_member_id: row.to_member_id as string,
    amount: Number(row.amount),
    date: row.date as string,
    settled: true,
    created_at: row.created_at as string,
  };
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

/** Busca todos os grupos em que o usuário é membro, com tudo aninhado. */
export async function fetchGroups(myProfileId: string): Promise<Group[]> {
  // 1. IDs dos grupos em que sou membro
  const { data: memberRows, error: memberErr } = await supabase
    .from("split_group_members")
    .select("group_id")
    .eq("profile_id", myProfileId);

  if (memberErr || !memberRows?.length) return [];

  const groupIds = memberRows.map((r) => r.group_id as string);

  // 2. Grupos
  const { data: groupRows, error: groupErr } = await supabase
    .from("split_groups")
    .select("id, name, emoji, created_by, created_at")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  if (groupErr || !groupRows?.length) return [];

  // 3. Membros (com join no profile para pegar display_name e avatar)
  const { data: allMemberRows } = await supabase
    .from("split_group_members")
    .select(
      "id, group_id, profile_id, external_name, profiles:profile_id(id, display_name, avatar_url)",
    )
    .in("group_id", groupIds);

  // 4. Gastos
  const { data: expenseRows } = await supabase
    .from("split_expenses")
    .select(
      "id, group_id, name, amount, paid_by_member, split_type, splits, category, date, created_by, created_at",
    )
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });

  // 5. Participantes dos gastos
  const expenseIds = (expenseRows ?? []).map((e) => e.id as string);
  const { data: participantRows } = expenseIds.length
    ? await supabase
        .from("split_expense_participants")
        .select("expense_id, member_id")
        .in("expense_id", expenseIds)
    : { data: [] };

  // 6. Pagamentos
  const { data: paymentRows } = await supabase
    .from("split_payments")
    .select(
      "id, group_id, from_member_id, to_member_id, amount, date, created_at",
    )
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });

  // Monta participantIds por expense
  const participantsByExpense: Record<string, string[]> = {};
  (participantRows ?? []).forEach((p) => {
    const eid = p.expense_id as string;
    const mid = p.member_id as string;
    if (!participantsByExpense[eid]) participantsByExpense[eid] = [];
    participantsByExpense[eid].push(mid);
  });

  // Agrupa por group
  const membersByGroup: Record<string, GroupMember[]> = {};
  const expensesByGroup: Record<string, Expense[]> = {};
  const paymentsByGroup: Record<string, Payment[]> = {};

  (allMemberRows ?? []).forEach((row) => {
    const gid = row.group_id as string;
    if (!membersByGroup[gid]) membersByGroup[gid] = [];
    membersByGroup[gid].push(
      mapMember(row as Record<string, unknown>, myProfileId),
    );
  });

  (expenseRows ?? []).forEach((row) => {
    const gid = row.group_id as string;
    if (!expensesByGroup[gid]) expensesByGroup[gid] = [];
    expensesByGroup[gid].push(
      mapExpense(
        row as Record<string, unknown>,
        participantsByExpense[row.id as string] ?? [],
      ),
    );
  });

  (paymentRows ?? []).forEach((row) => {
    const gid = row.group_id as string;
    if (!paymentsByGroup[gid]) paymentsByGroup[gid] = [];
    paymentsByGroup[gid].push(mapPayment(row as Record<string, unknown>));
  });

  return groupRows.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    emoji: g.emoji as string,
    created_by: g.created_by as string,
    created_at: g.created_at as string,
    members: membersByGroup[g.id as string] ?? [],
    expenses: expensesByGroup[g.id as string] ?? [],
    payments: paymentsByGroup[g.id as string] ?? [],
  }));
}

/** Busca todos os profiles para listagem na criação de grupo. */
export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .order("display_name", { ascending: true });

  if (error) {
    console.error("fetchAllProfiles error:", error);
    return [];
  }
  return data ?? [];
}

// ─── Criação / Edição de Grupo ────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  emoji: string;
  myProfileId: string;
  appMemberProfileIds: string[];
  externalMemberNames: string[];
}

export async function createGroup(
  input: CreateGroupInput,
): Promise<string | null> {
  const { name, emoji, myProfileId, appMemberProfileIds, externalMemberNames } =
    input;

  // Usa função SECURITY DEFINER para criar grupo + membros atomicamente,
  // evitando o problema de RLS circular (is_group_member() falha antes do
  // criador ser inserido na tabela split_group_members).
  const allAppIds = Array.from(new Set([myProfileId, ...appMemberProfileIds]));

  const { data: groupId, error } = await supabase.rpc("create_split_group", {
    p_name: name,
    p_emoji: emoji,
    p_app_ids: allAppIds,
    p_ext_names: externalMemberNames,
  });

  if (error || !groupId) {
    console.error("createGroup rpc error:", error);
    return null;
  }

  return groupId as string;
}

export interface UpdateGroupInput {
  groupId: string;
  name?: string;
  emoji?: string;
  addAppMemberProfileIds?: string[];
  removeMemberIds?: string[];
  addExternalNames?: string[];
}

export async function updateGroup(
  input: UpdateGroupInput,
  myProfileId: string,
): Promise<boolean> {
  const {
    groupId,
    name,
    emoji,
    addAppMemberProfileIds = [],
    removeMemberIds = [],
    addExternalNames = [],
  } = input;

  if (name !== undefined || emoji !== undefined) {
    const { error } = await supabase
      .from("split_groups")
      .update({
        ...(name !== undefined && { name }),
        ...(emoji !== undefined && { emoji }),
      })
      .eq("id", groupId)
      .eq("created_by", myProfileId);

    if (error) {
      console.error("updateGroup error:", error);
      return false;
    }
  }

  if (addAppMemberProfileIds.length) {
    const rows = addAppMemberProfileIds.map((pid) => ({
      group_id: groupId,
      profile_id: pid,
      external_name: null as string | null,
      avatar_letter: "?",
    }));
    await supabase.from("split_group_members").upsert(rows, {
      onConflict: "group_id,profile_id",
      ignoreDuplicates: true,
    });
  }

  if (removeMemberIds.length) {
    await supabase
      .from("split_group_members")
      .delete()
      .in("id", removeMemberIds)
      .eq("group_id", groupId);
  }

  if (addExternalNames.length) {
    const rows = addExternalNames.map((extName) => ({
      group_id: groupId,
      profile_id: null as string | null,
      external_name: extName,
      avatar_letter: getInitials(extName),
    }));
    await supabase.from("split_group_members").insert(rows);
  }

  return true;
}

// ─── Gastos ───────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  groupId: string;
  name: string;
  amount: number;
  paidByMemberId: string;
  splitType: SplitType;
  participantMemberIds: string[];
  splits: SplitsMap;
  category: ExpenseCategory;
  date: string;
  myProfileId: string;
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<Expense | null> {
  const {
    groupId,
    name,
    amount,
    paidByMemberId,
    splitType,
    participantMemberIds,
    splits,
    category,
    date,
    myProfileId,
  } = input;

  const { data: expRow, error: expErr } = await supabase
    .from("split_expenses")
    .insert({
      group_id: groupId,
      name,
      amount,
      paid_by_member: paidByMemberId,
      split_type: splitType,
      splits,
      category,
      date,
      created_by: myProfileId,
    })
    .select(
      "id, group_id, name, amount, paid_by_member, split_type, splits, category, date, created_by, created_at",
    )
    .single();

  if (expErr || !expRow) {
    console.error("createExpense error:", expErr);
    return null;
  }

  const expenseId = expRow.id as string;

  const { error: partErr } = await supabase
    .from("split_expense_participants")
    .insert(
      participantMemberIds.map((mid) => ({
        expense_id: expenseId,
        member_id: mid,
      })),
    );

  if (partErr) {
    console.error("createExpense participants error:", partErr);
    return null;
  }

  return mapExpense(expRow as Record<string, unknown>, participantMemberIds);
}

export interface UpdateExpenseInput extends Omit<
  CreateExpenseInput,
  "myProfileId"
> {
  expenseId: string;
  myProfileId: string;
}

export async function updateExpense(
  input: UpdateExpenseInput,
): Promise<Expense | null> {
  const {
    expenseId,
    name,
    amount,
    paidByMemberId,
    splitType,
    participantMemberIds,
    splits,
    category,
    date,
    myProfileId,
  } = input;

  const { data: expRow, error: expErr } = await supabase
    .from("split_expenses")
    .update({
      name,
      amount,
      paid_by_member: paidByMemberId,
      split_type: splitType,
      splits,
      category,
      date,
    })
    .eq("id", expenseId)
    .eq("created_by", myProfileId)
    .select(
      "id, group_id, name, amount, paid_by_member, split_type, splits, category, date, created_by, created_at",
    )
    .single();

  if (expErr || !expRow) {
    console.error("updateExpense error:", expErr);
    return null;
  }

  await supabase
    .from("split_expense_participants")
    .delete()
    .eq("expense_id", expenseId);

  await supabase
    .from("split_expense_participants")
    .insert(
      participantMemberIds.map((mid) => ({
        expense_id: expenseId,
        member_id: mid,
      })),
    );

  return mapExpense(expRow as Record<string, unknown>, participantMemberIds);
}

export async function deleteExpense(
  expenseId: string,
  myProfileId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("split_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("created_by", myProfileId);

  if (error) {
    console.error("deleteExpense error:", error);
    return false;
  }
  return true;
}

// ─── Pagamentos ───────────────────────────────────────────────────────────────

export interface CreatePaymentInput {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  myProfileId: string;
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<Payment | null> {
  const { groupId, fromMemberId, toMemberId, amount, myProfileId } = input;

  const { data: payRow, error } = await supabase
    .from("split_payments")
    .insert({
      group_id: groupId,
      from_member_id: fromMemberId,
      to_member_id: toMemberId,
      amount,
      date: new Date().toISOString().split("T")[0],
      created_by: myProfileId,
    })
    .select(
      "id, group_id, from_member_id, to_member_id, amount, date, created_at",
    )
    .single();

  if (error || !payRow) {
    console.error("createPayment error:", error);
    return null;
  }

  return mapPayment(payRow as Record<string, unknown>);
}
