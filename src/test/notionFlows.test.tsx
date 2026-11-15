import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { NotionConnectCard } from "@/features/rpg/NotionPanel";
import { syncNotion } from "@/features/rpg/rpgService";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";
import type { ReactNode } from "react";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
const mount = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Ready>
          <NotionConnectCard tableId="t1" />
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

// proxy do Notion falso: responde por ação e registra as chamadas
type Handler = (body: Record<string, unknown>) => { ok?: boolean; json: unknown };
const proxy = { handlers: {} as Record<string, Handler>, calls: [] as Record<string, unknown>[] };
const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  proxy.calls.push(body);
  const h = proxy.handlers[body.action as string];
  const r = h ? h(body) : { ok: false, json: { error: "sem handler" } };
  return { ok: r.ok ?? true, json: async () => r.json };
});

beforeEach(() => {
  proxy.handlers = {};
  proxy.calls = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const syncedIds = () => proxy.calls.filter((c) => c.action === "sync_page").map((c) => c.notionId);

describe("syncNotion — percorre a árvore", () => {
  it("lê raízes e filhos em largura, uma página por requisição, sem repetir", async () => {
    const tree: Record<string, string[]> = { r1: ["a", "b"], r2: ["b", "c"], a: [], b: ["d"], c: [], d: [] };
    proxy.handlers.sync_page = (b) => ({ json: { children: tree[b.notionId as string].map((id) => ({ id, type: "page" })) } });
    const progress: string[] = [];
    const r = await syncNotion("t1", [{ id: "r1", type: "page", title: "R1" }, { id: "r2", type: "page", title: "R2" }], (done, queued, cur) => progress.push(`${done}/${queued}/${cur}`));
    expect(syncedIds()).toEqual(["r1", "r2", "a", "b", "c", "d"]);
    expect(r).toEqual({ synced: 6, failed: 0 });
    expect(progress[0]).toBe("0/2/r1");
    const first = proxy.calls[0];
    expect(first).toMatchObject({ tableId: "t1", notionId: "r1", parentId: null, sortOrder: 0 });
    expect(proxy.calls.find((c) => c.notionId === "d")).toMatchObject({ parentId: "b", sortOrder: 0 });
    expect(new Set(proxy.calls.map((c) => c.runId)).size).toBe(1);
  });

  it("tudo certo: remove páginas antigas (outra execução) e marca a última sincronização", async () => {
    proxy.handlers.sync_page = () => ({ json: { children: [] } });
    await syncNotion("t1", [{ id: "r1", type: "page", title: "R" }], () => {});
    const del = mockDb.writes.find((w) => w.table === "rpg_notion_pages" && w.op === "delete");
    expect(del).toBeTruthy();
    const q = mockDb.queries.find((x) => x.table === "rpg_notion_pages" && x.calls.some(([m]) => m === "delete"))!;
    expect(q.calls.some(([m, a]) => m === "neq" && a[0] === "sync_run")).toBe(true);
    expect(mockDb.writes.find((w) => w.table === "rpg_notion_connections")!.args[0]).toHaveProperty("last_synced_at");
  });

  it("se alguma página falha NÃO apaga nada (uma falha não pode destruir conteúdo bom)", async () => {
    proxy.handlers.sync_page = (b) => (b.notionId === "bad" ? { ok: false, json: { error: "boom" } } : { json: { children: b.notionId === "r1" ? [{ id: "bad", type: "page" }] : [] } });
    const r = await syncNotion("t1", [{ id: "r1", type: "page", title: "R" }], () => {});
    expect(r).toEqual({ synced: 1, failed: 1 });
    expect(mockDb.writes.some((w) => w.op === "delete")).toBe(false);
    expect(mockDb.writes.some((w) => w.table === "rpg_notion_connections")).toBe(false);
  });
});

describe("NotionConnectCard — fluxo", () => {
  it("conectar com sucesso mostra o workspace e some o campo de token", async () => {
    loginAs();
    proxy.handlers.connect = () => ({ json: { workspace_name: "Mesa do Zé", bot_name: "Bot" } });
    mount();
    fireEvent.change(await screen.findByPlaceholderText(/Token da integração/), { target: { value: "ntn_abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar Notion" }));
    expect(await screen.findByText(/Conectado a Mesa do Zé \(Bot\)/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Token da integração/)).not.toBeInTheDocument();
    expect(proxy.calls[0]).toEqual({ action: "connect", tableId: "t1", token: "ntn_abc" });
  });

  it("token recusado mostra o erro do servidor", async () => {
    loginAs();
    proxy.handlers.connect = () => ({ ok: false, json: { error: "Token inválido no Notion" } });
    mount();
    fireEvent.change(await screen.findByPlaceholderText(/Token da integração/), { target: { value: "ruim" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar Notion" }));
    expect(await screen.findByText("Token inválido no Notion")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Token da integração/)).toBeInTheDocument();
  });

  const connected = () => {
    loginAs();
    mockDb.tables.rpg_notion_connections = [{ workspace_name: "W", bot_name: "B", root_pages: [], last_synced_at: null }];
  };
  const items = [
    { id: "n1", type: "page", title: "Campanha", top: true },
    { id: "n2", type: "database", title: "NPCs", top: true },
    { id: "n3", type: "page", title: "Subpágina", top: false },
  ];

  it("lista só as páginas de topo; 'Mostrar subpáginas' revela o resto", async () => {
    connected();
    proxy.handlers.list = () => ({ json: { items } });
    mount();
    fireEvent.click(await screen.findByText("Escolher páginas"));
    expect(await screen.findByText(/Campanha/)).toBeInTheDocument();
    expect(screen.getByText(/NPCs/)).toBeInTheDocument();
    expect(screen.queryByText(/Subpágina/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mostrar também subpáginas"));
    expect(screen.getByText(/Subpágina/)).toBeInTheDocument();
  });

  it("sem páginas compartilhadas explica como compartilhar", async () => {
    connected();
    proxy.handlers.list = () => ({ json: { items: [] } });
    mount();
    fireEvent.click(await screen.findByText("Escolher páginas"));
    expect(await screen.findByText(/Nenhuma página compartilhada com a integração/)).toBeInTheDocument();
  });

  it("marcar páginas, salvar as raízes e sincronizar mostra a contagem e grava", async () => {
    connected();
    proxy.handlers.list = () => ({ json: { items } });
    proxy.handlers.sync_page = (b) => ({ json: { children: b.notionId === "n1" ? [{ id: "n1a", type: "page" }] : [] } });
    mount();
    fireEvent.click(await screen.findByText("Escolher páginas"));
    const sync = await screen.findByRole("button", { name: /Salvar e sincronizar \(0\)/ });
    expect(sync).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Campanha/));
    const sync1 = screen.getByRole("button", { name: /Salvar e sincronizar \(1\)/ });
    expect(sync1).toBeEnabled();
    fireEvent.click(sync1);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "rpg_notion_connections" && "root_pages" in (w.args[0] as object))).toBe(true));
    expect(mockDb.writes.find((w) => "root_pages" in (w.args[0] as object))!.args[0]).toEqual({ root_pages: [{ id: "n1", type: "page", title: "Campanha" }] });
    await waitFor(() => expect(syncedIds()).toEqual(["n1", "n1a"]));
    expect(await screen.findByText(/Raízes: Campanha/)).toBeInTheDocument();
  });

  it("falha parcial mostra o aviso de que nada foi removido", async () => {
    connected();
    proxy.handlers.list = () => ({ json: { items } });
    proxy.handlers.sync_page = (b) => (b.notionId === "n1a" ? { ok: false, json: { error: "x" } } : { json: { children: b.notionId === "n1" ? [{ id: "n1a", type: "page" }] : [] } });
    mount();
    fireEvent.click(await screen.findByText("Escolher páginas"));
    fireEvent.click(await screen.findByLabelText(/Campanha/));
    fireEvent.click(screen.getByRole("button", { name: /Salvar e sincronizar \(1\)/ }));
    expect(await screen.findByText(/1 sincronizadas, 1 falharam \(nada foi removido\)/)).toBeInTheDocument();
    expect(mockDb.writes.some((w) => w.table === "rpg_notion_pages" && w.op === "delete")).toBe(false);
  });

  it("'Sincronizar' refaz as raízes já salvas sem listar de novo", async () => {
    loginAs();
    mockDb.tables.rpg_notion_connections = [{ workspace_name: "W", bot_name: "B", root_pages: [{ id: "n1", type: "page", title: "Campanha" }], last_synced_at: null }];
    proxy.handlers.sync_page = () => ({ json: { children: [] } });
    mount();
    fireEvent.click(await screen.findByText(/Sincronizar/));
    await waitFor(() => expect(syncedIds()).toEqual(["n1"]));
    expect(proxy.calls.some((c) => c.action === "list")).toBe(false);
  });

  it("desconectar pede confirmação e remove a conexão", async () => {
    connected();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByText("Desconectar"));
    expect(confirm).toHaveBeenCalledWith("Desconectar o Notion desta mesa?");
    expect(mockDb.writes.some((w) => w.op === "delete")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Desconectar"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "rpg_notion_connections" && w.op === "delete")).toBe(true));
    expect(await screen.findByRole("button", { name: "Conectar Notion" })).toBeInTheDocument();
    confirm.mockRestore();
  });
});
