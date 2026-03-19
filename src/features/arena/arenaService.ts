import { supabase } from "@/lib/supabase";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type DuelStatus = "open" | "closed" | "resolved";
export type BetSide = "A" | "draw" | "B";

export interface ArenaWallet {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface ArenaDuel {
  id: string;
  created_by: string;
  title: string;
  side_a: string;
  side_b: string;
  category: string;
  creator_context: string | null;
  odds_a: number;
  odds_draw: number;
  odds_b: number;
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
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_KEY}`;

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  // Remove markdown code fences caso a API retorne ```json ... ```
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export interface OddsResult {
  odds_a: number;
  odds_draw: number;
  odds_b: number;
  justification: string;
}

export async function generateOdds(
  sideA: string,
  sideB: string,
  category: string,
  creatorContext: string,
): Promise<OddsResult> {
  const prompt = `Você é um especialista em análise probabilística e apostas.
Analise o embate hipotético: "${sideA}" (Lado A) vs "${sideB}" (Lado B) na categoria "${category}".
${creatorContext ? `Contexto adicional: "${creatorContext}"` : ""}

Gere odds no formato decimal europeu (ex: 1.80, 3.50, 2.10). Menor odd = favorito.
Considere histórico, relevância, popularidade e resultados conhecidos.

Responda APENAS com JSON válido:
{
  "odds_a": number,
  "odds_draw": number,
  "odds_b": number,
  "justification": "string em português explicando o raciocínio das odds em 2-3 frases"
}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(raw) as OddsResult;
    return {
      odds_a: Math.max(1.01, Number(parsed.odds_a) || 2.0),
      odds_draw: Math.max(1.01, Number(parsed.odds_draw) || 3.0),
      odds_b: Math.max(1.01, Number(parsed.odds_b) || 2.0),
      justification: parsed.justification ?? "",
    };
  } catch {
    return { odds_a: 2.0, odds_draw: 3.0, odds_b: 2.0, justification: "" };
  }
}

export interface VerdictResult {
  result: BetSide;
  verdict: string;
}

export async function generateVerdict(
  sideA: string,
  sideB: string,
  category: string,
  creatorContext: string,
): Promise<VerdictResult> {
  const prompt = `Você é um juiz especialista, historiador e analista imparcial.
Analise o embate hipotético: "${sideA}" (Lado A) vs "${sideB}" (Lado B) na categoria "${category}".
${creatorContext ? `Intenção e contexto do criador: "${creatorContext}"` : ""}

Pesquise mentalmente o histórico, estatísticas, fatos e argumentos de ambos os lados.
Dê um veredito definitivo e fundamentado.

Responda APENAS com JSON válido:
{
  "result": "A" ou "draw" ou "B",
  "verdict": "narrativa detalhada em português (3-5 parágrafos) com fatos, análise histórica e justificativa clara do resultado"
}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = JSON.parse(raw) as VerdictResult;
    const result = (["A", "draw", "B"].includes(parsed.result) ? parsed.result : "draw") as BetSide;
    return { result, verdict: parsed.verdict ?? "" };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Erro desconhecido ao gerar veredito");
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
    .maybeSingle(); // ignora duplicate key error

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
    title: d.title as string,
    side_a: d.side_a as string,
    side_b: d.side_b as string,
    category: d.category as string,
    creator_context: d.creator_context as string | null,
    odds_a: Number(d.odds_a),
    odds_draw: Number(d.odds_draw),
    odds_b: Number(d.odds_b),
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
  sideA: string,
  sideB: string,
  category: string,
  creatorContext: string,
  odds: OddsResult,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("arena_duels")
    .insert({
      created_by: userId,
      title: `${sideA} vs ${sideB}`,
      side_a: sideA,
      side_b: sideB,
      category,
      creator_context: creatorContext || null,
      odds_a: odds.odds_a,
      odds_draw: odds.odds_draw,
      odds_b: odds.odds_b,
      odds_justification: odds.justification,
      status: "open",
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: (data as { id: string }).id, error: null };
}

export async function closeDuel(
  duelId: string,
): Promise<{ error: string | null }> {
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
  odds: Pick<ArenaDuel, "odds_a" | "odds_draw" | "odds_b">,
): Promise<{ error: string | null }> {
  // 1. Atualiza o duelo
  const { error: duelError } = await supabase
    .from("arena_duels")
    .update({
      status: "resolved",
      result,
      verdict,
      updated_at: new Date().toISOString(),
    })
    .eq("id", duelId);

  if (duelError) return { error: duelError.message };

  // 2. Busca todas as apostas
  const { data: bets } = await supabase
    .from("arena_bets")
    .select("id, side, amount")
    .eq("duel_id", duelId);

  if (!bets?.length) return { error: null };

  // 3. Define actual_payout para cada aposta
  const sideOdds: Record<BetSide, number> = {
    A: odds.odds_a,
    draw: odds.odds_draw,
    B: odds.odds_b,
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
    if (betError.code === "23505") return { error: "Você já apostou neste embate" };
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

  // Estorna o valor na carteira
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
  // Marca como resgatado primeiro (idempotente)
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
