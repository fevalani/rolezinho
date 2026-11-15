import { describe, it, expect, vi, afterEach } from "vitest";
import {
  todayStr,
  parseLocalDate,
  formatEventDate,
  formatTime,
  fetchEvents,
  createEvent,
  deleteEvent,
  upsertRsvp,
  removeRsvp,
} from "@/features/agenda/agendaService";
import { mockDb } from "./supabaseMock";

afterEach(() => vi.useRealTimers());

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("datas da agenda", () => {
  it("todayStr usa a data local", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 0, 5, 23, 30) });
    expect(todayStr()).toBe("2026-01-05");
  });
  it("parseLocalDate cria meia-noite local (sem deslocar de fuso)", () => {
    const d = parseLocalDate("2026-12-31");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 11, 31, 0]);
  });
  it("formatEventDate: Hoje, Amanhã e data curta", () => {
    expect(formatEventDate(day(0))).toBe("Hoje");
    expect(formatEventDate(day(1))).toBe("Amanhã");
    expect(formatEventDate(day(10))).not.toMatch(/Hoje|Amanhã/);
    expect(formatEventDate(day(10))).toMatch(/\d/);
  });
  it("formatTime corta os segundos e aceita null", () => {
    expect(formatTime("19:30:00")).toBe("19:30");
    expect(formatTime(null)).toBe("");
  });
});

describe("fetchEvents", () => {
  it("sem eventos = lista vazia", async () => {
    expect(await fetchEvents("u1")).toEqual([]);
  });

  it("erro do banco = lista vazia (não quebra)", async () => {
    mockDb.errors.agenda_events = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchEvents("u1")).toEqual([]);
    spy.mockRestore();
  });

  it("enriquece com criador, RSVPs, contagens e 'passado'", async () => {
    mockDb.tables.agenda_events = [
      { id: "e1", created_by: "u2", title: "Futuro", event_date: day(3), event_time: null },
      { id: "e2", created_by: "u2", title: "Passado", event_date: day(-3), event_time: null },
    ];
    mockDb.tables.agenda_rsvps = [
      { event_id: "e1", user_id: "u1", status: "confirmed" },
      { event_id: "e1", user_id: "u2", status: "maybe" },
      { event_id: "e1", user_id: "u3", status: "confirmed" },
      { event_id: "e2", user_id: "u3", status: "confirmed" },
    ];
    mockDb.tables.profiles = [
      { id: "u1", display_name: "Eu", avatar_url: null },
      { id: "u2", display_name: "Criador", avatar_url: null },
    ];
    const [futuro, passado] = await fetchEvents("u1");
    expect(futuro.is_past).toBe(false);
    expect(passado.is_past).toBe(true);
    expect(futuro.my_rsvp).toBe("confirmed");
    expect(futuro.confirmed_count).toBe(2);
    expect(futuro.maybe_count).toBe(1);
    expect(futuro.creator?.display_name).toBe("Criador");
    expect(futuro.rsvps.find((r) => r.user_id === "u1")?.profile?.display_name).toBe("Eu");
    expect(passado.my_rsvp).toBeNull();
  });

  it("sem usuário logado my_rsvp é null", async () => {
    mockDb.tables.agenda_events = [{ id: "e1", created_by: "u2", event_date: day(1) }];
    mockDb.tables.agenda_rsvps = [{ event_id: "e1", user_id: "u1", status: "confirmed" }];
    const [e] = await fetchEvents();
    expect(e.my_rsvp).toBeNull();
  });
});

describe("mutações da agenda", () => {
  it("createEvent grava com created_by e devolve o evento zerado", async () => {
    mockDb.tables.agenda_events = [{ id: "novo", title: "T", event_date: day(2) }];
    const r = await createEvent("u1", {
      title: "T",
      location: null,
      event_date: day(2),
      event_time: null,
      description: null,
    });
    expect(mockDb.writes[0]).toMatchObject({ table: "agenda_events", op: "insert" });
    expect(mockDb.writes[0].args[0]).toMatchObject({ created_by: "u1", title: "T" });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ id: "novo", rsvps: [], confirmed_count: 0, is_past: false });
  });
  it("createEvent devolve a mensagem de erro", async () => {
    mockDb.errors.agenda_events = { message: "negado" };
    const r = await createEvent("u1", {
      title: "T",
      location: null,
      event_date: day(2),
      event_time: null,
      description: null,
    });
    expect(r).toEqual({ data: null, error: "negado" });
  });
  it("deleteEvent / removeRsvp / upsertRsvp", async () => {
    expect(await deleteEvent("e1")).toEqual({ error: null });
    expect(await removeRsvp("u1", "e1")).toEqual({ error: null });
    expect(await upsertRsvp("u1", "e1", "maybe")).toEqual({ error: null });
    expect(mockDb.writes.map((w) => `${w.table}:${w.op}`)).toEqual([
      "agenda_events:delete",
      "agenda_rsvps:delete",
      "agenda_rsvps:upsert",
    ]);
    expect(mockDb.writes[2].args[0]).toMatchObject({ user_id: "u1", event_id: "e1", status: "maybe" });
    expect(mockDb.writes[2].args[1]).toEqual({ onConflict: "event_id,user_id" });
  });
  it("erros viram { error } sem lançar", async () => {
    mockDb.errors.agenda_rsvps = { message: "rls" };
    expect(await upsertRsvp("u1", "e1", "confirmed")).toEqual({ error: "rls" });
    expect(await removeRsvp("u1", "e1")).toEqual({ error: "rls" });
  });
});
