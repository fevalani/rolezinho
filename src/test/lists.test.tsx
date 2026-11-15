import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { RankingPage } from "@/features/ranking/RankingPage";
import { DuelosPage } from "@/features/duelos/DuelosPage";
import { ArenaPage } from "@/features/arena/ArenaPage";
import { BolaoPage } from "@/features/bolao/BolaoPage";
import { RpgHomePage } from "@/features/rpg/RpgHomePage";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

describe("Ranking — lista", () => {
  it("estado vazio oferece criar a primeira tabela", async () => {
    loginAs();
    renderWithProviders(<RankingPage />);
    expect(await screen.findByText("Nenhuma tabela criada ainda")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Criar a primeira"));
    expect(await screen.findByPlaceholderText("Ex: Tênis")).toBeInTheDocument();
  });

  it("lista as tabelas existentes", async () => {
    loginAs();
    mockDb.tables.ranking_tables = [
      { id: "r1", title: "Sinuca", icon: "🎱", created_by: "user-1", created_at: "2026-01-01T00:00:00Z" },
    ];
    renderWithProviders(<RankingPage />);
    expect(await screen.findByText("Sinuca")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma tabela criada ainda")).not.toBeInTheDocument();
  });

  it("cria uma tabela com o título digitado", async () => {
    loginAs();
    renderWithProviders(<RankingPage />);
    fireEvent.click(await screen.findByText("Criar a primeira"));
    // o mock devolve o id da linha inserida
    mockDb.tables.ranking_tables = [{ id: "novo", title: "Tênis" }];
    fireEvent.change(await screen.findByPlaceholderText("Ex: Tênis"), {
      target: { value: "Tênis" },
    });
    fireEvent.click(screen.getByText("Criar tabela"));
    await waitFor(() =>
      expect(
        mockDb.writes.some(
          (w) => w.table === "ranking_tables" && w.op === "insert",
        ),
      ).toBe(true),
    );
    const w = mockDb.writes.find((x) => x.table === "ranking_tables")!;
    expect(w.args[0]).toMatchObject({ title: "Tênis", created_by: "user-1" });
  });
});

describe("Duelos — lista", () => {
  it("estado vazio oferece criar o primeiro", async () => {
    loginAs();
    renderWithProviders(<DuelosPage />);
    expect(await screen.findByText("Nenhum duelo criado ainda")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Criar o primeiro"));
    expect(
      await screen.findByPlaceholderText("Ex: Melhores filmes do Nolan"),
    ).toBeInTheDocument();
  });
});

describe("Arena — lista", () => {
  it("estado vazio e formulário de novo caso", async () => {
    loginAs();
    renderWithProviders(<ArenaPage />);
    expect(await screen.findByText("Nenhum caso em aberto")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Criar o primeiro"));
    expect(
      await screen.findByPlaceholderText(/Quem vai ganhar o Oscar/),
    ).toBeInTheDocument();
  });
});

describe("Bolão — lista", () => {
  it("estado vazio abre o formulário de criar bolão", async () => {
    loginAs();
    renderWithProviders(<BolaoPage />);
    fireEvent.click(await screen.findByText("Criar o primeiro"));
    expect(
      await screen.findByPlaceholderText("Ex: Bolão dos Amigos"),
    ).toBeInTheDocument();
  });
});

describe("RPG — início", () => {
  it("dá boas-vindas e mostra estados vazios de mesas e fichas", async () => {
    loginAs();
    renderWithProviders(<RpgHomePage />);
    expect(await screen.findByText(/Bem-vindo, Fulano/)).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma mesa ainda")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma ficha criada")).toBeInTheDocument();
  });

  it("abre o modal de nova mesa", async () => {
    loginAs();
    renderWithProviders(<RpgHomePage />);
    fireEvent.click(await screen.findByText("+ Nova Mesa"));
    expect(
      await screen.findByPlaceholderText("Ex: A Maldição de Strahd"),
    ).toBeInTheDocument();
  });
});
