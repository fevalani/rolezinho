import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfilePage } from "@/pages/ProfilePage";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb, supabaseMock } from "./supabaseMock";

describe("ProfilePage", () => {
  it("carrega o nome atual no campo", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Seu nome")).toHaveValue("Fulano"),
    );
  });

  it("preenche o formulário mesmo quando o perfil carrega depois da tela", async () => {
    loginAs();
    // sem esperar o perfil: a tela monta com profile=null e o perfil chega depois
    renderWithProviders(<ProfilePage />, { settled: false });
    await waitFor(() => expect(screen.getByPlaceholderText("Seu nome")).toHaveValue("Fulano"));
  });

  it("não sobrescreve o que o usuário está digitando quando o perfil é atualizado", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    const input = await screen.findByPlaceholderText("Seu nome");
    await waitFor(() => expect(input).toHaveValue("Fulano"));
    fireEvent.change(input, { target: { value: "Digitando..." } });
    fireEvent.click(await screen.findByText("☀️ Claro")); // atualiza o perfil (tema)
    await waitFor(() =>
      expect(mockDb.writes.some((w) => (w.args[0] as { theme?: string }).theme === "light")).toBe(true),
    );
    expect(input).toHaveValue("Digitando...");
  });

  it("não salva com nome vazio", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    const input = await screen.findByPlaceholderText("Seu nome");
    await waitFor(() => expect(input).toHaveValue("Fulano"));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    expect(
      await screen.findByText("Nome deve ter pelo menos 2 caracteres"),
    ).toBeInTheDocument();
    // (o login grava app_version; só o salvar do perfil leva display_name)
    expect(
      mockDb.writes.filter(
        (w) => w.op === "update" && "display_name" in (w.args[0] as object),
      ),
    ).toHaveLength(0);
  });

  it("salva o perfil com o novo nome", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    const input = await screen.findByPlaceholderText("Seu nome");
    await waitFor(() => expect(input).toHaveValue("Fulano"));
    fireEvent.change(input, { target: { value: "Fulano de Tal" } });
    fireEvent.click(screen.getByText("Salvar perfil"));
    expect(await screen.findByText("Perfil atualizado!")).toBeInTheDocument();
    const w = mockDb.writes.find(
      (x) => x.table === "profiles" && x.op === "update" && "display_name" in (x.args[0] as object),
    );
    expect(w?.args[0]).toMatchObject({ display_name: "Fulano de Tal" });
  });

  it("troca o tema para claro", async () => {
    loginAs();
    renderWithProviders(<ProfilePage />);
    fireEvent.click(await screen.findByText("☀️ Claro"));
    await waitFor(() =>
      expect(
        mockDb.writes.some(
          (w) => w.op === "update" && (w.args[0] as { theme?: string }).theme === "light",
        ),
      ).toBe(true),
    );
  });

  describe("alterar senha", () => {
    const setup = async (nova: string, conf: string) => {
      loginAs();
      renderWithProviders(<ProfilePage />);
      fireEvent.change(
        await screen.findByPlaceholderText("Nova senha (mínimo 6 caracteres)"),
        { target: { value: nova } },
      );
      fireEvent.change(screen.getByPlaceholderText("Confirmar nova senha"), {
        target: { value: conf },
      });
      fireEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
    };

    it("rejeita senha curta", async () => {
      await setup("123", "123");
      expect(
        await screen.findByText("Senha deve ter pelo menos 6 caracteres"),
      ).toBeInTheDocument();
      expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
    });

    it("rejeita confirmação diferente", async () => {
      await setup("segredo1", "segredo2");
      expect(await screen.findByText("As senhas não coincidem")).toBeInTheDocument();
      expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
    });

    it("altera a senha quando válida", async () => {
      await setup("segredo1", "segredo1");
      expect(await screen.findByText("Senha alterada!")).toBeInTheDocument();
      expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({
        password: "segredo1",
      });
    });
  });
});
