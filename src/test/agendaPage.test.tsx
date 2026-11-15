import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { AgendaPage } from "@/features/agenda/AgendaPage";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ev = (over: Record<string, unknown>) => ({
  id: "e1",
  created_by: "u2",
  title: "Churrasco",
  location: "Casa do Zé",
  event_date: day(3),
  event_time: "19:00:00",
  description: null,
  created_at: "",
  updated_at: "",
  ...over,
});

describe("AgendaPage", () => {
  it("sem eventos: estado vazio nas duas abas", async () => {
    loginAs();
    renderWithProviders(<AgendaPage />);
    expect(await screen.findByText("Nenhum evento na agenda ainda.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum evento próximo")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Finalizados"));
    expect(await screen.findByText("Nenhum evento finalizado.")).toBeInTheDocument();
  });

  it("separa próximos de finalizados e conta cada aba", async () => {
    loginAs();
    mockDb.tables.agenda_events = [
      ev({ id: "e1", title: "Churrasco" }),
      ev({ id: "e2", title: "Show antigo", event_date: day(-5) }),
    ];
    renderWithProviders(<AgendaPage />);
    expect(await screen.findByText("Churrasco")).toBeInTheDocument();
    expect(screen.queryByText("Show antigo")).not.toBeInTheDocument();
    expect(screen.getByText("Próximos · 1")).toBeInTheDocument();
    expect(screen.getByText("1 próximo evento")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Finalizados · 1"));
    expect(await screen.findByText("Show antigo")).toBeInTheDocument();
    expect(screen.queryByText("Churrasco")).not.toBeInTheDocument();
  });

  it("mostra local e horário do evento", async () => {
    loginAs();
    mockDb.tables.agenda_events = [ev({})];
    renderWithProviders(<AgendaPage />);
    await screen.findByText("Churrasco");
    expect(screen.getByText(/Casa do Zé/)).toBeInTheDocument();
    expect(screen.getByText(/19:00/)).toBeInTheDocument();
  });

  it("confirmar presença grava o RSVP do usuário", async () => {
    loginAs();
    mockDb.tables.agenda_events = [ev({})];
    renderWithProviders(<AgendaPage />);
    // o card começa fechado; abrir mostra "Você vai?"
    fireEvent.click(await screen.findByText("Churrasco"));
    fireEvent.click(await screen.findByText("Vou!"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "agenda_rsvps" && w.op === "upsert")).toBe(true),
    );
    const w = mockDb.writes.find((x) => x.table === "agenda_rsvps" && x.op === "upsert")!;
    expect(w.args[0]).toMatchObject({ user_id: "user-1", event_id: "e1", status: "confirmed" });
  });

  describe("novo evento", () => {
    const open = async () => {
      loginAs();
      renderWithProviders(<AgendaPage />);
      fireEvent.click(await screen.findByText("Evento", { selector: "button" }));
      return screen.findByPlaceholderText("Ex: Churrasco no Rolezinho");
    };

    it("o botão fica desabilitado até ter título", async () => {
      const title = await open();
      const btn = screen.getByRole("button", { name: /Criar evento/ });
      expect(btn).toBeDisabled();
      fireEvent.change(title, { target: { value: "   " } });
      expect(btn).toBeDisabled();
      fireEvent.change(title, { target: { value: "Festa" } });
      expect(btn).toBeEnabled();
      expect(mockDb.writes.filter((w) => w.table === "agenda_events")).toHaveLength(0);
    });

    it("cria o evento com os dados preenchidos", async () => {
      const title = await open();
      mockDb.tables.agenda_events = [{ id: "novo", title: "Festa", event_date: day(0) }];
      fireEvent.change(title, { target: { value: "  Festa  " } });
      fireEvent.change(screen.getByPlaceholderText("Onde vai rolar?"), { target: { value: "Sítio" } });
      fireEvent.click(screen.getByText(/Criar evento/));
      await waitFor(() =>
        expect(mockDb.writes.some((w) => w.table === "agenda_events" && w.op === "insert")).toBe(true),
      );
      expect(mockDb.writes.find((w) => w.op === "insert")!.args[0]).toMatchObject({
        title: "Festa",
        location: "Sítio",
        created_by: "user-1",
        event_time: null,
        description: null,
      });
    });
  });
});
