/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── mock do Supabase usado pelo notion-proxy ─────────────────────
const sb = {
  user: { id: "u1" } as { id: string } | null,
  conn: { access_token: "secret_tok" } as { access_token: string } | null,
  upsertError: null as { message: string } | null,
  upserts: [] as unknown[],
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: sb.user } }) },
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: sb.conn }),
        upsert: async (row: unknown) => {
          sb.upserts.push(row);
          return { error: sb.upsertError };
        },
      };
      return chain;
    },
  }),
}));

import fdProxy from "../../api/fd-proxy";
import sportsdb from "../../api/sportsdb-proxy";
import lance from "../../api/lance-proxy";
import notion from "../../api/notion-proxy";
import { GET as ogAgenda } from "../../api/og-agenda";

function mockRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, string> };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  res.send = (b: unknown) => {
    res.body = b;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  return res;
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sb.user = { id: "u1" };
  sb.conn = { access_token: "secret_tok" };
  sb.upsertError = null;
  sb.upserts = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("api/fd-proxy", () => {
  it("repassa o path ao football-data com a chave do servidor", async () => {
    process.env.VITE_FOOTBALL_DATA_KEY = "KEY123";
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ matches: [] }) });
    const res = mockRes();
    await fdProxy({ query: { path: "/competitions/WC/matches" } } as any, res);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/WC/matches",
      { headers: { "X-Auth-Token": "KEY123" } },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ matches: [] });
  });
  it("devolve o status do upstream (ex.: 429)", async () => {
    fetchMock.mockResolvedValue({ status: 429, json: async () => ({ message: "rate" }) });
    const res = mockRes();
    await fdProxy({ query: { path: "/x" } } as any, res);
    expect(res.statusCode).toBe(429);
  });
});

describe("api/sportsdb-proxy", () => {
  it("repassa para o TheSportsDB", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: 1 }) });
    const res = mockRes();
    await sportsdb({ query: { path: "/eventsnextleague.php?id=1" } } as any, res);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=1",
    );
    expect(res.body).toEqual({ ok: 1 });
  });
});

describe("api/lance-proxy", () => {
  it("devolve o HTML com cache curto", async () => {
    fetchMock.mockResolvedValue({ text: async () => "<html>tabela</html>" });
    const res = mockRes();
    await lance({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("<html>tabela</html>");
    expect(res.headers["Content-Type"]).toContain("text/html");
    expect(res.headers["Cache-Control"]).toContain("s-maxage=180");
  });
});

describe("api/og-agenda", () => {
  const req = (qs: string) =>
    new Request(`https://rolezinho-amigos.vercel.app/api/og-agenda${qs}`, {
      headers: { host: "rolezinho-amigos.vercel.app", "x-forwarded-proto": "https" },
    });
  const baseHtml = "<html><head><title>Rolezinho</title></head><body></body></html>";

  it("injeta as meta tags do evento", async () => {
    fetchMock.mockResolvedValue({ text: async () => baseHtml });
    const r = await ogAgenda(
      req("?evento=ev1&t=Churrasco&d=2026-12-20&h=19:30&l=Casa%20do%20Ze&x=Leve%20bebida"),
    );
    const html = await r.text();
    expect(html).toContain('<meta property="og:title" content="🎉 Churrasco" />');
    expect(html).toContain("19:30");
    expect(html).toContain("Casa do Ze");
    expect(html).toContain("Leve bebida");
    expect(html).toContain("/api/og-agenda-image?d=2026-12-20&amp;h=19%3A30");
    expect(html).toContain("https://rolezinho-amigos.vercel.app/agenda?evento=ev1");
    expect(html).not.toContain("<title>Rolezinho</title>");
    expect(r.headers.get("Content-Type")).toContain("text/html");
  });
  it("escapa HTML do título (sem injeção)", async () => {
    fetchMock.mockResolvedValue({ text: async () => baseHtml });
    const r = await ogAgenda(req("?evento=1&t=%3Cscript%3Ealert(1)%3C/script%3E&d=2026-12-20"));
    const html = await r.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("sem dados válidos devolve o index.html intacto", async () => {
    fetchMock.mockResolvedValue({ text: async () => baseHtml });
    expect((await (await ogAgenda(req("?evento=1"))).text())).toBe(baseHtml);
    expect((await (await ogAgenda(req("?evento=1&t=X&d=20/12/2026"))).text())).toBe(baseHtml);
  });
});

describe("api/notion-proxy", () => {
  const call = async (body: any, headers: Record<string, string> = { authorization: "Bearer jwt" }, method = "POST") => {
    const res = mockRes();
    await notion({ method, headers, body } as any, res);
    return res;
  };

  it("só aceita POST", async () => {
    expect((await call({}, {}, "GET")).statusCode).toBe(405);
  });
  it("exige autenticação", async () => {
    expect((await call({ action: "list", tableId: "t" }, {})).statusCode).toBe(401);
  });
  it("rejeita sessão inválida", async () => {
    sb.user = null;
    const res = await call({ action: "list", tableId: "t" });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Sessão inválida" });
  });
  it("exige tableId", async () => {
    expect((await call({ action: "list" })).statusCode).toBe(400);
  });
  it("connect: exige token", async () => {
    const res = await call({ action: "connect", tableId: "t", token: "  " });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Token obrigatório" });
  });
  it("connect: token recusado pelo Notion", async () => {
    fetchMock.mockResolvedValue({ status: 401, json: async () => ({}) });
    const res = await call({ action: "connect", tableId: "t", token: "bad" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Token inválido no Notion" });
    expect(sb.upserts).toHaveLength(0);
  });
  it("connect: salva a conexão e devolve o workspace", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ name: "Bot", bot: { workspace_name: "Mesa do Zé" } }),
    });
    const res = await call({ action: "connect", tableId: "t1", token: " tok " });
    expect(res.body).toEqual({ workspace_name: "Mesa do Zé", bot_name: "Bot" });
    expect(sb.upserts[0]).toMatchObject({ table_id: "t1", owner_id: "u1", access_token: "tok" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("connect: quem não é mestre recebe 403", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ name: "Bot" }) });
    sb.upsertError = { message: "rls" };
    const res = await call({ action: "connect", tableId: "t1", token: "tok" });
    expect(res.statusCode).toBe(403);
  });
  it("sem conexão salva = 404", async () => {
    sb.conn = null;
    const res = await call({ action: "list", tableId: "t1" });
    expect(res.statusCode).toBe(404);
  });
  it("ação desconhecida = 400", async () => {
    const res = await call({ action: "hackear", tableId: "t1" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Ação inválida" });
  });
  it("sync_page exige notionId e runId", async () => {
    const res = await call({ action: "sync_page", tableId: "t1" });
    expect(res.statusCode).toBe(400);
  });
});
