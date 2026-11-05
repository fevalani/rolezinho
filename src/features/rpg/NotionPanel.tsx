/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import {
  fetchNotionConnection,
  connectNotion,
  listNotionItems,
  disconnectNotion,
  saveNotionRoots,
  syncNotion,
  fetchNotionTree,
  fetchNotionPage,
  type NotionConnection,
  type NotionItem,
  type NotionPageNode,
  type NotionPage,
} from "./rpgService";

// ═══════════════════════════════════════════
// Config do mestre: conectar, escolher páginas, sincronizar
// ═══════════════════════════════════════════

export function NotionConnectCard({ tableId }: { tableId: string }) {
  const [conn, setConn] = useState<NotionConnection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotionItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    fetchNotionConnection(tableId).then((c) => {
      setConn(c);
      setPicked(new Set(c?.root_pages.map((r) => r.id)));
      setLoaded(true);
    });
  }, [tableId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const onConnect = () =>
    run(async () => {
      const c = await connectNotion(tableId, token);
      setConn({ ...c, root_pages: [], last_synced_at: null });
      setToken("");
    });

  const onList = () =>
    run(async () => {
      setItems(await listNotionItems(tableId));
    });

  const onSync = () =>
    run(async () => {
      if (!items || !conn) return;
      const roots = items
        .filter((i) => picked.has(i.id))
        .map((i) => ({ id: i.id, type: i.type, title: i.title }));
      await saveNotionRoots(tableId, roots);
      const { synced, failed } = await syncNotion(
        tableId,
        roots,
        (done, queued) => setProgress(`${done} sincronizadas · ${queued} na fila`),
      );
      setProgress(null);
      setConn({
        ...conn,
        root_pages: roots,
        last_synced_at: failed === 0 ? new Date().toISOString() : conn.last_synced_at,
      });
      if (failed > 0)
        throw new Error(
          `${synced} sincronizadas, ${failed} falharam (nada foi removido). Tente de novo.`,
        );
    });

  // re-sincroniza as raízes já salvas, sem precisar listar de novo
  const onResync = () =>
    run(async () => {
      if (!conn) return;
      const { synced, failed } = await syncNotion(
        tableId,
        conn.root_pages,
        (done, queued) => setProgress(`${done} sincronizadas · ${queued} na fila`),
      );
      setProgress(null);
      if (failed > 0)
        throw new Error(
          `${synced} sincronizadas, ${failed} falharam (nada foi removido).`,
        );
      setConn({ ...conn, last_synced_at: new Date().toISOString() });
    });

  const onDisconnect = async () => {
    if (!confirm("Desconectar o Notion desta mesa?")) return;
    await disconnectNotion(tableId);
    setConn(null);
    setItems(null);
  };

  const visible = useMemo(
    () => (items ?? []).filter((i) => showAll || i.top || picked.has(i.id)),
    [items, showAll, picked],
  );

  if (!loaded) return null;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-4">
      <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-3">
        Notion
      </p>

      {conn ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-(--text-primary)">
            ✅ Conectado
            {conn.workspace_name ? ` a ${conn.workspace_name}` : ""}
            {conn.bot_name ? ` (${conn.bot_name})` : ""}
          </p>
          {conn.root_pages.length > 0 && (
            <p className="text-xs text-(--text-muted)">
              Raízes: {conn.root_pages.map((r) => r.title).join(", ")}
              {conn.last_synced_at &&
                ` · última sincronização ${new Date(conn.last_synced_at).toLocaleString("pt-BR")}`}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onList}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(201,165,90,0.2)] text-(--gold) disabled:opacity-50"
            >
              Escolher páginas
            </button>
            {conn.root_pages.length > 0 && (
              <button
                onClick={onResync}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.2)] text-(--gold) disabled:opacity-50"
              >
                🔄 Sincronizar
              </button>
            )}
            <button
              onClick={onDisconnect}
              className="py-2.5 px-4 rounded-xl text-sm border border-[rgba(196,64,64,0.2)] text-(--red)"
            >
              Desconectar
            </button>
          </div>

          {items && (
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="text-xs text-(--text-muted)">
                  Nenhuma página compartilhada com a integração. No Notion,
                  abra a página → ••• → Conexões → adicione a integração.
                </p>
              ) : (
                <>
                  <p className="text-xs text-(--text-muted)">
                    Marque as páginas ou databases-raiz. Todas as subpáginas
                    entram junto, e os jogadores poderão ler tudo o que for
                    sincronizado.
                  </p>
                  <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {visible.map((it) => (
                      <li key={it.id}>
                        <label className="flex items-center gap-2 text-sm text-(--text-primary) py-1">
                          <input
                            type="checkbox"
                            checked={picked.has(it.id)}
                            onChange={() => toggle(it.id)}
                          />
                          {it.type === "database" ? "🗂" : "📄"} {it.title}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2 text-xs text-(--text-muted)">
                    <input
                      type="checkbox"
                      checked={showAll}
                      onChange={(e) => setShowAll(e.target.checked)}
                    />
                    Mostrar também subpáginas
                  </label>
                  <button
                    onClick={onSync}
                    disabled={busy || picked.size === 0}
                    className="py-2.5 rounded-xl font-bold text-sm bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.2)] text-(--gold) disabled:opacity-50"
                  >
                    Salvar e sincronizar ({picked.size})
                  </button>
                </>
              )}
            </div>
          )}
          {progress && <p className="text-xs text-(--blue)">{progress}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-(--text-muted)">
            Crie uma integração interna em notion.so/profile/integrations,
            compartilhe suas páginas com ela (••• → Conexões) e cole o token
            abaixo.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token da integração (ntn_… ou secret_…)"
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-deep)] border border-[rgba(201,165,90,0.15)] text-(--text-primary)"
          />
          <button
            onClick={onConnect}
            disabled={busy || !token.trim()}
            className="py-2.5 rounded-xl font-bold text-sm bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.2)] text-(--gold) disabled:opacity-50"
          >
            {busy ? "Conectando…" : "Conectar Notion"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-(--red) mt-2">{error}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════
// Biblioteca: navegação igual ao Notion (raízes → subpáginas)
// ═══════════════════════════════════════════

export function NotionLibrary({ tableId }: { tableId: string }) {
  const [tree, setTree] = useState<NotionPageNode[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [page, setPage] = useState<NotionPage | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  useEffect(() => {
    fetchNotionTree(tableId).then(setTree);
  }, [tableId]);

  useEffect(() => {
    if (!currentId) {
      setPage(null);
      return;
    }
    setLoadingPage(true);
    fetchNotionPage(tableId, currentId).then((p) => {
      setPage(p);
      setLoadingPage(false);
    });
  }, [tableId, currentId]);

  const byId = useMemo(
    () => new Map(tree.map((n) => [n.notion_id, n])),
    [tree],
  );
  const childrenOf = (id: string | null) =>
    tree.filter((n) => (n.parent_notion_id ?? null) === id);

  if (tree.length === 0) return null;

  // trilha: raiz → ... → página atual
  const crumbs: NotionPageNode[] = [];
  for (let n = currentId ? byId.get(currentId) : undefined; n; ) {
    crumbs.unshift(n);
    n = n.parent_notion_id ? byId.get(n.parent_notion_id) : undefined;
  }

  const kids = childrenOf(currentId);
  // subpáginas já aparecem como bloco "child_page" no conteúdo; evita duplicar
  const inlineIds = new Set(
    (page?.blocks ?? [])
      .filter((b: any) => b.type === "child_page" || b.type === "child_database")
      .map((b: any) => b.id),
  );
  const extraKids = kids.filter((k) => !inlineIds.has(k.notion_id));

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 flex flex-col gap-3">
      <div className="flex items-center gap-1 flex-wrap text-xs text-(--text-muted)">
        <button onClick={() => setCurrentId(null)} className="hover:text-(--gold)">
          📚 Notion
        </button>
        {crumbs.map((c) => (
          <span key={c.notion_id} className="flex items-center gap-1">
            <span>/</span>
            <button
              onClick={() => setCurrentId(c.notion_id)}
              className="hover:text-(--gold)"
            >
              {c.icon ?? ""} {c.title}
            </button>
          </span>
        ))}
      </div>

      {currentId && (
        <h2 className="font-semibold text-(--gold)">
          {page?.icon ?? ""} {page?.title ?? byId.get(currentId)?.title}
        </h2>
      )}

      {loadingPage && <p className="text-xs text-(--text-muted)">Carregando…</p>}

      {page && (
        <Blocks blocks={page.blocks} byId={byId} onOpen={setCurrentId} />
      )}

      {extraKids.length > 0 && (
        <div className="flex flex-col gap-1">
          {extraKids.map((k) => (
            <NodeLink
              key={k.notion_id}
              icon={k.icon ?? (k.type === "database" ? "🗂" : "📄")}
              title={k.title}
              onClick={() => setCurrentId(k.notion_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeLink({
  icon,
  title,
  onClick,
}: {
  icon: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.08)] text-sm text-(--text-primary) hover:border-[rgba(201,165,90,0.3)] transition-colors"
    >
      <span>{icon}</span>
      <span className="flex-1">{title}</span>
      <span className="text-(--text-muted)">→</span>
    </button>
  );
}

// ── Renderização dos blocos ─────────────────────────────────

function Rich({ text }: { text?: any[] }) {
  return (
    <>
      {(text ?? []).map((t, i) => {
        let el: React.ReactNode = t.t;
        if (t.code)
          el = (
            <code className="px-1 rounded bg-[var(--bg-elevated)] text-[0.85em]">
              {el}
            </code>
          );
        if (t.b) el = <strong>{el}</strong>;
        if (t.i) el = <em>{el}</em>;
        if (t.s) el = <s>{el}</s>;
        if (t.u) el = <u>{el}</u>;
        if (t.href)
          el = (
            <a
              href={t.href}
              target="_blank"
              rel="noreferrer"
              className="text-(--blue) underline"
            >
              {el}
            </a>
          );
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function Blocks({
  blocks,
  byId,
  onOpen,
}: {
  blocks: any[];
  byId: Map<string, NotionPageNode>;
  onOpen: (id: string) => void;
}) {
  // posição dentro de uma sequência de itens numerados
  const nums = blocks.map((b, i) => {
    if (b.type !== "numbered_list_item") return 0;
    let k = 1;
    while (i - k >= 0 && blocks[i - k].type === "numbered_list_item") k++;
    return k;
  });
  return (
    <div className="flex flex-col gap-1.5 text-sm text-(--text-secondary) leading-relaxed">
      {blocks.map((b, i) => (
        <Block key={b.id ?? i} b={b} num={nums[i]} byId={byId} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Block({
  b,
  num,
  byId,
  onOpen,
}: {
  b: any;
  num: number;
  byId: Map<string, NotionPageNode>;
  onOpen: (id: string) => void;
}) {
  const nested = b.children?.length ? (
    <div className="ml-5 mt-1">
      <Blocks blocks={b.children} byId={byId} onOpen={onOpen} />
    </div>
  ) : null;

  switch (b.type) {
    case "paragraph":
      return b.text?.length ? (
        <p className="whitespace-pre-wrap">
          <Rich text={b.text} />
          {nested}
        </p>
      ) : (
        <div className="h-2" />
      );
    case "heading_1":
      return (
        <h3 className="text-base font-bold text-(--gold) mt-3">
          <Rich text={b.text} />
        </h3>
      );
    case "heading_2":
      return (
        <h4 className="text-sm font-bold text-(--gold) mt-2">
          <Rich text={b.text} />
        </h4>
      );
    case "heading_3":
      return (
        <h5 className="text-sm font-semibold text-(--text-primary) mt-1">
          <Rich text={b.text} />
        </h5>
      );
    case "bulleted_list_item":
      return (
        <div>
          <div className="flex gap-2">
            <span>•</span>
            <span className="whitespace-pre-wrap">
              <Rich text={b.text} />
            </span>
          </div>
          {nested}
        </div>
      );
    case "numbered_list_item":
      return (
        <div>
          <div className="flex gap-2">
            <span>{num}.</span>
            <span className="whitespace-pre-wrap">
              <Rich text={b.text} />
            </span>
          </div>
          {nested}
        </div>
      );
    case "to_do":
      return (
        <div className="flex gap-2">
          <span>{b.checked ? "☑" : "☐"}</span>
          <span className={b.checked ? "line-through opacity-60" : ""}>
            <Rich text={b.text} />
          </span>
        </div>
      );
    case "toggle":
      return (
        <details>
          <summary className="cursor-pointer text-(--text-primary)">
            <Rich text={b.text} />
          </summary>
          {nested}
        </details>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[rgba(201,165,90,0.4)] pl-3 italic">
          <Rich text={b.text} />
          {nested}
        </blockquote>
      );
    case "callout":
      return (
        <div className="flex gap-2 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.12)]">
          {b.icon && <span>{b.icon}</span>}
          <div className="flex-1 whitespace-pre-wrap">
            <Rich text={b.text} />
            {nested}
          </div>
        </div>
      );
    case "code":
      return (
        <pre className="p-3 rounded-lg bg-[var(--bg-deep)] text-xs overflow-x-auto">
          <Rich text={b.text} />
        </pre>
      );
    case "divider":
      return <hr className="border-[rgba(201,165,90,0.15)] my-1" />;
    case "image":
      return (
        <figure>
          <img src={b.url} alt="" loading="lazy" className="rounded-lg max-w-full" />
          {b.caption?.length > 0 && (
            <figcaption className="text-xs text-(--text-muted) mt-1">
              <Rich text={b.caption} />
            </figcaption>
          )}
        </figure>
      );
    case "bookmark":
      return (
        <a
          href={b.url}
          target="_blank"
          rel="noreferrer"
          className="text-(--blue) underline break-all"
        >
          {b.url}
        </a>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <tbody>
              {(b.rows ?? []).map((row: any[][], r: number) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const Tag = b.header && r === 0 ? "th" : "td";
                    return (
                      <Tag
                        key={c}
                        className="border border-[rgba(201,165,90,0.15)] px-2 py-1 text-left"
                      >
                        <Rich text={cell} />
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "group":
      return <Blocks blocks={b.children ?? []} byId={byId} onOpen={onOpen} />;
    case "child_page":
    case "child_database":
    case "link_to_page": {
      const target = byId.get(b.id);
      if (!target)
        return b.type === "link_to_page" ? null : (
          <span className="text-(--text-muted)">📄 {b.title}</span>
        );
      return (
        <NodeLink
          icon={target.icon ?? (target.type === "database" ? "🗂" : "📄")}
          title={target.title}
          onClick={() => onOpen(target.notion_id)}
        />
      );
    }
    default:
      return null;
  }
}
