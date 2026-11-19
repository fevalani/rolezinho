import { describe, it, expect, beforeEach } from "vitest";
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

describe("LoginPage — esqueci minha senha", () => {
  beforeEach(() => {
    supabaseMock.auth.signInWithPassword.mockClear();
    supabaseMock.auth.resetPasswordForEmail.mockClear();
  });

  const openForgot = async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(await screen.findByText("Esqueci minha senha"));
  };

  it("o link só aparece no modo login e troca o formulário (sem campo de senha)", async () => {
    await openForgot();
    expect(screen.getByRole("button", { name: "Enviar link" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Senha (mínimo 6 caracteres)")).not.toBeInTheDocument();
    expect(screen.queryByText("Esqueci minha senha")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Voltar para o login"));
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("exige o e-mail", async () => {
    await openForgot();
    submit("Enviar link");
    expect(await screen.findByText("Informe seu email")).toBeInTheDocument();
    expect(supabaseMock.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("envia o link com e-mail normalizado e redirectTo para este site, com aviso neutro", async () => {
    await openForgot();
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "  Fulano@Test.com " } });
    submit("Enviar link");
    expect(await screen.findByText(/Se esse email tiver uma conta/)).toBeInTheDocument();
    expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledWith("fulano@test.com", {
      redirectTo: window.location.origin,
    });
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("traduz o limite de envios", async () => {
    supabaseMock.auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "For security purposes, you can only request this after 60 seconds." },
    } as never);
    await openForgot();
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    submit("Enviar link");
    expect(await screen.findByText("Aguarde antes de tentar novamente")).toBeInTheDocument();
  });
});
