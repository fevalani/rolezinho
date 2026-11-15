import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { RachaContaPage } from "@/features/racha-conta/RachaContaPage";
import { createExpense, updateExpense, deleteExpense, createPayment } from "@/features/racha-conta/rachaContaService";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const seedGroup = () => {
  mockDb.tables.split_group_members = [
    { id: "m1", group_id: "g1", profile_id: "user-1", external_name: null, profiles: { id: "user-1", display_name: "Fulano", avatar_url: null } },
    { id: "m2", group_id: "g1", profile_id: null, external_name: "Zé Externo", profiles: null },
  ];
  mockDb.tables.split_groups = [{ id: "g1", name: "Viagem Rio", emoji: "🏖️", created_by: "user-1", created_at: "" }];
  mockDb.tables.split_expenses = [
    { id: "e1", group_id: "g1", name: "Pizza", amount: "100", paid_by_member: "m1", split_type: "equal", splits: {}, category: "alimentação", date: "2026-06-01", created_by: "user-1", created_at: "1" },
  ];
  mockDb.tables.split_expense_participants = [
    { expense_id: "e1", member_id: "m1" },
    { expense_id: "e1", member_id: "m2" },
  ];
};

const openGroup = async () => {
  loginAs();
  seedGroup();
  renderWithProviders(<RachaContaPage />);
  fireEvent.click((await screen.findAllByText("Viagem Rio"))[0]);
  await screen.findByText("Total gasto");
};

describe("Racha Conta — detalhe do grupo", () => {
  it("mostra o resumo e a dívida pendente", async () => {
    await openGroup();
    expect(screen.getByText("Total gasto")).toBeInTheDocument();
    expect(screen.getByText("Você recebe")).toBeInTheDocument();
    expect(screen.getByText("Você deve")).toBeInTheDocument();
    expect(screen.getByText("Você vai receber")).toBeInTheDocument();
    expect(screen.getByText(/Zé Externo/)).toBeInTheDocument();
    expect(screen.getAllByText(/50[.,]00/).length).toBeGreaterThan(0);
  });

  it("'Marcar pago' grava o pagamento da dívida", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Marcar pago ✓"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_payments" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "split_payments")!.args[0]).toMatchObject({
      group_id: "g1",
      from_member_id: "m2",
      to_member_id: "m1",
      amount: 50,
    });
  });

  it("aba Gastos lista o gasto com valor e quem pagou", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Gastos"));
    expect(await screen.findByText("Pizza")).toBeInTheDocument();
  });

  it("aba Membros mostra as pessoas do grupo", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Membros"));
    expect((await screen.findAllByText(/Zé Externo/)).length).toBeGreaterThan(0);
  });

  it("novo gasto: só habilita 'Salvar Gasto' com descrição e valor; grava com os participantes", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Gastos"));
    fireEvent.click(await screen.findByText("+ Novo gasto"));
    const save = await screen.findByRole("button", { name: "Salvar Gasto" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Ex: Pizza da sexta"), { target: { value: "  Uber  " } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "30" } });
    expect(save).toBeEnabled();
    mockDb.tables.split_expenses = [{ id: "novo", group_id: "g1", name: "Uber", amount: 30, paid_by_member: "m1", split_type: "equal", splits: {}, category: "alimentação", date: "2026-06-02", created_by: "user-1", created_at: "2" }];
    fireEvent.click(save);
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_expenses" && w.op === "insert")).toBe(true));
    expect(mockDb.writes.find((w) => w.table === "split_expenses")!.args[0]).toMatchObject({
      group_id: "g1",
      name: "Uber",
      amount: 30,
      split_type: "equal",
      created_by: "user-1",
    });
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_expense_participants")).toBe(true));
  });

  it("divisão por valores só aceita quando a soma fecha com o total", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Gastos"));
    fireEvent.click(await screen.findByText("+ Novo gasto"));
    fireEvent.change(await screen.findByPlaceholderText("Ex: Pizza da sexta"), { target: { value: "Jantar" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "100" } });
    const save = screen.getByRole("button", { name: "Salvar Gasto" });
    expect(save).toBeEnabled();
    // troca para divisão personalizada: sem valores digitados a soma não fecha
    fireEvent.click(screen.getAllByRole("button").find((b) => /valor|personaliz|custom/i.test(b.textContent ?? ""))!);
    expect(await screen.findByText(/A soma dos valores deve ser igual ao total/)).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it("excluir gasto pede confirmação: cancelar não apaga, confirmar apaga", async () => {
    await openGroup();
    fireEvent.click(screen.getByText("Gastos"));
    await screen.findByText("Pizza");
    const openConfirm = async () => {
      const del = screen.getAllByRole("button").find((b) => /🗑|✕/.test(b.textContent ?? ""));
      expect(del).toBeTruthy();
      fireEvent.click(del!);
    };
    await openConfirm();
    fireEvent.click(await screen.findByText("Cancelar"));
    expect(mockDb.writes.some((w) => w.table === "split_expenses" && w.op === "delete")).toBe(false);
    await openConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "split_expenses" && w.op === "delete")).toBe(true));
  });
});

