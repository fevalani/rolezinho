import { supabase } from "@/lib/supabase";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type DuelStatus = "open" | "closed" | "resolved";
export type BetSide = "A" | "B" | "C";

export interface ArenaWallet {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface ArenaDuel {
  id: string;
  created_by: string;
  scenario: string;
  option_a: string;
  option_b: string;
  option_c: string;
  category: string;
  creator_context: string | null;
  odds_a: number;
  odds_b: number;
  odds_c: number;
  odds_justification: string | null;
  status: DuelStatus;
  result: BetSide | null;
  verdict: string | null;
  created_at: string;
  updated_at: string;
  creator_profile?: { display_name: string; avatar_url: string | null };
  bet_count?: number;
  my_bet?: ArenaBet | null;
}

export interface ArenaBet {
  id: string;
  duel_id: string;
  user_id: string;
  side: BetSide;
  amount: number;
  potential_payout: number | null;
  actual_payout: number | null;
  payout_claimed: boolean;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

// ══════════════════════════════════════════════════════════════
// Gemini AI
// ══════════════════════════════════════════════════════════════

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY as string;
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

async function callGemini(prompt: string): Promise<string> {
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (res.status === 429) {
      lastError = model;
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  throw new Error(`Todos os modelos estão com cota esgotada (último: ${lastError}). Tente novamente em alguns minutos.`);
}

export interface OddsResult {
  odds_a: number;
  odds_b: number;
  odds_c: number;
  justification: string;
}

export async function generateOdds(
  scenario: string,
  optionA: string,
  optionB: string,
  optionC: string,
  creatorContext: string,
): Promise<OddsResult> {
  const prompt = `Você é um especialista em análise probabilística e apostas.
Analise o seguinte caso: "${scenario}"

As possíveis ocorrências são:
A: "${optionA}"
B: "${optionB}"
C: "${optionC}"
${creatorContext ? `\nContexto adicional: "${creatorContext}"` : ""}

Gere odds no formato decimal europeu (ex: 1.80, 3.50, 2.10). Menor odd = mais provável.
Considere a probabilidade de cada ocorrência com base no contexto fornecido.

Responda APENAS com JSON válido:
{
  "odds_a": number,
  "odds_b": number,
  "odds_c": number,
  "justification": "string em português explicando o raciocínio das odds em 2-3 frases"
}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(raw) as OddsResult;
    return {
      odds_a: Math.max(1.01, Number(parsed.odds_a) || 2.0),
      odds_b: Math.max(1.01, Number(parsed.odds_b) || 2.0),
      odds_c: Math.max(1.01, Number(parsed.odds_c) || 3.0),
      justification: parsed.justification ?? "",
    };
  } catch {
    return { odds_a: 2.0, odds_b: 2.0, odds_c: 3.0, justification: "" };
  }
}

// ══════════════════════════════════════════════════════════════
// Wallet
// ══════════════════════════════════════════════════════════════

export async function ensureWallet(userId: string): Promise<ArenaWallet> {
  await supabase
    .from("arena_wallets")
    .insert({ user_id: userId, balance: 1000 })
    .select()
    .maybeSingle();

  const { data } = await supabase
    .from("arena_wallets")
    .select()
    .eq("user_id", userId)
    .single();

  return (data as ArenaWallet) ?? {
    user_id: userId,
    balance: 1000,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchWallet(userId: string): Promise<ArenaWallet | null> {
  const { data } = await supabase
    .from("arena_wallets")
    .select()
    .eq("user_id", userId)
    .maybeSingle();
  return data as ArenaWallet | null;
}

// ══════════════════════════════════════════════════════════════
// Duels
// ══════════════════════════════════════════════════════════════

function mapDuelRow(d: Record<string, unknown>): ArenaDuel {
  return {
    id: d.id as string,
    created_by: d.created_by as string,
    scenario: d.scenario as string,
    option_a: d.option_a as string,
    option_b: d.option_b as string,
    option_c: d.option_c as string,
    category: d.category as string,
    creator_context: d.creator_context as string | null,
    odds_a: Number(d.odds_a),
    odds_b: Number(d.odds_b),
    odds_c: Number(d.odds_c),
    odds_justification: d.odds_justification as string | null,
    status: d.status as DuelStatus,
    result: d.result as BetSide | null,
    verdict: d.verdict as string | null,
    created_at: d.created_at as string,
    updated_at: d.updated_at as string,
    creator_profile: d.profiles as ArenaDuel["creator_profile"],
  };
}

export async function fetchDuels(userId: string): Promise<ArenaDuel[]> {
  const [duelsRes, myBetsRes] = await Promise.all([
    supabase
      .from("arena_duels")
      .select("*, profiles(display_name, avatar_url), arena_bets(id)")
      .order("created_at", { ascending: false }),
    supabase.from("arena_bets").select("*").eq("user_id", userId),
  ]);

  const duels = (duelsRes.data ?? []) as Record<string, unknown>[];
  const myBets = (myBetsRes.data ?? []) as ArenaBet[];
  const myBetMap = new Map(myBets.map((b) => [b.duel_id, b]));

  return duels.map((d) => ({
    ...mapDuelRow(d),
    bet_count: ((d.arena_bets as unknown[]) ?? []).length,
    my_bet: myBetMap.get(d.id as string) ?? null,
  }));
}

export async function fetchDuelById(
  id: string,
  userId: string,
): Promise<ArenaDuel | null> {
  const [duelRes, myBetRes] = await Promise.all([
    supabase
      .from("arena_duels")
      .select("*, profiles(display_name, avatar_url)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("arena_bets")
      .select("*")
      .eq("duel_id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!duelRes.data) return null;
  return {
    ...mapDuelRow(duelRes.data as Record<string, unknown>),
    my_bet: (myBetRes.data as ArenaBet | null) ?? null,
  };
}

export async function createDuel(
  userId: string,
  scenario: string,
  optionA: string,
  optionB: string,
  optionC: string,
  category: string,
  creatorContext: string,
  odds: OddsResult,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("arena_duels")
    .insert({
      created_by: userId,
      scenario,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      category,
      creator_context: creatorContext || null,
      odds_a: odds.odds_a,
      odds_b: odds.odds_b,
      odds_c: odds.odds_c,
      odds_justification: odds.justification || null,
      status: "open",
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: (data as { id: string }).id, error: null };
}

export async function closeDuel(duelId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("arena_duels")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", duelId);
  return { error: error?.message ?? null };
}

export async function resolveDuel(
  duelId: string,
  result: BetSide,
  verdict: string,
  odds: Pick<ArenaDuel, "odds_a" | "odds_b" | "odds_c">,
): Promise<{ error: string | null }> {
  const { error: duelError } = await supabase
    .from("arena_duels")
    .update({ status: "resolved", result, verdict, updated_at: new Date().toISOString() })
    .eq("id", duelId);

  if (duelError) return { error: duelError.message };

  const { data: bets } = await supabase
    .from("arena_bets")
    .select("id, side, amount")
    .eq("duel_id", duelId);

  if (!bets?.length) return { error: null };

  const sideOdds: Record<BetSide, number> = {
    A: odds.odds_a,
    B: odds.odds_b,
    C: odds.odds_c,
  };

  for (const bet of bets as { id: string; side: string; amount: number }[]) {
    const isWinner = bet.side === result;
    const actualPayout = isWinner
      ? Math.floor(bet.amount * sideOdds[bet.side as BetSide])
      : 0;
    await supabase
      .from("arena_bets")
      .update({ actual_payout: actualPayout })
      .eq("id", bet.id);
  }

  return { error: null };
}

// ══════════════════════════════════════════════════════════════
// Bets
// ══════════════════════════════════════════════════════════════

export async function fetchBetsForDuel(duelId: string): Promise<ArenaBet[]> {
  const { data } = await supabase
    .from("arena_bets")
    .select("*, profiles(display_name, avatar_url)")
    .eq("duel_id", duelId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
    id: b.id as string,
    duel_id: b.duel_id as string,
    user_id: b.user_id as string,
    side: b.side as BetSide,
    amount: b.amount as number,
    potential_payout: b.potential_payout as number | null,
    actual_payout: b.actual_payout as number | null,
    payout_claimed: b.payout_claimed as boolean,
    created_at: b.created_at as string,
    profile: b.profiles as ArenaBet["profile"],
  }));
}

export async function placeBet(
  userId: string,
  duelId: string,
  side: BetSide,
  amount: number,
  potentialPayout: number,
): Promise<{ error: string | null }> {
  const { error: betError } = await supabase.from("arena_bets").insert({
    duel_id: duelId,
    user_id: userId,
    side,
    amount,
    potential_payout: potentialPayout,
  });

  if (betError) {
    if (betError.code === "23505") return { error: "Você já apostou neste caso" };
    return { error: betError.message };
  }

  const { data: wallet } = await supabase
    .from("arena_wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  const { error: walletError } = await supabase
    .from("arena_wallets")
    .update({
      balance: ((wallet as { balance: number } | null)?.balance ?? 0) - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { error: walletError?.message ?? null };
}

export async function deleteBet(
  userId: string,
  betId: string,
  amount: number,
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from("arena_bets")
    .delete()
    .eq("id", betId)
    .eq("user_id", userId);

  if (deleteError) return { error: deleteError.message };

  const { data: wallet } = await supabase
    .from("arena_wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  const { error: walletError } = await supabase
    .from("arena_wallets")
    .update({
      balance: ((wallet as { balance: number } | null)?.balance ?? 0) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { error: walletError?.message ?? null };
}

export async function claimPayout(
  userId: string,
  betId: string,
  payout: number,
): Promise<{ error: string | null }> {
  const { error: claimError } = await supabase
    .from("arena_bets")
    .update({ payout_claimed: true })
    .eq("id", betId)
    .eq("user_id", userId)
    .eq("payout_claimed", false);

  if (claimError) return { error: claimError.message };

  const { data: wallet } = await supabase
    .from("arena_wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  const { error: walletError } = await supabase
    .from("arena_wallets")
    .update({
      balance: ((wallet as { balance: number } | null)?.balance ?? 0) + payout,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { error: walletError?.message ?? null };
}

// ══════════════════════════════════════════════════════════════
// Realtime
// ══════════════════════════════════════════════════════════════

export function subscribeArena(onRefresh: () => void) {
  return supabase
    .channel("arena_feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "arena_duels" },
      onRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "arena_bets" },
      onRefresh,
    )
    .subscribe();
}
