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
