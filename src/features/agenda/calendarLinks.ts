import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import type { AgendaEvent } from "./agendaService";

const TZ = "America/Sao_Paulo";
const DEFAULT_DURATION_H = 2;

// Domínio público usado nos links compartilhados. No APK o origin é
// https://localhost, então precisamos de uma base fixa.
// Defina VITE_PUBLIC_URL (ex.: https://meu-dominio.com) para sobrescrever.
export const PUBLIC_URL = "https://rolezinho-amigos.vercel.app";
const FALLBACK_PUBLIC_URL = PUBLIC_URL;

export function getPublicBaseUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  if (Capacitor.isNativePlatform()) return FALLBACK_PUBLIC_URL;
  return window.location.origin;
}

/** Link curto (só o ID) — usado dentro de entradas de calendário. */
export function getEventShareUrl(eventId: string): string {
  return `${getPublicBaseUrl()}/agenda?evento=${encodeURIComponent(eventId)}`;
}

/**
 * Link compartilhável: leva título/data/hora/local/descrição no próprio URL
 * para o servidor montar o preview (Open Graph) sem consultar o banco.
 */
export function getEventPreviewUrl(event: AgendaEvent): string {
  const params = new URLSearchParams({ evento: event.id });
  params.set("t", event.title.slice(0, 80));
  params.set("d", event.event_date);
  if (event.event_time) params.set("h", event.event_time.slice(0, 5));
  if (event.location) params.set("l", event.location.slice(0, 80));
  if (event.description?.trim())
    params.set("x", event.description.replace(/\s+/g, " ").trim().slice(0, 160));
  return `${getPublicBaseUrl()}/agenda?${params.toString()}`;
}

// ─── datas ──────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" -> "YYYYMMDD" */
function ymd(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/** Soma dias a uma data "YYYY-MM-DD" (sem depender de fuso) */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Retorna início/fim locais no formato YYYYMMDDTHHMMSS (sem Z) */
function localRange(event: AgendaEvent): {
  allDay: boolean;
  start: string;
  end: string;
} {
  if (!event.event_time) {
    return {
      allDay: true,
      start: ymd(event.event_date),
      end: ymd(addDays(event.event_date, 1)), // fim exclusivo
    };
  }
  const [h, min] = event.event_time.split(":").map(Number);
  const endTotal = h * 60 + min + DEFAULT_DURATION_H * 60;
  const endDayShift = Math.floor(endTotal / 1440);
  const endH = Math.floor((endTotal % 1440) / 60);
  const endM = endTotal % 60;
  const endDate = addDays(event.event_date, endDayShift);
  return {
    allDay: false,
    start: `${ymd(event.event_date)}T${pad(h)}${pad(min)}00`,
    end: `${ymd(endDate)}T${pad(endH)}${pad(endM)}00`,
  };
}

function detailsText(event: AgendaEvent): string {
  const parts = [
    event.description?.trim(),
    `Ver no Rolezinho: ${getEventShareUrl(event.id)}`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

// ─── Google Agenda ──────────────────────────────────────────────

export function googleCalendarUrl(event: AgendaEvent): string {
  const { allDay, start, end } = localRange(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: detailsText(event),
  });
  if (event.location) params.set("location", event.location);
  if (!allDay) params.set("ctz", TZ);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── ICS (Apple Calendar e outros) ──────────────────────────────

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Quebra linhas com mais de 75 octetos (RFC 5545) */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(event: AgendaEvent): string {
  const { allDay, start, end } = localRange(event);
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rolezinho Roots//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@rolezinho`,
    `DTSTAMP:${now}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART;TZID=${TZ}:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND;TZID=${TZ}:${end}`,
    `SUMMARY:${icsEscape(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  lines.push(`DESCRIPTION:${icsEscape(detailsText(event))}`);
  lines.push(`URL:${getEventShareUrl(event.id)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function icsFileName(event: AgendaEvent): string {
  const slug = event.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${slug || "evento"}.ics`;
}

/** Web: baixa o .ics. APK: grava em cache e abre o menu de compartilhar. */
export async function downloadIcs(event: AgendaEvent): Promise<boolean> {
  const content = buildIcs(event);
  const fileName = icsFileName(event);

  if (Capacitor.isNativePlatform()) {
    try {
      const { uri } = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: event.title,
        files: [uri],
        dialogTitle: "Adicionar à agenda",
      });
      return true;
    } catch (e) {
      // usuário fechou o menu de compartilhar
      return (e as Error).message?.toLowerCase().includes("cancel") ?? false;
    }
  }

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// ─── Compartilhar ───────────────────────────────────────────────

/** Retorna "shared" | "copied" | "failed" */
export async function shareEvent(
  event: AgendaEvent,
): Promise<"shared" | "copied" | "failed"> {
  const url = getEventPreviewUrl(event);
  const text = `${event.title} — ${event.event_date.split("-").reverse().join("/")}`;
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: event.title, text, url, dialogTitle: "Compartilhar evento" });
      return "shared";
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title: event.title, text, url });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
