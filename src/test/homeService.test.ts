import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchHomeHighlights, fetchNextAgendaEvent, fetchTodayBirthdays } from "@/features/home/homeService";
import { mockDb } from "./supabaseMock";

const TODAY = new Date(2026, 10, 19); // 19/11/2026
const calls = (table: string) => mockDb.queries.filter((q) => q.table === table).flatMap((q) => q.calls);

afterEach(() => vi.useRealTimers());

describe("fetchTodayBirthdays", () => {
  it("filtra no banco pelo MM-DD de hoje", async () => {
    mockDb.tables.profiles = [{ id: "a", display_name: "Ana", avatar_url: null, birthday: "1990-11-19" }];
    const r = await fetchTodayBirthdays(TODAY);
    expect(r).toHaveLength(1);
    expect(calls("profiles")).toContainEqual(["like", ["birthday", "%-11-19"]]);
  });
  it("erro ou tabela vazia viram lista vazia", async () => {
    mockDb.errors.profiles = { message: "x" };
    expect(await fetchTodayBirthdays(TODAY)).toEqual([]);
  });
});

describe("fetchNextAgendaEvent", () => {
  it("sem evento futuro devolve null e nem consulta confirmações", async () => {
    mockDb.tables.agenda_events = [];
    expect(await fetchNextAgendaEvent(TODAY)).toBeNull();
    expect(mockDb.queries.some((q) => q.table === "agenda_rsvps")).toBe(false);
  });
  it("traz o evento com dias restantes e nº de confirmados, filtrando de hoje em diante", async () => {
    mockDb.tables.agenda_events = [{ id: "e1", title: "Churrasco", event_date: "2026-11-22", event_time: "19:00" }];
    mockDb.tables.agenda_rsvps = [{ id: "r1" }, { id: "r2" }];
    const r = await fetchNextAgendaEvent(TODAY);
    expect(r).toEqual({ id: "e1", title: "Churrasco", event_date: "2026-11-22", event_time: "19:00", daysUntil: 3, confirmedCount: 2 });
    expect(calls("agenda_events")).toContainEqual(["gte", ["event_date", "2026-11-19"]]);
    expect(calls("agenda_rsvps")).toContainEqual(["eq", ["event_id", "e1"]]);
    expect(calls("agenda_rsvps")).toContainEqual(["eq", ["status", "confirmed"]]);
  });
});

describe("fetchHomeHighlights", () => {
  const profiles = [
    { id: "a", display_name: "Ana Souza", avatar_url: null, birthday: "1990-12-01" },
    { id: "b", display_name: "Bia", avatar_url: null, birthday: "1995-11-25" },
  ];

  it("sem modo estendido só consulta os aniversariantes de hoje (nada de agenda)", async () => {
    mockDb.tables.profiles = [{ id: "a", display_name: "Ana", avatar_url: null, birthday: "1990-11-19" }];
    const r = await fetchHomeHighlights(false, TODAY);
    expect(r.todayBirthdays).toHaveLength(1);
    expect(r.nextBirthday).toBeNull();
    expect(r.nextEvent).toBeNull();
    expect(mockDb.queries.some((q) => q.table === "agenda_events")).toBe(false);
  });

  it("estendido traz próximo aniversário e próximo evento", async () => {
    mockDb.tables.profiles = profiles;
    mockDb.tables.agenda_events = [{ id: "e1", title: "Cinema", event_date: "2026-11-20", event_time: null }];
    const r = await fetchHomeHighlights(true, TODAY);
    expect(r.todayBirthdays).toEqual([]);
    expect(r.nextBirthday).toMatchObject({ md: "11-25", daysUntil: 6 });
    expect(r.nextEvent).toMatchObject({ id: "e1", daysUntil: 1, confirmedCount: 0 });
  });

  it("no dia do aniversário de alguém não mostra o próximo", async () => {
    mockDb.tables.profiles = [...profiles, { id: "c", display_name: "Caio", avatar_url: null, birthday: "1992-11-19" }];
    mockDb.tables.agenda_events = [];
    const r = await fetchHomeHighlights(true, TODAY);
    expect(r.todayBirthdays.map((p) => p.id)).toEqual(["c"]);
    expect(r.nextBirthday).toBeNull();
    expect(r.nextEvent).toBeNull();
  });
});
