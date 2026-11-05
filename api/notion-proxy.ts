/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

const NOTION_VERSION = "2022-06-28";
const MAX_DEPTH = 5;
const MAX_DB_ROWS = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

const plain = (rt: any[] | undefined) =>
  (rt ?? []).map((t) => t.plain_text).join("");

function titleOf(item: any): string {
  if (item.object === "database") return plain(item.title) || "Sem título";
  const prop = Object.values(item.properties ?? {}).find(
    (p: any) => p.type === "title",
  ) as any;
  return plain(prop?.title) || "Sem título";
}

function iconOf(item: any): string | null {
  return item.icon?.type === "emoji" ? item.icon.emoji : null;
}

// rich_text do Notion -> formato enxuto { t, b, i, s, u, code, href }
function rich(rt: any[] | undefined) {
  return (rt ?? []).map((t) => {
    const a = t.annotations ?? {};
    const o: Record<string, unknown> = { t: t.plain_text };
    if (a.bold) o.b = 1;
    if (a.italic) o.i = 1;
    if (a.strikethrough) o.s = 1;
    if (a.underline) o.u = 1;
    if (a.code) o.code = 1;
    if (t.href) o.href = t.href;
    return o;
  });
}

// Imagens enviadas ao Notion têm URL que expira em 1h: copia para o Storage.
async function persistImage(
  supabase: SupabaseClient,
  tableId: string,
  blockId: string,
  url: string,
): Promise<string> {
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return url;
    const type = r.headers.get("content-type") ?? "image/png";
    const ext = type.split("/")[1]?.split(";")[0] || "png";
    const path = `rpg-notion/${tableId}/${blockId}.${ext}`;
    const { error } = await supabase.storage
      .from("public-assets")
      .upload(path, buf, { contentType: type, upsert: true });
    if (error) return url;
    return supabase.storage.from("public-assets").getPublicUrl(path).data
      .publicUrl;
  } catch {
    return url;
  }
}

interface Ctx {
  token: string;
  supabase: SupabaseClient;
  tableId: string;
  children: { id: string; type: "page" | "database" }[];
}

async function simplifyBlock(ctx: Ctx, b: any, depth: number): Promise<any | null> {
  const type: string = b.type;
  const v = b[type] ?? {};

  if (type === "child_page") {
    ctx.children.push({ id: b.id, type: "page" });
    return { type, id: b.id, title: v.title ?? "Sem título" };
  }
  if (type === "child_database") {
    ctx.children.push({ id: b.id, type: "database" });
    return { type, id: b.id, title: v.title ?? "Sem título" };
  }
  if (type === "link_to_page") {
    const id = v.page_id ?? v.database_id;
    return id ? { type, id, db: !!v.database_id } : null;
  }

  const kids =
    b.has_children && depth < MAX_DEPTH
      ? await fetchBlocks(ctx, b.id, depth + 1)
      : undefined;

  switch (type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "toggle":
    case "quote":
      return { type, text: rich(v.rich_text), children: kids };
    case "to_do":
      return { type, text: rich(v.rich_text), checked: !!v.checked, children: kids };
    case "callout":
      return {
        type,
        text: rich(v.rich_text),
        icon: v.icon?.type === "emoji" ? v.icon.emoji : null,
        children: kids,
      };
    case "code":
      return { type, text: rich(v.rich_text), language: v.language };
    case "divider":
      return { type };
    case "image": {
      const raw = v.type === "file" ? v.file?.url : v.external?.url;
      if (!raw) return null;
      const url =
        v.type === "file"
          ? await persistImage(ctx.supabase, ctx.tableId, b.id, raw)
          : raw;
      return { type, url, caption: rich(v.caption) };
    }
    case "bookmark":
    case "embed":
    case "link_preview":
      return v.url ? { type: "bookmark", url: v.url } : null;
    case "table":
      return {
        type,
        header: !!v.has_column_header,
        rows: (kids ?? []).map((r: any) => r.cells ?? []),
      };
    case "table_row":
      return { type, cells: (v.cells ?? []).map((c: any) => rich(c)) };
    case "column_list":
    case "column":
      return { type: "group", children: kids };
    default:
      return null; // tipo não suportado
  }
}