describe("Racha Conta — serviço de gastos e pagamentos", () => {
  const input = {
    groupId: "g1",
    name: "Pizza",
    amount: 100,
    paidByMemberId: "m1",
    splitType: "equal" as const,
    participantMemberIds: ["m1", "m2"],
    splits: {},
    category: "alimentação" as const,
    date: "2026-06-01",
    myProfileId: "user-1",
  };
  const row = { id: "e9", group_id: "g1", name: "Pizza", amount: "100", paid_by_member: "m1", split_type: "equal", splits: {}, category: "alimentação", date: "2026-06-01", created_by: "user-1", created_at: "x" };

  it("createExpense grava o gasto e os participantes", async () => {
    mockDb.tables.split_expenses = [row];
    const r = await createExpense(input);
    expect(r).toMatchObject({ id: "e9", amount: 100, participant_ids: ["m1", "m2"] });
    expect(mockDb.writes[1].args[0]).toEqual([
      { expense_id: "e9", member_id: "m1" },
      { expense_id: "e9", member_id: "m2" },
    ]);
  });
  it("createExpense falhando = null e não grava participantes", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.errors.split_expenses = { message: "rls" };
    expect(await createExpense(input)).toBeNull();
    expect(mockDb.writes.some((w) => w.table === "split_expense_participants")).toBe(false);
    spy.mockRestore();
  });
  it("createExpense: erro nos participantes = null", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.tables.split_expenses = [row];
    mockDb.errors.split_expense_participants = { message: "x" };
    expect(await createExpense(input)).toBeNull();
    spy.mockRestore();
  });
  it("updateExpense só atualiza gasto do próprio criador e refaz os participantes", async () => {
    mockDb.tables.split_expenses = [row];
    const r = await updateExpense({ ...input, expenseId: "e9", participantMemberIds: ["m1"] });
    expect(r).toMatchObject({ id: "e9", participant_ids: ["m1"] });
    expect(mockDb.writes.map((w) => `${w.table}:${w.op}`)).toEqual([
      "split_expenses:update",
      "split_expense_participants:delete",
      "split_expense_participants:insert",
    ]);
  });
  it("updateExpense sem permissão (nada atualizado) = null", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await updateExpense({ ...input, expenseId: "e9" })).toBeNull();
    expect(mockDb.writes).toHaveLength(1);
    spy.mockRestore();
  });
  it("deleteExpense: true no sucesso, false no erro", async () => {
    expect(await deleteExpense("e9", "user-1")).toBe(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.errors.split_expenses = { message: "rls" };
    expect(await deleteExpense("e9", "user-1")).toBe(false);
    spy.mockRestore();
  });
  it("createPayment grava e devolve o pagamento", async () => {
    mockDb.tables.split_payments = [{ id: "p1", group_id: "g1", from_member_id: "m2", to_member_id: "m1", amount: "50", date: "2026-06-01", created_at: "x" }];
    expect(await createPayment({ groupId: "g1", fromMemberId: "m2", toMemberId: "m1", amount: 50, myProfileId: "user-1" })).toMatchObject({ id: "p1", amount: 50, settled: true });
    expect(mockDb.writes[0].args[0]).toMatchObject({ from_member_id: "m2", to_member_id: "m1", amount: 50, created_by: "user-1" });
  });
  it("createPayment com erro = null", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.errors.split_payments = { message: "rls" };
    expect(await createPayment({ groupId: "g1", fromMemberId: "a", toMemberId: "b", amount: 1, myProfileId: "u" })).toBeNull();
    spy.mockRestore();
  });
});
