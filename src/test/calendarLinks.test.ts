import { describe, it, expect, vi, beforeEach } from "vitest";

const native = { value: false };
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.value,
    getPlatform: () => (native.value ? "android" : "web"),
  },
}));
const share = vi.fn();
vi.mock("@capacitor/share", () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));
const writeFile = vi.fn();
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: (...a: unknown[]) => writeFile(...a) },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));

import {
  getPublicBaseUrl,
  getEventShareUrl,
  getEventPreviewUrl,
  googleCalendarUrl,
  buildIcs,
  downloadIcs,
  shareEvent,
  PUBLIC_URL,
} from "@/features/agenda/calendarLinks";
import type { AgendaEvent } from "@/features/agenda/agendaService";

const ev = (over: Partial<AgendaEvent> = {}): AgendaEvent => ({
  id: "ev1",
  created_by: "u1",
  title: "Churrasco do Zé",
  location: "Rua A, 10",
  event_date: "2026-12-20",
  event_time: "19:30:00",
  description: "Leve   bebida\ne carne",
  created_at: "",
  updated_at: "",
  rsvps: [],
  my_rsvp: null,
  confirmed_count: 0,
  maybe_count: 0,
  is_past: false,
  ...over,
});

beforeEach(() => {
  native.value = false;
  share.mockReset();
  writeFile.mockReset();
});

describe("URLs públicas", () => {
  it("web usa o origin atual", () => {
    expect(getPublicBaseUrl()).toBe(window.location.origin);
  });
  it("APK usa o domínio fixo (origin é localhost)", () => {
    native.value = true;
    expect(getPublicBaseUrl()).toBe(PUBLIC_URL);
  });
  it("link curto leva só o id", () => {
    expect(getEventShareUrl("a b")).toBe(`${window.location.origin}/agenda?evento=a%20b`);
  });
  it("link de preview leva os dados do evento (cortando e limpando)", () => {
    const url = new URL(getEventPreviewUrl(ev({ title: "x".repeat(200) })));
    expect(url.searchParams.get("evento")).toBe("ev1");
    expect(url.searchParams.get("t")).toHaveLength(80);
    expect(url.searchParams.get("d")).toBe("2026-12-20");
    expect(url.searchParams.get("h")).toBe("19:30");
    expect(url.searchParams.get("l")).toBe("Rua A, 10");
    expect(url.searchParams.get("x")).toBe("Leve bebida e carne");
  });
  it("preview omite hora, local e descrição ausentes", () => {
    const url = new URL(
      getEventPreviewUrl(ev({ event_time: null, location: null, description: "  " })),
    );
    expect(url.searchParams.has("h")).toBe(false);
    expect(url.searchParams.has("l")).toBe(false);
    expect(url.searchParams.has("x")).toBe(false);
  });
});

describe("Google Agenda", () => {
  it("evento com hora: início, fim (+2h) e fuso", () => {
    const u = new URL(googleCalendarUrl(ev()));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("dates")).toBe("20261220T193000/20261220T213000");
    expect(u.searchParams.get("ctz")).toBe("America/Sao_Paulo");
    expect(u.searchParams.get("text")).toBe("Churrasco do Zé");
    expect(u.searchParams.get("location")).toBe("Rua A, 10");
    expect(u.searchParams.get("details")).toContain("Ver no Rolezinho:");
  });
  it("a duração atravessa a meia-noite", () => {
    const u = new URL(googleCalendarUrl(ev({ event_time: "23:00:00" })));
    expect(u.searchParams.get("dates")).toBe("20261220T230000/20261221T010000");
  });
  it("virada de ano no fim do evento", () => {
    const u = new URL(googleCalendarUrl(ev({ event_date: "2026-12-31", event_time: "23:30:00" })));
    expect(u.searchParams.get("dates")).toBe("20261231T233000/20270101T013000");
  });
  it("dia inteiro: fim exclusivo no dia seguinte e sem fuso", () => {
    const u = new URL(googleCalendarUrl(ev({ event_time: null })));
    expect(u.searchParams.get("dates")).toBe("20261220/20261221");
    expect(u.searchParams.has("ctz")).toBe(false);
  });
  it("sem local não manda location", () => {
    expect(new URL(googleCalendarUrl(ev({ location: null }))).searchParams.has("location")).toBe(
      false,
    );
  });
});

describe("ICS", () => {
  it("monta um VEVENT válido com CRLF", () => {
    const ics = buildIcs(ev());
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:ev1@rolezinho");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20261220T193000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20261220T213000");
    expect(ics).toContain("SUMMARY:Churrasco do Zé");
    expect(ics).toContain("LOCATION:Rua A\\, 10");
  });
  it("dia inteiro usa VALUE=DATE", () => {
    const ics = buildIcs(ev({ event_time: null }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261220");
    expect(ics).toContain("DTEND;VALUE=DATE:20261221");
  });
  it("escapa vírgula, ponto-e-vírgula, barra e quebra de linha", () => {
    const ics = buildIcs(ev({ title: "a,b;c\\d", description: "l1\nl2" }));
    expect(ics).toContain("SUMMARY:a\\,b\\;c\\\\d");
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:l1\\nl2");
  });
  it("quebra linhas longas (RFC 5545) em até 74 caracteres", () => {
    const ics = buildIcs(ev({ description: "palavra ".repeat(60) }));
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});

describe("downloadIcs", () => {
  it("web: baixa o arquivo com nome sem acentos", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    let name = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        name = this.download;
      });
    expect(await downloadIcs(ev({ title: "Churrasco do Zé!" }))).toBe(true);
    expect(name).toBe("churrasco-do-ze.ics");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
  it("nome padrão quando o título não tem letras", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    let name = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        name = this.download;
      });
    await downloadIcs(ev({ title: "!!!" }));
    expect(name).toBe("evento.ics");
    click.mockRestore();
  });
  it("APK: grava no cache e abre o compartilhar", async () => {
    native.value = true;
    writeFile.mockResolvedValue({ uri: "file://x.ics" });
    share.mockResolvedValue(undefined);
    expect(await downloadIcs(ev())).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "churrasco-do-ze.ics", directory: "CACHE" }),
    );
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ["file://x.ics"] }));
  });
  it("APK: cancelar o compartilhar conta como sucesso; outro erro não", async () => {
    native.value = true;
    writeFile.mockResolvedValue({ uri: "u" });
    share.mockRejectedValueOnce(new Error("Share canceled"));
    expect(await downloadIcs(ev())).toBe(true);
    share.mockRejectedValueOnce(new Error("boom"));
    expect(await downloadIcs(ev())).toBe(false);
  });
});

describe("shareEvent", () => {
  it("APK: usa o plugin Share", async () => {
    native.value = true;
    share.mockResolvedValue(undefined);
    expect(await shareEvent(ev())).toBe("shared");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Churrasco do Zé — 20/12/2026" }),
    );
  });
  it("web com navigator.share", async () => {
    const s = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: s, configurable: true });
    expect(await shareEvent(ev())).toBe("shared");
    expect(s).toHaveBeenCalled();
  });
  it("AbortError (usuário cancelou) = failed, sem copiar", async () => {
    const err = Object.assign(new Error("x"), { name: "AbortError" });
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(err), configurable: true });
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await shareEvent(ev())).toBe("failed");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("sem navigator.share copia o link", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await shareEvent(ev())).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/agenda?evento=ev1"));
  });
  it("falha ao copiar = failed", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    expect(await shareEvent(ev())).toBe("failed");
  });
});
