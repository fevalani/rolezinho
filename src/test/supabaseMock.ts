/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

/**
 * Mock do cliente Supabase para os testes.
 *
 * - `mockDb.tables[nome]` define as linhas devolvidas por `supabase.from(nome)`
 *   (qualquer encadeamento: select/eq/order/limit/in/... termina numa promise).
 * - `.single()` / `.maybeSingle()` devolvem a 1ª linha (ou null).
 * - `mockDb.rpcResults[nome]` define o retorno de `supabase.rpc(nome)`.
 * - `mockDb.writes` registra insert/update/upsert/delete para os testes conferirem.
 * - `mockDb.session` define quem está logado (null = deslogado).
 */

type Row = Record<string, unknown>;

export interface WriteRecord {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  args: unknown[];
}

export const mockDb = {
  tables: {} as Record<string, Row[]>,
  rpcResults: {} as Record<string, unknown>,
  errors: {} as Record<string, { message: string; code?: string }>,
  writes: [] as WriteRecord[],
  /** Cada `supabase.from(tabela)` e os métodos encadeados nele (ex.: eq/in/order), para conferir filtros. */
  queries: [] as { table: string; calls: [string, unknown[]][] }[],
  session: null as null | { user: Record<string, unknown> },
  /** Callbacks registrados via supabase.auth.onAuthStateChange (ver emitAuthEvent). */
  authListeners: [] as ((event: string, session: unknown) => void)[],
  reset() {
    this.authListeners = [];
    this.tables = {};
    this.rpcResults = {};
    this.errors = {};
    this.writes = [];
    this.queries = [];
    this.session = null;
  },
};

const WRITE_OPS = new Set(["insert", "update", "upsert", "delete"]);

function queryBuilder(table: string) {
  let single = false;
  const record: { table: string; calls: [string, unknown[]][] } = { table, calls: [] };
  mockDb.queries.push(record);

  const result = () => {
    const error = mockDb.errors[table] ?? null;
    const rows = mockDb.tables[table] ?? [];
    if (single) return { data: error ? null : (rows[0] ?? null), error };
    return { data: error ? null : rows, error, count: rows.length };
  };

  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (res: any, rej: any) =>
            Promise.resolve(result()).then(res, rej);
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            single = true;
            return proxy;
          };
        }
        return (...args: unknown[]) => {
          record.calls.push([prop, args]);
          if (WRITE_OPS.has(prop)) {
            mockDb.writes.push({ table, op: prop as WriteRecord["op"], args });
          }
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function rpcBuilder(name: string) {
  const result = () => ({
    data: mockDb.rpcResults[name] ?? null,
    error: mockDb.errors[`rpc:${name}`] ?? null,
  });
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (res: any, rej: any) =>
            Promise.resolve(result()).then(res, rej);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

export const supabaseMock = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: mockDb.session } })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      mockDb.authListeners.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
  },
  from: vi.fn((table: string) => queryBuilder(table)),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rpc: vi.fn((name: string, _args?: unknown) => rpcBuilder(name)),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://test/x.png" } })),
      remove: vi.fn(async () => ({ data: null, error: null })),
    })),
  },
  functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  channel: vi.fn(() => {
    const ch: any = {
      on: vi.fn(() => ch),
      subscribe: vi.fn(() => ch),
      unsubscribe: vi.fn(),
      send: vi.fn(),
    };
    return ch;
  }),
  removeChannel: vi.fn(),
};

/** Simula um evento do Supabase Auth (ex.: "PASSWORD_RECOVERY" ao abrir o link do e-mail). */
export function emitAuthEvent(event: string, session: unknown = mockDb.session) {
  mockDb.authListeners.forEach((cb) => cb(event, session));
}
