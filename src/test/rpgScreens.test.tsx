import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { RpgTablePage } from "@/features/rpg/RpgTablePage";
import { RpgSheetPage } from "@/features/rpg/RpgSheetView";
import { NotionConnectCard, NotionLibrary } from "@/features/rpg/NotionPanel";
import { connectNotion, listNotionItems, fetchNotionConnection, disconnectNotion, saveNotionRoots, fetchNotionTree, fetchNotionPage } from "@/features/rpg/rpgService";
import { loginAs } from "./helpers";
import { mockDb } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mountAt = (pattern: string, route: string, el: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Ready>
          <Where />
          <Routes>
            <Route path={pattern} element={el} />
            <Route path="*" element={<div>destino</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const sheet = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  user_id: "user-1",
  character_name: "Thorin",
  class_name: "Guerreiro",
  subclass: "",
  race: "Anão",
  background: "Soldado",
  alignment: "Leal e Bom",
  level: 5,
  experience: 0,
  strength: 16,
  dexterity: 12,
  constitution: 14,
  intelligence: 10,
  wisdom: 10,
  charisma: 8,
  max_hp: 44,
  current_hp: 30,
  temp_hp: 0,
  armor_class: 18,
  speed: 25,
  initiative: 1,
  hit_dice: "5d10",
  hit_dice_used: 0,
  saving_throws: {},
  skill_proficiencies: {},
  skill_expertise: {},
  proficiency_bonus: 3,
  personality_traits: "",
  ideals: "",
  bonds: "",
  flaws: "",
  backstory: "",
  equipment: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
  spellcasting_ability: "",
  spell_save_dc: 0,
  spell_attack_bonus: 0,
  spells: {},
  spell_slots: {},
  attacks: [],
  features: [],
  notes: "",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("RpgSheetPage", () => {
  it("mostra a ficha do personagem, com atributos e PV", async () => {
    loginAs();
    mockDb.tables.rpg_sheets = [sheet()];
    mountAt("/rpg/ficha/:sheetId", "/rpg/ficha/s1", <RpgSheetPage />);
    expect(await screen.findByText("Principal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Thorin")).toBeInTheDocument();
    expect(screen.getByText("Combate")).toBeInTheDocument();
    expect(screen.getByText(/30\s*\/\s*44/)).toBeInTheDocument();
  });

  it("o dono vê o botão Salvar; outro jogador não", async () => {
    loginAs();
    mockDb.tables.rpg_sheets = [sheet({ user_id: "outro" })];
    mountAt("/rpg/ficha/:sheetId", "/rpg/ficha/s1", <RpgSheetPage />);
    await screen.findByText("Principal");
    expect(screen.queryByText("Salvar")).not.toBeInTheDocument();
  });

  it("troca de aba", async () => {
    loginAs();
    mockDb.tables.rpg_sheets = [sheet()];
    mountAt("/rpg/ficha/:sheetId", "/rpg/ficha/s1", <RpgSheetPage />);
    fireEvent.click(await screen.findByText("Combate"));
    fireEvent.click(await screen.findByText("Magia"));
    fireEvent.click(await screen.findByText("Principal"));
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("id inválido volta para a lista de RPG", async () => {
    loginAs();
    mountAt("/rpg/ficha/:sheetId", "/rpg/ficha/null", <RpgSheetPage />);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/rpg$/));
  });
});

describe("RpgTablePage", () => {
  it("mesa inexistente mostra aviso e volta", async () => {
    loginAs();
    mountAt("/rpg/mesa/:tableId", "/rpg/mesa/zzz", <RpgTablePage />);
    expect(await screen.findByText("Mesa não encontrada.", {}, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Voltar"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/rpg"));
  });

  it("mostra a mesa existente e as abas Feed, Dado e Aventura", async () => {
    loginAs();
    mockDb.tables.rpg_tables = [{ id: "t1", name: "Curse of Strahd", description: "", master_id: "user-1", is_active: false, invite_code: "ABC123", image_url: null }];
    mountAt("/rpg/mesa/:tableId", "/rpg/mesa/t1", <RpgTablePage />);
    expect(await screen.findByText("Curse of Strahd")).toBeInTheDocument();
    expect(screen.getAllByText(/Feed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dado/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aventura/).length).toBeGreaterThan(0);
  });
});

describe("Notion — serviço", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("connectNotion chama o proxy com a sessão do usuário", async () => {
    loginAs();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ workspace_name: "W", bot_name: "B" }) });
    expect(await connectNotion("t1", "tok")).toEqual({ workspace_name: "W", bot_name: "B" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/notion-proxy");
    expect(JSON.parse(init.body)).toEqual({ action: "connect", tableId: "t1", token: "tok" });
    expect(init.method).toBe("POST");
  });
  it("erro do proxy vira exceção com a mensagem", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Token inválido no Notion" }) });
    await expect(connectNotion("t1", "x")).rejects.toThrow("Token inválido no Notion");
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(listNotionItems("t1")).rejects.toThrow("Erro ao falar com o Notion");
  });
  it("listNotionItems devolve os itens", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: "1", type: "page", title: "A" }] }) });
    expect(await listNotionItems("t1")).toEqual([{ id: "1", type: "page", title: "A" }]);
  });
  it("conexão: lê sem o access_token, desconecta e salva raízes", async () => {
    mockDb.tables.rpg_notion_connections = [{ workspace_name: "W", bot_name: "B", root_pages: [], last_synced_at: null }];
    expect((await fetchNotionConnection("t1"))?.workspace_name).toBe("W");
    await disconnectNotion("t1");
    await saveNotionRoots("t1", [{ id: "n1", type: "page", title: "Raiz" }]);
    expect(mockDb.writes.map((w) => w.op)).toEqual(["delete", "update"]);
    expect(mockDb.writes[1].args[0]).toEqual({ root_pages: [{ id: "n1", type: "page", title: "Raiz" }] });
  });
  it("árvore e página", async () => {
    expect(await fetchNotionTree("t1")).toEqual([]);
    expect(await fetchNotionPage("t1", "n1")).toBeNull();
    mockDb.tables.rpg_notion_pages = [{ notion_id: "n1", title: "Raiz", blocks: [] }];
    expect((await fetchNotionPage("t1", "n1"))?.title).toBe("Raiz");
  });
});

