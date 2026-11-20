import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { render } from "@testing-library/react";
import App from "@/App";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { loginAs, renderWithProviders } from "./helpers";
import { supabaseMock, emitAuthEvent } from "./supabaseMock";
import { readCache, writeCache } from "@/lib/localCache";
import { useAuth } from "@/lib/AuthContext";

beforeEach(() => {
  supabaseMock.auth.updateUser.mockClear();
  supabaseMock.auth.signOut.mockClear();
  supabaseMock.auth.onAuthStateChange.mockClear();
  supabaseMock.auth.getSession.mockClear();
});

const novaSenha = () => screen.getByPlaceholderText("Nova senha (mínimo 6 caracteres)");
const repita = () => screen.getByPlaceholderText("Repita a nova senha");
const salvar = () => fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

describe("ResetPasswordPage", () => {
  it("rejeita senha curta e senhas diferentes sem chamar o Supabase", async () => {
    loginAs();
    renderWithProviders(<ResetPasswordPage />);
    await screen.findByText("Nova senha");
    fireEvent.change(novaSenha(), { target: { value: "123" } });
    fireEvent.change(repita(), { target: { value: "123" } });
    salvar();
    expect(await screen.findByText("Senha deve ter pelo menos 6 caracteres")).toBeInTheDocument();

    fireEvent.change(novaSenha(), { target: { value: "segredo1" } });
    fireEvent.change(repita(), { target: { value: "segredo2" } });
    salvar();
    expect(await screen.findByText("As senhas não coincidem")).toBeInTheDocument();
    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
  });

  it("salva a senha nova", async () => {
    loginAs();
    renderWithProviders(<ResetPasswordPage />);
    await screen.findByText("Nova senha");
    fireEvent.change(novaSenha(), { target: { value: "segredo1" } });
    fireEvent.change(repita(), { target: { value: "segredo1" } });
    salvar();
    await waitFor(() =>
      expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: "segredo1" }),
    );
  });

  it("mostra o erro traduzido (link expirado, senha igual à anterior)", async () => {
    loginAs();
    supabaseMock.auth.updateUser.mockResolvedValueOnce({
      error: { message: "New password should be different from the old password." },
    } as never);
    renderWithProviders(<ResetPasswordPage />);
    await screen.findByText("Nova senha");
    fireEvent.change(novaSenha(), { target: { value: "segredo1" } });
    fireEvent.change(repita(), { target: { value: "segredo1" } });
    salvar();
    expect(await screen.findByText("A nova senha deve ser diferente da anterior")).toBeInTheDocument();
  });

  it("Cancelar encerra a sessão do link", async () => {
    loginAs();
    renderWithProviders(<ResetPasswordPage />);
    await screen.findByText("Nova senha");
    fireEvent.click(screen.getByText("Cancelar"));
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalled());
  });
});

describe("App — link de recuperação de senha", () => {
  const renderApp = () => render(<App />);

  it("evento PASSWORD_RECOVERY leva à tela de nova senha em vez do app", async () => {
    loginAs();
    renderApp();
    await waitFor(() => expect(supabaseMock.auth.onAuthStateChange).toHaveBeenCalled());
    expect(screen.queryByText("Nova senha")).not.toBeInTheDocument();
    await act(async () => emitAuthEvent("PASSWORD_RECOVERY"));
    expect(await screen.findByText("Nova senha")).toBeInTheDocument();
  });

  it("depois de salvar a senha nova, entra no app", async () => {
    loginAs();
    renderApp();
    await waitFor(() => expect(supabaseMock.auth.onAuthStateChange).toHaveBeenCalled());
    await act(async () => emitAuthEvent("PASSWORD_RECOVERY"));
    await screen.findByText("Nova senha");
    fireEvent.change(novaSenha(), { target: { value: "segredo1" } });
    fireEvent.change(repita(), { target: { value: "segredo1" } });
    salvar();
    await waitFor(() => expect(screen.queryByText("Nova senha")).not.toBeInTheDocument());
    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: "segredo1" });
  });

  it("sem o evento, quem está logado vê o app normalmente", async () => {
    loginAs();
    renderApp();
    await waitFor(() => expect(supabaseMock.auth.getSession).toHaveBeenCalled());
    expect(screen.queryByText("Nova senha")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
  });
});

vi.mock("@capacitor/app", () => ({ App: { getInfo: vi.fn(async () => ({ version: "0", build: "0" })), addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));

describe("logout", () => {
  it("apaga o cache local de snapshots (aparelho compartilhado)", async () => {
    writeCache("bolao:p1", { a: 1 });
    loginAs();
    const Btn = () => {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut()}>sair-teste</button>;
    };
    renderWithProviders(<Btn />);
    fireEvent.click(await screen.findByText("sair-teste"));
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(readCache("bolao:p1")).toBeNull());
  });
});
