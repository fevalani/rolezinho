import { supabase } from "@/lib/supabase";
import type { DiceType, DiceRoll } from "@/lib/types";
import { rollDice } from "@/lib/utils";

/**
 * Fetch recent dice rolls with profile info
 */
export async function fetchRolls(limit = 50): Promise<DiceRoll[]> {
  const { data, error } = await supabase
    .from("dice_rolls")
    .select(
      `
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
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching rolls:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    dice_type: row.dice_type as DiceType,
    result: row.result as number,
    created_at: row.created_at as string,
    profile: row.profiles as DiceRoll["profile"],
  }));
}

/**
 * Roll a die and save to Supabase
 */
export async function performRoll(
  userId: string,
  diceType: DiceType,
): Promise<DiceRoll | null> {
  const result = rollDice(diceType);

  const { data, error } = await supabase
    .from("dice_rolls")
    .insert({
      user_id: userId,
      dice_type: diceType,
      result,
    })
    .select(
      `
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
    `,
    )
    .single();

  if (error) {
    console.error("Error saving roll:", error);
    return null;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    dice_type: data.dice_type as DiceType,
    result: data.result,
    created_at: data.created_at,
    profile: data.profiles as unknown as DiceRoll["profile"],
  };
}

/**
 * Subscribe to new dice rolls in realtime
 */
export function subscribeToRolls(onNewRoll: (roll: DiceRoll) => void) {
  const channel = supabase
    .channel("dice_rolls_realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dice_rolls",
      },
      async (payload) => {
        // Fetch the full roll with profile
        const { data } = await supabase
          .from("dice_rolls")
          .select(
            `
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
          `,
          )
          .eq("id", payload.new.id)
          .single();

        if (data) {
          onNewRoll({
            id: data.id,
            user_id: data.user_id,
            dice_type: data.dice_type as DiceType,
            result: data.result,
            created_at: data.created_at,
            profile: data.profiles as unknown as DiceRoll["profile"],
          });
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Fetch all profiles (online users)
 */
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
