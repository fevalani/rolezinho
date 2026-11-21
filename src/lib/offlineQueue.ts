// ══════════════════════════════════════════════════════════════
// Fila de escritas offline (upserts). Sem rede, a escrita fica guardada no aparelho
// e é reenviada quando a conexão volta. Só aceita upsert por chave (partidas de jogos
// diários etc.), onde repetir o envio é seguro e "a última versão vence".
// A regra de permissão continua no banco (RLS): se ele recusar, o item é descartado.
// ══════════════════════════════════════════════════════════════
import { supabase } from "@/lib/supabase";
import { isNetworkErrorMessage, isOnline } from "@/lib/online";

const STORAGE_KEY = "rolezinho:offline-queue:v1";
const MAX_ATTEMPTS = 5;
const MAX_ITEMS = 200;

export interface QueuedWrite {
  /** Identifica a escrita: uma nova com a mesma chave substitui a anterior. */
  key: string;
  userId: string;
  table: string;
  row: Record<string, unknown>;
  onConflict: string;
  attempts: number;
  queuedAt: number;
}

const listeners = new Set<() => void>();

function load(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function save(items: QueuedWrite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* quota cheia / modo privado: a fila só não persiste */
  }
  listeners.forEach((cb) => cb());
}

export function writeKey(table: string, userId: string, id: string): string {
  return `${table}:${userId}:${id}`;
}

export function enqueueWrite(item: Omit<QueuedWrite, "attempts" | "queuedAt">): void {
  const items = load().filter((q) => q.key !== item.key);
  items.push({ ...item, attempts: 0, queuedAt: Date.now() });
  save(items);
}

/** Linha ainda não enviada para essa chave (mais recente que o servidor), se houver. */
export function getQueuedRow(key: string): Record<string, unknown> | null {
  return load().find((q) => q.key === key)?.row ?? null;
}

export function pendingCount(userId?: string): number {
  return load().filter((q) => !userId || q.userId === userId).length;
}

/** Avisa quando a fila muda (para o aviso "n pendentes" da interface). */
export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

let flushing: Promise<{ sent: number; dropped: number }> | null = null;

/**
 * Envia as escritas pendentes desse usuário, em ordem. Para no primeiro erro de rede
 * (tenta de novo na próxima vez); erro do banco conta tentativa e, após `MAX_ATTEMPTS`,
 * o item é descartado para não travar a fila.
 */
export function flushQueue(userId: string): Promise<{ sent: number; dropped: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let dropped = 0;
    if (!isOnline()) return { sent, dropped };
    for (const item of load().filter((q) => q.userId === userId)) {
      let message: string | null = null;
      try {
        const { error } = await supabase
          .from(item.table)
          .upsert(item.row, { onConflict: item.onConflict });
        message = error?.message ?? null;
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      if (message === null) {
        // só remove se ninguém reescreveu a mesma chave enquanto enviava
        save(load().filter((q) => !(q.key === item.key && q.queuedAt === item.queuedAt)));
        sent++;
      } else if (isNetworkErrorMessage(message)) {
        break;
      } else {
        const next = load().map((q) =>
          q.key === item.key && q.queuedAt === item.queuedAt ? { ...q, attempts: q.attempts + 1 } : q,
        );
        const gone = next.filter((q) => q.attempts >= MAX_ATTEMPTS);
        dropped += gone.length;
        save(next.filter((q) => q.attempts < MAX_ATTEMPTS));
      }
    }
    return { sent, dropped };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Faz o upsert; sem rede (ou com erro de rede) guarda na fila e devolve sucesso
 * com `queued: true`. Erros do banco (permissão, dados) continuam sendo erro.
 */
export async function upsertOrQueue(opts: {
  table: string;
  userId: string;
  key: string;
  row: Record<string, unknown>;
  onConflict: string;
}): Promise<{ error: string | null; queued: boolean }> {
  const queue = () => {
    enqueueWrite({ key: opts.key, userId: opts.userId, table: opts.table, row: opts.row, onConflict: opts.onConflict });
    return { error: null, queued: true };
  };
  if (!isOnline()) return queue();
  try {
    const { error } = await supabase.from(opts.table).upsert(opts.row, { onConflict: opts.onConflict });
    if (!error) return { error: null, queued: false };
    return isNetworkErrorMessage(error.message) ? queue() : { error: error.message, queued: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return isNetworkErrorMessage(msg) ? queue() : { error: msg, queued: false };
  }
}
