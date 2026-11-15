import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginPage } from "@/pages/LoginPage";
import { renderWithProviders } from "./helpers";
import { supabaseMock } from "./supabaseMock";

const fill = async (email: string, senha: string, nome?: string) => {
  if (nome !== undefined)
    fireEvent.change(await screen.findByPlaceholderText("Seu nome"), {
      target: { value: nome },
    });
  fireEvent.change(await screen.findByPlaceholderText("Email"), {
    target: { value: email },
  });
  fireEvent.change(await screen.findByPlaceholderText("Senha (mínimo 6 caracteres)"), {
    target: { value: senha },
  });
};
const submit = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));

describe("LoginPage — interações", () => {
  it("exige e-mail e senha", async () => {
    renderWithProviders(<LoginPage />);
    await screen.findByPlaceholderText("Email");
    submit("Entrar");
    expect(await screen.findByText("Preencha todos os campos")).toBeInTheDocument();
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejeita senha curta", async () => {
    renderWithProviders(<LoginPage />);
    await fill("a@b.com", "123");
    submit("Entrar");
    expect(
      await screen.findByText("Senha deve ter pelo menos 6 caracteres"),
    ).toBeInTheDocument();
  });

  it("faz login com e-mail normalizado", async () => {
    renderWithProviders(<LoginPage />);
    await fill("  Fulano@Test.com ", "segredo1");
    submit("Entrar");
    await waitFor(() =>
      expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "fulano@test.com",
        password: "segredo1",
      }),
    );
  });

  it("traduz erro de credenciais inválidas", async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    } as never);
    renderWithProviders(<LoginPage />);
    await fill("a@b.com", "segredo1");
    submit("Entrar");
    expect(await screen.findByText("Email ou senha incorretos")).toBeInTheDocument();
  });

  it("alterna para criar conta e valida o nome", async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(await screen.findByText("Não tem conta? Criar agora"));
    await fill("a@b.com", "segredo1", "A");
    submit("Criar conta");
    expect(
      await screen.findByText("Nome deve ter pelo menos 2 caracteres"),
    ).toBeInTheDocument();
  });

  it("cria conta e volta para o login com aviso de confirmação", async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(await screen.findByText("Não tem conta? Criar agora"));
    await fill("novo@test.com", "segredo1", "Maria Souza");
    submit("Criar conta");
    expect(await screen.findByText(/Conta criada!/)).toBeInTheDocument();
    expect(supabaseMock.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "novo@test.com",
        options: { data: { full_name: "Maria Souza", display_name: "Maria Souza" } },
      }),
    );
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
