import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { AniversariosPage } from "@/features/aniversarios/AniversariosPage";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const mmdd = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `1990-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("AniversariosPage", () => {
  it("mostra estado vazio sem aniversários", async () => {
    loginAs();
    renderWithProviders(<AniversariosPage />);
    expect(
      await screen.findByText("Nenhum aniversário cadastrado ainda."),
    ).toBeInTheDocument();
  });

  it("destaca quem faz aniversário hoje", async () => {
    loginAs();
    mockDb.tables.profiles.push({
      id: "u2",
      display_name: "Beltrano Silva",
      avatar_url: null,
      birthday: mmdd(0),
    });
    renderWithProviders(<AniversariosPage />);
    expect(await screen.findByText("Hoje tem aniversário!")).toBeInTheDocument();
    expect(screen.getAllByText(/Beltrano/).length).toBeGreaterThan(0);
  });

  it("ordena pelo próximo aniversário", async () => {
    loginAs();
    mockDb.tables.profiles.push(
      { id: "a", display_name: "Longe Pessoa", avatar_url: null, birthday: mmdd(200) },
      { id: "b", display_name: "Perto Pessoa", avatar_url: null, birthday: mmdd(3) },
    );
    renderWithProviders(<AniversariosPage />);
    await screen.findAllByText(/Perto/);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Perto")).toBeLessThan(text.indexOf("Longe"));
  });
});
