// Partida do jogador nos jogos diários (letreco_games, letroso_games, ...): todas têm a
// mesma forma (uma linha por user_id + game_date). Leitura e escrita funcionam offline.
import { supabase } from "@/lib/supabase";
import { cachedQuery } from "@/lib/localCache";
import { getQueuedRow, upsertOrQueue, writeKey } from "@/lib/offlineQueue";

type Row = Record<string, unknown>;

/**
 * A partida do dia. Ordem: escrita ainda não enviada (é a mais nova) → servidor
 * (e guarda cópia) → cópia guardada, se estiver sem rede.
 */
export async function fetchMyGameRow(table: string, userId: string, gameDate: string): Promise<Row | null> {
  const queued = getQueuedRow(writeKey(table, userId, gameDate));
  if (queued) return { id: "local", created_at: new Date().toISOString(), ...queued };
  const { data } = await cachedQuery<Row>(`game:${table}:${userId}:${gameDate}`, () =>
    supabase.from(table).select("*").eq("user_id", userId).eq("game_date", gameDate).maybeSingle(),
  );
  return data;
}

/** Grava a partida; sem rede, fica na fila e é enviada quando a conexão voltar. */
export async function saveMyGameRow(
  table: string,
  userId: string,
  gameDate: string,
  row: Row,
): Promise<{ error: string | null; queued: boolean }> {
  return upsertOrQueue({
    table,
    userId,
    key: writeKey(table, userId, gameDate),
    row: { user_id: userId, game_date: gameDate, ...row },
    onConflict: "user_id,game_date",
  });
}