describe("Notion — telas", () => {
  it("sem conexão pede o token e só conecta com token preenchido", async () => {
    loginAs();
    mountAt("/n", "/n", <NotionConnectCard tableId="t1" />);
    const input = await screen.findByPlaceholderText(/Token da integração/);
    const btn = screen.getByRole("button", { name: /Conectar Notion/ });
    expect(btn).toBeDisabled();
    fireEvent.change(input, { target: { value: "ntn_abc" } });
    expect(btn).toBeEnabled();
  });

  it("conectado mostra o workspace, o bot e a opção de desconectar", async () => {
    loginAs();
    mockDb.tables.rpg_notion_connections = [{ workspace_name: "Mesa do Zé", bot_name: "Bot", root_pages: [{ id: "n1", type: "page", title: "Campanha" }], last_synced_at: null }];
    mountAt("/n", "/n", <NotionConnectCard tableId="t1" />);
    expect(await screen.findByText(/Conectado a Mesa do Zé \(Bot\)/)).toBeInTheDocument();
    expect(screen.getByText(/Raízes: Campanha/)).toBeInTheDocument();
    expect(screen.getByText(/Sincronizar/)).toBeInTheDocument();
    expect(screen.getByText("Desconectar")).toBeInTheDocument();
  });

  it("a biblioteca não aparece sem páginas sincronizadas", async () => {
    loginAs();
    mountAt("/n", "/n", <NotionLibrary tableId="t1" />);
    await waitFor(() => expect(document.body.textContent).not.toContain("📚 Notion"));
  });

  it("navega pela árvore e mostra o conteúdo formatado", async () => {
    loginAs();
    mockDb.tables.rpg_notion_pages = [
      {
        notion_id: "n1",
        parent_notion_id: null,
        type: "page",
        title: "Campanha",
        icon: "🏰",
        sort_order: 0,
        blocks: [
          { id: "b1", type: "heading_1", text: [{ t: "Capítulo 1" }] },
          { id: "b2", type: "paragraph", text: [{ t: "Era uma vez " }, { t: "um anão", b: true }] },
          { id: "b3", type: "bulleted_list_item", text: [{ t: "Item A" }] },
        ],
      },
    ];
    mountAt("/n", "/n", <NotionLibrary tableId="t1" />);
    fireEvent.click(await screen.findByText(/Campanha/));
    expect(await screen.findByText("Capítulo 1")).toBeInTheDocument();
    expect(screen.getByText("um anão").closest("strong")).not.toBeNull();
    expect(screen.getByText("Item A")).toBeInTheDocument();
    // voltar para a raiz pela trilha
    fireEvent.click(screen.getByText("📚 Notion"));
    await waitFor(() => expect(screen.queryByText("Capítulo 1")).not.toBeInTheDocument());
  });
});
