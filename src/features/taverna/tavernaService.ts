import { supabase } from "@/lib/supabase";
import type { DiceType, DiceRoll } from "@/lib/types";
import { rollDice } from "@/lib/utils";

const ROLL_SELECT = `
  id,
  user_id,
  dice_type,
  result,
  created_at,
  profiles:user_id (
    id,
    email,
    display_name,
    avatar_url
  )
`;

function mapRow(row: Record<string, unknown>): DiceRoll {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    dice_type: row.dice_type as DiceType,
    result: row.result as number,
    created_at: row.created_at as string,
    profile: row.profiles as DiceRoll["profile"],
  };
}

/** Fetch recent dice rolls with profile info */
export async function fetchRolls(limit = 50): Promise<DiceRoll[]> {
  const { data, error } = await supabase
    .from("dice_rolls")
    .select(ROLL_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching rolls:", error);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/** Roll multiple dice at once and save all to Supabase */
export async function performMultiRoll(
  userId: string,
  diceType: DiceType,
  quantity: number,
): Promise<DiceRoll[]> {
  const rows = Array.from({ length: quantity }, () => ({
    user_id: userId,
    dice_type: diceType,
    result: rollDice(diceType),
  }));

  const { data, error } = await supabase
    .from("dice_rolls")
    .insert(rows)
    .select(ROLL_SELECT);

  if (error) {
    console.error("Error saving rolls:", error);
    return [];
  }

  return (data ?? []).map(mapRow);
}

/** Subscribe to new dice rolls in realtime */
export function subscribeToRolls(onNewRoll: (roll: DiceRoll) => void) {
  const channel = supabase
    .channel("dice_rolls_realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "dice_rolls" },
      async (payload) => {
        const { data } = await supabase
          .from("dice_rolls")
          .select(ROLL_SELECT)
          .eq("id", payload.new.id)
          .single();

        if (data) onNewRoll(mapRow(data));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Delete all rolls except the most recent 50 */
export async function cleanupOldRolls(): Promise<number> {
  // Get the 50th most recent roll's timestamp
  const { data: recentRolls } = await supabase
    .from("dice_rolls")
    .select("created_at")
    .order("created_at", { ascending: false })
    .range(49, 49); // 0-indexed, so index 49 = 50th item

  if (!recentRolls || recentRolls.length === 0) return 0;

  const cutoff = recentRolls[0].created_at;

  const { data, error } = await supabase
    .from("dice_rolls")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("Cleanup error:", error);
    return 0;
  }

  return data?.length ?? 0;
}

/** Fetch all profiles */
export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching profiles:", error);
    return [];
  }
  return data ?? [];
}
