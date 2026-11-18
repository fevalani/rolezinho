import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AdminsSection } from "@/features/admin/AdminsSection";
import { ADMIN_USER, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const profiles = [
  { id: "admin-1", display_name: "Admin", email: "valanife@gmail.com" },
  { id: "u2", display_name: "Beto Lima", email: "beto@x.com" },
  { id: "u3", display_name: "Caio Dias", email: "caio@x.com" },
];

describe("AdminsSection", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  const open = async (adminIds: string[]) => {
    loginAs(ADMIN_USER);
    mockDb.tables.profiles = [...profiles, ...(mockDb.tables.profiles ?? [])].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
    mockDb.tables.app_admins = adminIds.map((user_id) => ({ user_id }));
    renderWithProviders(<AdminsSection />);
    const list = await screen.findByRole("region", { name: "Administradores atuais" });
    await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(adminIds.length)); // espera carregar
    return list;
  };

  it("lista os admins (você marcado) e os candidatos", async () => {
    const list = await open(["admin-1", "u2"]);
    expect(within(list).getByText("Admin")).toBeInTheDocument();
    expect(within(list).getByText("(você)")).toBeInTheDocument();
    expect(within(list).getByText("Beto Lima")).toBeInTheDocument();
    const add = screen.getByRole("region", { name: "Adicionar administrador" });
    expect(within(add).getByText("Caio Dias")).toBeInTheDocument();
    expect(within(add).queryByText("Beto Lima")).not.toBeInTheDocument(); // já é admin
  });

  it("não deixa remover a si mesmo; remove outro com confirmação", async () => {
    const list = await open(["admin-1", "u2"]);
    expect(within(list).getByRole("button", { name: "Remover Admin" })).toBeDisabled();
    fireEvent.click(within(list).getByRole("button", { name: "Remover Beto Lima" }));
    expect(await screen.findByText("Beto Lima não é mais administrador.")).toBeInTheDocument();
    const del = mockDb.writes.find((w) => w.table === "app_admins" && w.op === "delete");
    expect(del).toBeDefined();
    const q = mockDb.queries.filter((x) => x.table === "app_admins").flatMap((x) => x.calls);
    expect(q).toContainEqual(["eq", ["user_id", "u2"]]);
  });

  it("com um único admin, nem o botão dele funciona", async () => {
    const list = await open(["admin-1"]);
    expect(within(list).getByRole("button", { name: "Remover Admin" })).toBeDisabled();
  });

  it("cancelar a confirmação não remove ninguém", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const list = await open(["admin-1", "u2"]);
    fireEvent.click(within(list).getByRole("button", { name: "Remover Beto Lima" }));
    expect(mockDb.writes.some((w) => w.table === "app_admins" && w.op === "delete")).toBe(false);
  });

  it("adiciona um usuário e filtra a busca", async () => {
    await open(["admin-1"]);
    const add = screen.getByRole("region", { name: "Adicionar administrador" });
    fireEvent.change(within(add).getByLabelText("Buscar usuário"), { target: { value: "caio" } });
    expect(within(add).queryByText("Beto Lima")).not.toBeInTheDocument();
    fireEvent.click(within(add).getByRole("button", { name: "Tornar Caio Dias administrador" }));
    expect(await screen.findByText("Caio Dias agora é administrador.")).toBeInTheDocument();
    const w = mockDb.writes.find((x) => x.table === "app_admins" && x.op === "insert")!;
    expect(w.args[0]).toEqual({ user_id: "u3", added_by: "admin-1" });
  });

  it("mostra o erro do banco (ex.: sem permissão)", async () => {
    await open(["admin-1"]);
    mockDb.errors.app_admins = { message: "permission denied" };
    fireEvent.click(screen.getByRole("button", { name: "Tornar Beto Lima administrador" }));
    expect(await screen.findByText("Erro: permission denied")).toBeInTheDocument();
  });
});
