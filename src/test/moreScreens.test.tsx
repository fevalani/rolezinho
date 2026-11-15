import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { BolaoPage } from "@/features/bolao/BolaoPage";
import { RpgHomePage } from "@/features/rpg/RpgHomePage";
import { CulturaPage } from "@/features/cultura/CulturaPage";
import { RachaContaPage } from "@/features/racha-conta/RachaContaPage";
import { fetchGroups, createGroup } from "@/features/racha-conta/rachaContaService";
import { currentWeekStr } from "@/features/cultura/culturaService";
import { loginAs } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

function Ready({ children }: { children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  return loading || (user && !profile) ? null : <>{children}</>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const mount = (el: ReactNode, route = "/x") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Ready>
          <Where />
          <Routes>
            <Route path="/x" element={el} />
            <Route path="*" element={<div>destino</div>} />
          </Routes>
        </Ready>
      </AuthProvider>
    </MemoryRouter>,
  );

const pool = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Bolão dos Amigos",
  championship_id: "c1",
  created_by: "u9",
  created_at: "",
  updated_at: "",
  bolao_championships: { id: "c1", name: "Copa do Mundo", code: "WC" },
  bolao_pool_members: [{ user_id: "user-1" }, { user_id: "u2" }],
  ...over,
});

describe("BolaoPage com dados", () => {
  it("separa 'meus bolões' dos outros e mostra campeonato e participantes", async () => {
    loginAs();
    mockDb.tables.bolao_pools = [
      pool(),
      pool({ id: "p2", name: "Bolão do Trabalho", bolao_pool_members: [{ user_id: "u2" }] }),
    ];
    mount(<BolaoPage />);
    expect(await screen.findByText("Bolão dos Amigos")).toBeInTheDocument();
    expect(screen.getByText("Bolão do Trabalho")).toBeInTheDocument();
    expect(screen.getAllByText("Copa do Mundo").length).toBeGreaterThan(0);
    expect(screen.getByText("2 participantes")).toBeInTheDocument();
    expect(screen.getByText("1 participante")).toBeInTheDocument();
    expect(screen.getByText("Ver palpites")).toBeInTheDocument();
    expect(screen.getByText("Entrar")).toBeInTheDocument();
  });

  it("'Ver palpites' abre o bolão", async () => {
    loginAs();
    mockDb.tables.bolao_pools = [pool()];
    mount(<BolaoPage />);
    fireEvent.click(await screen.findByText("Ver palpites"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/bolao/p1"));
  });

  it("'Entrar' registra a participação do usuário", async () => {
    loginAs();
    mockDb.tables.bolao_pools = [pool({ bolao_pool_members: [{ user_id: "u2" }] })];
    mount(<BolaoPage />);
    fireEvent.click(await screen.findByText("Entrar"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "bolao_pool_members" && w.op === "insert")).toBe(true),
    );
    expect(mockDb.writes.find((w) => w.op === "insert")!.args[0]).toEqual({ pool_id: "p1", user_id: "user-1" });
  });
});

describe("RpgHomePage com dados e fluxos", () => {
  it("lista mesas e fichas e navega ao clicar", async () => {
    loginAs();
    mockDb.tables.rpg_tables = [{ id: "t1", name: "Curse of Strahd", master_id: "user-1", is_active: true, updated_at: "2026-01-01T00:00:00Z" }];
    mockDb.tables.rpg_table_members = [{ table_id: "t1" }];
    mockDb.tables.rpg_sheets = [{ id: "s1", character_name: "Thorin", race: "Anão", class_name: "Guerreiro", level: 5, user_id: "user-1" }];
    mount(<RpgHomePage />);
    expect(await screen.findByText("Curse of Strahd")).toBeInTheDocument();
    expect(screen.getByText("Mestre")).toBeInTheDocument();
    expect(screen.getByText("Thorin")).toBeInTheDocument();
    expect(screen.getByText("Nível 5")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Curse of Strahd"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/rpg/mesa/t1"));
  });

  it("criar mesa exige nome e leva para a mesa criada", async () => {
    loginAs();
    mockDb.tables.rpg_tables = [{ id: "nova-mesa", name: "Nova" }];
    mount(<RpgHomePage />);
    fireEvent.click(await screen.findByText("+ Nova Mesa"));
    const create = await screen.findByRole("button", { name: "Criar Mesa" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Ex: A Maldição de Strahd"), { target: { value: "  Nova  " } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/rpg/mesa/nova-mesa"));
    expect(mockDb.writes.find((w) => w.table === "rpg_tables")!.args[0]).toMatchObject({ name: "Nova", master_id: "user-1" });
  });

  it("criar ficha leva para a ficha criada", async () => {
    loginAs();
    mockDb.tables.rpg_sheets = [{ id: "nova-ficha", character_name: "Thorin" }];
    mount(<RpgHomePage />);
    fireEvent.click(await screen.findByText("+ Nova Ficha"));
    fireEvent.change(await screen.findByPlaceholderText("Ex: Thorin Escudobreaker"), { target: { value: "Thorin" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ficha" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/rpg/ficha/nova-ficha"));
  });

  it("entrar por código inválido mostra o erro e não navega", async () => {
    loginAs();
    mount(<RpgHomePage />);
    fireEvent.click(await screen.findByText("Entrar", { selector: "button" }));
    fireEvent.change(await screen.findByPlaceholderText("Ex: ABC123"), { target: { value: "zzzzzz" } });
    expect(screen.getByRole("button", { name: "Entrar na Mesa" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na Mesa" }));
    expect(await screen.findByText("Código de convite inválido.")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/x");
  });
});

describe("CulturaPage com dados", () => {
  it("estado vazio", async () => {
    loginAs();
    mount(<CulturaPage />);
    expect(await screen.findByText("Nenhuma indicação ainda.")).toBeInTheDocument();
  });

  it("mostra a indicação com título, autor e a nota média", async () => {
    loginAs();
    mockDb.tables.cultura_posts = [{ id: "p1", user_id: "u2", item_id: "i1", comment: "Imperdível", personal_rating: 8, posted_week: currentWeekStr(), created_at: "" }];
    mockDb.tables.cultura_items = [{ id: "i1", type: "movie", title: "Matrix", subtitle: null, year: 1999, cover_url: null, genres: [] }];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    mount(<CulturaPage />);
    fireEvent.click(await screen.findByText("Matrix")); // expande o card
    expect(await screen.findByText(/Imperdível/)).toBeInTheDocument();
    expect(screen.getAllByText(/Beltrano/).length).toBeGreaterThan(0);
    expect(screen.getByText("Esta semana")).toBeInTheDocument();
  });

  it("'Indicar' abre o formulário de indicação", async () => {
    loginAs();
    mount(<CulturaPage />);
    fireEvent.click(await screen.findByText("Indicar", { selector: "button" }));
    expect(await screen.findByText("Indicar Arte")).toBeInTheDocument();
  });
});

describe("Racha Conta", () => {
  it("home vazia convida a criar o primeiro grupo", async () => {
    loginAs();
    mount(<RachaContaPage />);
    expect(await screen.findByText("Crie seu primeiro grupo para começar")).toBeInTheDocument();
  });

  const seedGroup = () => {
    mockDb.tables.split_group_members = [
      { id: "m1", group_id: "g1", profile_id: "user-1", external_name: null, profiles: { id: "user-1", display_name: "Fulano", avatar_url: null } },
      { id: "m2", group_id: "g1", profile_id: null, external_name: "Zé Externo", profiles: null },
    ];
    mockDb.tables.split_groups = [{ id: "g1", name: "Viagem Rio", emoji: "🏖️", created_by: "user-1", created_at: "" }];
    mockDb.tables.split_expenses = [
      { id: "e1", group_id: "g1", name: "Pizza", amount: "100", paid_by_member: "m1", split_type: "equal", splits: {}, category: "alimentação", date: "2026-06-01", created_by: "m1", created_at: "1" },
    ];
    mockDb.tables.split_expense_participants = [
      { expense_id: "e1", member_id: "m1" },
      { expense_id: "e1", member_id: "m2" },
    ];
  };

  it("fetchGroups monta membros (app e externos), gastos e participantes", async () => {
    seedGroup();
    const [g] = await fetchGroups("user-1");
    expect(g).toMatchObject({ name: "Viagem Rio", emoji: "🏖️" });
    expect(g.members).toHaveLength(2);
    expect(g.members.find((m) => m.id === "m1")).toMatchObject({ is_me: true, is_app_user: true, display_name: "Fulano" });
    expect(g.members.find((m) => m.id === "m2")).toMatchObject({ is_me: false, is_app_user: false, display_name: "Zé Externo" });
    expect(g.expenses[0]).toMatchObject({ name: "Pizza", amount: 100, paid_by: "m1", participant_ids: ["m1", "m2"] });
  });
  it("sem grupos = vazio", async () => {
    expect(await fetchGroups("user-1")).toEqual([]);
  });
  it("createGroup usa a RPC atômica, inclui o criador uma vez e devolve o id", async () => {
    mockDb.rpcResults.create_split_group = "g-novo";
    supabaseMock.rpc.mockClear();
    expect(await createGroup({ name: "Viagem", emoji: "🏖️", myProfileId: "user-1", appMemberProfileIds: ["user-1", "u2"], externalMemberNames: ["Zé"] })).toBe("g-novo");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("create_split_group", { p_name: "Viagem", p_emoji: "🏖️", p_app_ids: ["user-1", "u2"], p_ext_names: ["Zé"] });
  });
  it("createGroup com falha devolve null", async () => {
    mockDb.errors["rpc:create_split_group"] = { message: "rls" };
    const spy = vi_spy();
    expect(await createGroup({ name: "V", emoji: "x", myProfileId: "u", appMemberProfileIds: [], externalMemberNames: [] })).toBeNull();
    spy.mockRestore();
  });

  it("a home mostra o grupo e o total gasto", async () => {
    loginAs();
    seedGroup();
    mount(<RachaContaPage />);
    expect((await screen.findAllByText("Viagem Rio")).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 pessoas · R\$ 100\.00 total/)).toBeInTheDocument();
  });
});

import { vi } from "vitest";
function vi_spy() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}
