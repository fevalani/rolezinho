import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { RachaContaPage } from "@/features/racha-conta/RachaContaPage";
import { updateGroup } from "@/features/racha-conta/rachaContaService";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

const seedGroup = () => {
  mockDb.tables.split_group_members = [
    { id: "m1", group_id: "g1", profile_id: "user-1", external_name: null, profiles: { id: "user-1", display_name: "Fulano", avatar_url: null } },
    { id: "m2", group_id: "g1", profile_id: null, external_name: "Zé Externo", profiles: null },
  ];
  mockDb.tables.split_groups = [{ id: "g1", name: "Viagem Rio", emoji: "🏖️", created_by: "user-1", created_at: "" }];
  mockDb.tables.split_expenses = [
    { id: "e1", group_id: "g1", name: "Pizza", amount: "100", paid_by_member: "m1", split_type: "equal", splits: {}, category: "alimentação", date: "2026-06-01", created_by: "user-1", created_at: "1" },
  ];
  mockDb.tables.split_expense_participants = [{ expense_id: "e1", member_id: "m1" }, { expense_id: "e1", member_id: "m2" }];
};

describe("Racha Conta — novo grupo", () => {
  const open = async () => {
    loginAs();
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null, email: "b@t.com" });
    renderWithProviders(<RachaContaPage />);
    fireEvent.click(await screen.findByText("+ Grupo"));
    return screen.findByPlaceholderText("Ex: Viagem Rio");
  };

  it("'Salvar' só habilita com nome", async () => {
    const name = await open();
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: "  " } });
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: "Churrasco" } });
    expect(save).toBeEnabled();
  });

  it("lista os outros usuários (sem eu mesmo) e cria o grupo com membros do app e externos", async () => {
    const name = await open();
    expect(await screen.findByText("Beltrano")).toBeInTheDocument();
    expect(screen.queryByText("Fulano", { selector: "span, div" })).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Churrasco" } });
    fireEvent.click(screen.getByText("🍕"));
    fireEvent.click(screen.getByText("Beltrano"));
    fireEvent.change(screen.getByPlaceholderText("Nome da pessoa"), { target: { value: "  Tio Zé " } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(screen.getByText("Tio Zé")).toBeInTheDocument();
    mockDb.rpcResults.create_split_group = "g-novo";
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("create_split_group", { p_name: "Churrasco", p_emoji: "🍕", p_app_ids: ["user-1", "u2"], p_ext_names: ["Tio Zé"] }));
  });

  it("dá para tirar um externo da lista antes de salvar", async () => {
    const name = await open();
    fireEvent.change(name, { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText("Nome da pessoa"), { target: { value: "Fulano Externo" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    const xs = screen.getAllByText("✕", { selector: "button" });
    fireEvent.click(xs[xs.length - 1]); // o ✕ do externo vem depois do ✕ de fechar o modal
    expect(screen.queryByText("Fulano Externo")).not.toBeInTheDocument();
  });

  it("selecionar de novo desmarca o usuário", async () => {
    const name = await open();
    fireEvent.change(name, { target: { value: "X" } });
    fireEvent.click(await screen.findByText("Beltrano"));
    fireEvent.click(screen.getByText("Beltrano"));
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalledWith("create_split_group", expect.objectContaining({ p_app_ids: ["user-1"] })));
  });

  it("Cancelar fecha sem criar nada", async () => {
    await open();
    supabaseMock.rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByPlaceholderText("Ex: Viagem Rio")).not.toBeInTheDocument());
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("create_split_group", expect.anything());
  });
});

describe("Racha Conta — editar", () => {
  const openGroup = async () => {
    loginAs();
    seedGroup();
    renderWithProviders(<RachaContaPage />);
    fireEvent.click((await screen.findAllByText("Viagem Rio"))[0]);
    await screen.findByText("Total gasto");
  };

  it("editar grupo abre o formulário com o nome atual e salva só o criador (filtro created_by)", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("✏️"));
    const name = await screen.findByDisplayValue("Viagem Rio");
    fireEvent.change(name, { target: { value: "Viagem Rio 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_groups" && w.op === "update")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "split_groups")!.args[0]).toMatchObject({ name: "Viagem Rio 2026" });
    const q = mockDb.queries.filter((x) => x.table === "split_groups").find((x) => x.calls.some(([m]) => m === "update"))!;
    expect(q.calls.some(([m, a]) => m === "eq" && a[0] === "created_by" && a[1] === "user-1")).toBe(true);
  });

  it("editar gasto abre o formulário preenchido e grava a alteração", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Gastos"));
    fireEvent.click(await screen.findByText("✏️ Editar"));
    expect(await screen.findByText("Editar Gasto")).toBeInTheDocument();
    const desc = screen.getByDisplayValue("Pizza");
    const valor = screen.getByDisplayValue("100");
    fireEvent.change(desc, { target: { value: "Pizza grande" } });
    fireEvent.change(valor, { target: { value: "120" } });
    mockDb.tables.split_expenses = [{ ...mockDb.tables.split_expenses[0], name: "Pizza grande", amount: "120" }];
    fireEvent.click(screen.getByRole("button", { name: "Salvar Gasto" }));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_expenses" && w.op === "update")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "split_expenses" && w.op === "update")!.args[0]).toMatchObject({ name: "Pizza grande", amount: 120, split_type: "equal" });
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_expense_participants" && w.op === "insert")).toBe(true));
  });

  it("'← Voltar' retorna para a lista de grupos", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("← Voltar"));
    expect(await screen.findByText("Racha Conta")).toBeInTheDocument();
  });
});

describe("updateGroup (serviço)", () => {
  it("renomear grava nome/emoji só do criador", async () => {
    expect(await updateGroup({ groupId: "g1", name: "Novo", emoji: "🎉" }, "user-1")).toBe(true);
    expect(mockDb.writes[0].args[0]).toEqual({ name: "Novo", emoji: "🎉" });
  });
  it("sem nome nem emoji não atualiza o grupo", async () => {
    await updateGroup({ groupId: "g1", addExternalNames: ["Zé"] }, "user-1");
    expect(mockDb.writes.some((w) => w.table === "split_groups")).toBe(false);
  });
  it("erro ao renomear (não é o criador) interrompe e devolve false", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.errors.split_groups = { message: "rls" };
    expect(await updateGroup({ groupId: "g1", name: "X", addExternalNames: ["Zé"] }, "u2")).toBe(false);
    expect(mockDb.writes.some((w) => w.table === "split_group_members")).toBe(false);
    spy.mockRestore();
  });
  it("adiciona membros do app (ignorando duplicados), externos e remove membros", async () => {
    await updateGroup({ groupId: "g1", addAppMemberProfileIds: ["u2"], addExternalNames: ["Tio Zé"], removeMemberIds: ["m9"] }, "user-1");
    const ops = mockDb.writes.map((w) => `${w.table}:${w.op}`);
    expect(ops).toEqual(["split_group_members:upsert", "split_group_members:delete", "split_group_members:insert"]);
    expect(mockDb.writes[0].args[0]).toEqual([{ group_id: "g1", profile_id: "u2", external_name: null, avatar_letter: "?" }]);
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "group_id,profile_id", ignoreDuplicates: true });
    expect(mockDb.writes[2].args[0]).toEqual([{ group_id: "g1", profile_id: null, external_name: "Tio Zé", avatar_letter: "TZ" }]);
  });
});
