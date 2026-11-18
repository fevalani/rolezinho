import { describe, it, expect, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { UsersSection } from "@/features/admin/UsersSection";
import { ADMIN_USER, loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const env = import.meta.env as Record<string, string | undefined>;
afterEach(() => {
  delete env.VITE_APP_VERSION;
});

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("UsersSection", () => {
  const open = async () => {
    loginAs(ADMIN_USER);
    mockDb.tables.profiles = [
      { id: "admin-1", display_name: "Admin", email: "valanife@gmail.com", app_version: "web 0.0.90", app_last_seen_at: days(0) },
      { id: "u2", display_name: "Beto Lima", email: "beto@x.com", app_version: "1.0.2 (12) · web 0.0.80", app_last_seen_at: days(10) },
      { id: "u3", display_name: "Caio Dias", email: "caio@x.com", app_version: null, app_last_seen_at: null },
    ];
    renderWithProviders(<UsersSection />);
    return await screen.findByText("Beto Lima");
  };

  it("lista com última abertura e versão, mais recentes primeiro, quem nunca abriu no fim", async () => {
    env.VITE_APP_VERSION = "0.0.90";
    await open();
    const names = screen.getAllByRole("listitem").map((li) => li.querySelector("span")?.textContent);
    expect(names).toEqual(["Admin", "Beto Lima", "Caio Dias"]);
    expect(screen.getByText(/Última abertura: hoje · web 0\.0\.90/)).toBeInTheDocument();
    expect(screen.getByText(/Última abertura: há 10 dias · web 0\.0\.80 · APK 1\.0\.2/)).toBeInTheDocument();
    expect(screen.getByText(/Última abertura: nunca abriu · versão desconhecida/)).toBeInTheDocument();
  });

  it("resumo e marca 'versão antiga' só para quem está abaixo da atual", async () => {
    env.VITE_APP_VERSION = "0.0.90";
    await open();
    expect(screen.getByLabelText("Resumo")).toHaveTextContent("3 usuários · 1 abriram nos últimos 7 dias · 1 em versão antiga (atual: 0.0.90) · 1 nunca abriram");
    const items = screen.getAllByRole("listitem");
    expect(within(items[1]).getByText("versão antiga")).toBeInTheDocument();
    expect(within(items[0]).queryByText("versão antiga")).not.toBeInTheDocument();
    expect(within(items[2]).queryByText("versão antiga")).not.toBeInTheDocument();
  });

  it("sem versão atual conhecida não aponta ninguém como antigo", async () => {
    await open();
    expect(screen.queryByText("versão antiga")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Resumo")).not.toHaveTextContent("versão antiga");
  });

  it("busca por nome ou e-mail e estado vazio", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Buscar usuário"), { target: { value: "caio@" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Buscar usuário"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum usuário encontrado.")).toBeInTheDocument();
  });

  it("erro do banco = lista vazia, sem quebrar", async () => {
    loginAs(ADMIN_USER);
    renderWithProviders(<UsersSection />);
    mockDb.errors.profiles = { message: "x" };
    await waitFor(() => expect(screen.queryByText("Beto Lima")).not.toBeInTheDocument());
  });
});