async function fetchBlocks(ctx: Ctx, blockId: string, depth: number): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const r = await notion(ctx.token, `/blocks/${blockId}/children${q}`);
    if (r.status !== 200) throw new Error(`blocks ${r.status}`);
    for (const b of r.data.results) {
      const s = await simplifyBlock(ctx, b, depth);
      if (s) out.push(s);
    }
    cursor = r.data.has_more ? r.data.next_cursor : undefined;
  } while (cursor);
  return out;
}

// Ações (POST, JWT do usuário -> a RLS garante que só o mestre passa):
//   connect   { tableId, token }  valida o token e salva
//   list      { tableId }         páginas/databases que a integração enxerga
//   sync_page { tableId, notionId, type, parentId, sortOrder, runId }
//             copia UM nó para rpg_notion_pages e devolve os filhos;
//             o cliente percorre a árvore (evita estourar o timeout).
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

  const { data: conn } = await supabase
    .from("rpg_notion_connections")
    .select("access_token")
    .eq("table_id", tableId)
    .maybeSingle();
  if (!conn) return res.status(404).json({ error: "Notion não conectado" });
  const accessToken: string = conn.access_token;

  if (action === "list") {
    const items: any[] = [];
    let cursor: string | undefined;
    do {
      const r = await notion(accessToken, "/search", {
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      });
      if (r.status !== 200)
        return res.status(r.status).json({ error: "Falha ao consultar o Notion" });
      items.push(...r.data.results);
      cursor = r.data.has_more && items.length < 500 ? r.data.next_cursor : undefined;
    } while (cursor);

    return res.json({
      items: items.map((it) => ({
        id: it.id,
        type: it.object, // "page" | "database"
        title: titleOf(it),
        url: it.url,
        // true = está direto no workspace (ou numa página não compartilhada)
        top: it.parent?.type === "workspace",
      })),
    });
  }

  if (action === "sync_page") {
    const { notionId, type, parentId, sortOrder, runId } = req.body;
    if (!notionId || !runId)
      return res.status(400).json({ error: "notionId e runId obrigatórios" });

    const ctx: Ctx = { token: accessToken, supabase, tableId, children: [] };
    let title = "";
    let icon: string | null = null;
    let blocks: any[] = [];

    try {
      if (type === "database") {
        const db = await notion(accessToken, `/databases/${notionId}`);
        if (db.status !== 200) throw new Error(`database ${db.status}`);
        title = titleOf(db.data);
        icon = iconOf(db.data);

        let cursor: string | undefined;
        do {
          const r = await notion(accessToken, `/databases/${notionId}/query`, {
            method: "POST",
            body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
          });
          if (r.status !== 200) throw new Error(`query ${r.status}`);
          for (const row of r.data.results)
            ctx.children.push({ id: row.id, type: "page" });
          cursor =
            r.data.has_more && ctx.children.length < MAX_DB_ROWS
              ? r.data.next_cursor
              : undefined;
        } while (cursor);
      } else {
        const page = await notion(accessToken, `/pages/${notionId}`);
        if (page.status !== 200) throw new Error(`page ${page.status}`);
        title = titleOf(page.data);
        icon = iconOf(page.data);
        blocks = await fetchBlocks(ctx, notionId, 0);
      }
    } catch (e: any) {
      return res.status(502).json({ error: `Notion: ${e.message}` });
    }

    const { error } = await supabase.from("rpg_notion_pages").upsert(
      {
        table_id: tableId,
        notion_id: notionId,
        parent_notion_id: parentId ?? null,
        type: type === "database" ? "database" : "page",
        title,
        icon,
        blocks,
        sort_order: sortOrder ?? 0,
        sync_run: runId,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "table_id,notion_id" },
    );
    if (error)
      return res
        .status(403)
        .json({ error: "Só o mestre da mesa pode sincronizar" });

    return res.json({ title, children: ctx.children });
  }

  return res.status(400).json({ error: "Ação inválida" });
}
