import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { useAdmin } from "@/lib/useAdmin";
import { ADMIN_USER, TEST_USER, loginAs } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

function Probe() {
  const { isAdmin, loading } = useAdmin();
  const { user } = useAuth();
  return <div data-testid="p">{`${user ? "logado" : "anon"}|${loading ? "carregando" : "pronto"}|${isAdmin ? "admin" : "comum"}`}</div>;
}
const mount = () => render(<MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter>);
const text = () => screen.getByTestId("p").textContent;

describe("papel de admin vem do banco (is_app_admin)", () => {
  beforeEach(() => {
    mockDb.reset();
    supabaseMock.rpc.mockClear();
  });

  it("admin: começa 'carregando' (não decide antes da hora) e vira admin", async () => {
    loginAs(ADMIN_USER);
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|admin"));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("is_app_admin");
  });

  it("usuário comum: não é admin", async () => {
    loginAs(TEST_USER);
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|comum"));
  });

  it("o e-mail não decide nada: o banco diz que não é admin", async () => {
    loginAs(ADMIN_USER);
    mockDb.rpcResults.is_app_admin = false;
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|comum"));
  });

  it("e quem recebeu o cargo pelo painel é admin, mesmo com outro e-mail", async () => {
    loginAs(TEST_USER);
    mockDb.rpcResults.is_app_admin = true;
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|admin"));
  });

  it("erro na função (sem rede / migration pendente) = não é admin", async () => {
    loginAs(ADMIN_USER);
    mockDb.errors["rpc:is_app_admin"] = { message: "function does not exist" };
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|comum"));
  });

  it("valor que não é exatamente true não vira admin", async () => {
    loginAs(ADMIN_USER);
    mockDb.rpcResults.is_app_admin = "true";
    mount();
    await waitFor(() => expect(text()).toBe("logado|pronto|comum"));
  });

  it("deslogado: sem carregar e sem consultar o banco", async () => {
    mount();
    await waitFor(() => expect(text()).toBe("anon|pronto|comum"));
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith("is_app_admin");
  });
});
