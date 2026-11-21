import { supabase } from "@/lib/supabase";
import { cachedValue } from "@/lib/localCache";
import {
  daysUntilYmd,
  filterBirthdaysToday,
  findNextBirthday,
  getLocalToday,
  getTodayMD,
  getTodayYMD,
} from "./homeLogic";
import type { BirthdayPerson, HomeHighlights, NextAgendaEvent } from "./homeTypes";

const PROFILE_COLS = "id, display_name, avatar_url, birthday";

/** Só quem faz aniversário hoje (carga leve, usada fora do modo desenvolvedor). */
export async function fetchTodayBirthdays(today = getLocalToday()): Promise<BirthdayPerson[]> {
  try {
    return await queryTodayBirthdays(today);
  } catch {
    return [];
  }
}

/** Igual a `fetchTodayBirthdays`, mas lança erro se a consulta falhar (para o cache saber). */
async function queryTodayBirthdays(today: Date): Promise<BirthdayPerson[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .like("birthday", `%-${getTodayMD(today)}`);
  if (error) throw error;
  return (data as BirthdayPerson[]) ?? [];
}

/** Próximo evento da agenda (de hoje em diante) com o nº de confirmados. */
export async function fetchNextAgendaEvent(today = getLocalToday()): Promise<NextAgendaEvent | null> {
  const { data: ev } = await supabase
    .from("agenda_events")
    .select("id, title, event_date, event_time")
    .gte("event_date", getTodayYMD(today))
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (!ev) return null;

  const { count } = await supabase
    .from("agenda_rsvps")
    .select("id", { count: "exact", head: true })
    .eq("event_id", ev.id)
    .eq("status", "confirmed");

  return {
    id: ev.id,
    title: ev.title,
    event_date: ev.event_date,
    event_time: ev.event_time ?? null,
    daysUntil: daysUntilYmd(ev.event_date, today),
    confirmedCount: count ?? 0,
  };
}

/**
 * Destaques da home. Sem `extended` só traz os aniversariantes de hoje;
 * com `extended` (modo desenvolvedor) traz também o próximo aniversário
 * (omitido no dia do aniversário de alguém) e o próximo evento da agenda.
 */
export async function fetchHomeHighlights(extended: boolean, today = getLocalToday()): Promise<HomeHighlights> {
  const empty: HomeHighlights = { todayBirthdays: [], nextBirthday: null, nextEvent: null };
  // Sem rede, usa os últimos destaques guardados (só vale para o mesmo dia).
  return cachedValue(`home:highlights:${extended}:${getTodayYMD(today)}`, () => loadHomeHighlights(extended, today), empty);
}

async function loadHomeHighlights(extended: boolean, today: Date): Promise<HomeHighlights> {
  if (!extended) {
    return { todayBirthdays: await queryTodayBirthdays(today), nextBirthday: null, nextEvent: null };
  }

  const [profilesRes, nextEvent] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLS).not("birthday", "is", null),
    fetchNextAgendaEvent(today),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  const profiles = ((profilesRes.data ?? []) as BirthdayPerson[]).filter((p) => Boolean(p.birthday));
  const todayBirthdays = filterBirthdaysToday(profiles, today);

  return {
    todayBirthdays,
    nextBirthday: todayBirthdays.length === 0 ? findNextBirthday(profiles, today) : null,
    nextEvent,
  };
}
