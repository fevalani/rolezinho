import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { TavernaPage } from "@/features/taverna/TavernaPage";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

describe("TavernaPage", () => {
  it("mostra o botão de rolar o dado padrão", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    expect(await screen.findByText(/^Rolar /)).toBeInTheDocument();
  });

  it("rola o dado e grava a jogada do usuário", async () => {
    loginAs();
    renderWithProviders(<TavernaPage />);
    fireEvent.click(await screen.findByText(/^Rolar /));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "dice_rolls" && w.op === "insert")).toBe(true),
    );
    const rows = mockDb.writes.find((w) => w.table === "dice_rolls")!.args[0] as Array<{
      user_id: string;
      result: number;
      dice_type: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("user-1");
    expect(rows[0].result).toBeGreaterThanOrEqual(1);
  });

  it("mostra o histórico de jogadas existentes", async () => {
    loginAs();
    mockDb.tables.dice_rolls = [
      {
        id: "r1",
        user_id: "user-1",
        dice_type: "d20",
        result: 17,
        batch_id: null,
        created_at: new Date().toISOString(),
        profile: { id: "user-1", display_name: "Fulano", avatar_url: null },
      },
    ];
    renderWithProviders(<TavernaPage />);
    expect(await screen.findByText("17")).toBeInTheDocument();
  });
});
