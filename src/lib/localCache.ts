// ══════════════════════════════════════════════════════════════
// Cache local (localStorage) com versionamento de schema.
// Padrão stale-while-revalidate: lê instantâneo do cache e revalida
// contra o banco em segundo plano. Ver docs/bolao-carregamento-cache.md
// ══════════════════════════════════════════════════════════════

const PREFIX = "rolezinho:cache:";

// Bump quando o formato de QUALQUER snapshot cacheado mudar — invalida
// automaticamente caches gravados em versões anteriores.
const SCHEMA_VERSION = 1;

interface CacheEnvelope<T> {
  v: number; // SCHEMA_VERSION
  savedAt: number; // Date.now()
  data: T;
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (env.v !== SCHEMA_VERSION) return null; // formato antigo → descarta
    return env.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = {
      v: SCHEMA_VERSION,
      savedAt: Date.now(),
      data,
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    // Quota cheia / modo privado: ignora silenciosamente — o app segue
    // funcionando, apenas sem persistir o cache.
  }
}

export function clearCache(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* noop */
  }
}

/**
 * Apaga TODOS os snapshots (`rolezinho:cache:*`). Chamado no logout para que, em
 * aparelho compartilhado, o próximo usuário não veja dados do anterior.
 */
export function clearAllCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

// ── Leitura com cache (funciona offline) ────────────────────────

/** Resultado de uma consulta do Supabase (`{ data, error }`), sem depender do tipo do builder. */
interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Executa a consulta e guarda o resultado. Se ela falhar (sem rede, erro do servidor)
 * e houver um resultado guardado, devolve esse — assim a tela abre offline com os
 * últimos dados. Sem cache, devolve `{ data: null, error }` como o Supabase faria.
 */
export async function cachedQuery<T>(
  key: string,
  run: () => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  let result: QueryResult<T>;
  try {
    result = await run();
  } catch (e) {
    result = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
  if (!result.error && result.data !== null) {
    writeCache(key, result.data);
    return result;
  }
  const cached = readCache<T>(key);
  if (cached !== null) return { data: cached, error: null };
  return result;
}

/**
 * Como `cachedQuery`, mas para uma função inteira (várias consultas + montagem do
 * resultado). `load` deve LANÇAR erro quando a consulta principal falhar; nesse caso
 * devolve a última cópia guardada ou, sem cópia, `fallback`.
 */
export async function cachedValue<T>(key: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const value = await load();
    writeCache(key, value);
    return value;
  } catch (e) {
    const cached = readCache<T>(key);
    if (cached !== null) return cached;
    console.error(`[${key}]`, e);
    return fallback;
  }
}
