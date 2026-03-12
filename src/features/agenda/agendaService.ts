import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export type RsvpStatus = "confirmed" | "maybe";

export interface AgendaRsvp {
  id: string;
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  updated_at: string;
  profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface AgendaEvent {
  id: string;
  created_by: string;
  title: string;
  location: string | null;
  event_date: string; // "YYYY-MM-DD"
  event_time: string | null; // "HH:MM:SS" or null
  description: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  rsvps: AgendaRsvp[];
  // computed client-side
  my_rsvp: RsvpStatus | null;
  confirmed_count: number;
  maybe_count: number;
  is_past: boolean;
}

export interface CreateEventPayload {
  title: string;
  location: string | null;
  event_date: string;
  event_time: string | null;
  description: string | null;
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

/** Returns today's date as "YYYY-MM-DD" in local time */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → JS Date at midnight local */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formats "YYYY-MM-DD" → "Sáb, 14 Jun" / "Hoje" / "Amanhã" */
export function formatEventDate(dateStr: string): string {
  const today = todayStr();
  const tomorrow = (() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  if (dateStr === today) return "Hoje";
  if (dateStr === tomorrow) return "Amanhã";
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "HH:MM:SS" → "HH:MM" */
export function formatTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function enrichEvents(
  events: Record<string, unknown>[],
  rsvpsData: Record<string, unknown>[],
  profilesMap: Map<
    string,
    { id: string; display_name: string; avatar_url: string | null }
  >,
  currentUserId?: string,
): AgendaEvent[] {
  const today = todayStr();

  return events.map((ev) => {
    const eventId = ev.id as string;
    const rsvps = (
      rsvpsData.filter((r) => r.event_id === eventId) as unknown as AgendaRsvp[]
    ).map((r) => ({
      ...r,
      profile: profilesMap.get(r.user_id),
    }));

    const confirmed = rsvps.filter((r) => r.status === "confirmed");
    const maybe = rsvps.filter((r) => r.status === "maybe");
    const myRsvp = currentUserId
      ? (rsvps.find((r) => r.user_id === currentUserId)?.status ?? null)
      : null;

    return {
      ...(ev as unknown as AgendaEvent),
      creator: profilesMap.get(ev.created_by as string),
      rsvps,
      my_rsvp: myRsvp,
      confirmed_count: confirmed.length,
      maybe_count: maybe.length,
      is_past: (ev.event_date as string) < today,
    };
  });
}

// ═══════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════

export async function fetchEvents(
  currentUserId?: string,
): Promise<AgendaEvent[]> {
  const { data: events, error } = await supabase
    .from("agenda_events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("[fetchEvents]", error);
    return [];
  }
  if (!events?.length) return [];

  // RSVPs for all events
  const eventIds = events.map((e) => e.id);
  const { data: rsvps } = await supabase
    .from("agenda_rsvps")
    .select("*")
    .in("event_id", eventIds);

  // Profiles: creators + rsvp users
  const userIds = [
    ...new Set([
      ...events.map((e) => e.created_by),
      ...(rsvps ?? []).map((r) => r.user_id),
    ]),
  ];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const pm = new Map((profiles ?? []).map((p) => [p.id, p]));

  return enrichEvents(
    events as Record<string, unknown>[],
    (rsvps ?? []) as Record<string, unknown>[],
    pm,
    currentUserId,
  );
}

// ═══════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════

export async function createEvent(
  userId: string,
  payload: CreateEventPayload,
): Promise<{ data: AgendaEvent | null; error: string | null }> {
  const { data, error } = await supabase
    .from("agenda_events")
    .insert({ ...payload, created_by: userId })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  const enriched: AgendaEvent = {
    ...(data as AgendaEvent),
    rsvps: [],
    my_rsvp: null,
    confirmed_count: 0,
    maybe_count: 0,
    is_past: data.event_date < todayStr(),
  };
  return { data: enriched, error: null };
}

export async function deleteEvent(
  eventId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("agenda_events")
    .delete()
    .eq("id", eventId);
  return { error: error?.message ?? null };
}

export async function upsertRsvp(
  userId: string,
  eventId: string,
  status: RsvpStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("agenda_rsvps").upsert(
    {
      user_id: userId,
      event_id: eventId,
      status,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "event_id,user_id",
    },
  );
  return { error: error?.message ?? null };
}

export async function removeRsvp(
  userId: string,
  eventId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("agenda_rsvps")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════
// Realtime
// ═══════════════════════════════════════════

export function subscribeAgenda(onRefresh: () => void) {
  return supabase
    .channel("agenda_realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agenda_events" },
      onRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agenda_rsvps" },
      onRefresh,
    )
    .subscribe();
}
