import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const NOTION_VERSION = "2022-06-28";

async function notion(token: string, path: string, init?: RequestInit) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });
  return { status: r.status, data: await r.json() };
}

function titleOf(item: any): string {
  if (item.object === "database")
    return item.title?.map((t: any) => t.plain_text).join("") || "Sem título";
  const prop = Object.values(item.properties ?? {}).find(
    (p: any) => p.type === "title",
  ) as any;
  return prop?.title?.map((t: any) => t.plain_text).join("") || "Sem título";
}

// Ações (POST):
//   connect { tableId, token } -> valida o token no Notion e salva
//   list    { tableId }        -> páginas/databases que a integração enxerga
// O token é gravado/lido com o JWT do usuário, então a RLS garante que só o
// mestre da mesa passa.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const jwt = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!jwt) return res.status(401).json({ error: "Não autenticado" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? "",
    process.env.VITE_SUPABASE_ANON_KEY ?? "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: userData } = await supabase.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return res.status(401).json({ error: "Sessão inválida" });

  const { action, tableId, token } = req.body ?? {};
  if (!tableId) return res.status(400).json({ error: "tableId obrigatório" });

  if (action === "connect") {
    if (typeof token !== "string" || !token.trim())
      return res.status(400).json({ error: "Token obrigatório" });

    const me = await notion(token.trim(), "/users/me");
    if (me.status !== 200)
      return res.status(400).json({ error: "Token inválido no Notion" });

    const { error } = await supabase.from("rpg_notion_connections").upsert({
      table_id: tableId,
      owner_id: user.id,
      access_token: token.trim(),
      workspace_name: me.data.bot?.workspace_name ?? null,
      bot_name: me.data.name ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error)
      return res
        .status(403)
        .json({ error: "Só o mestre da mesa pode conectar o Notion" });

    return res.json({
      workspace_name: me.data.bot?.workspace_name ?? null,
      bot_name: me.data.name ?? null,
    });
  }

  if (action === "list") {
    const { data: conn } = await supabase
      .from("rpg_notion_connections")
      .select("access_token")
      .eq("table_id", tableId)
      .maybeSingle();
    if (!conn) return res.status(404).json({ error: "Notion não conectado" });

    const r = await notion(conn.access_token, "/search", {
      method: "POST",
      body: JSON.stringify({ page_size: 100 }),
    });
    if (r.status !== 200)
      return res.status(r.status).json({ error: "Falha ao consultar o Notion" });

    return res.json({
      items: (r.data.results ?? []).map((it: any) => ({
        id: it.id,
        type: it.object, // "page" | "database"
        title: titleOf(it),
        url: it.url,
      })),
    });
  }

  return res.status(400).json({ error: "Ação inválida" });
}
