import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const NOTIFICATION_ID = 1;

// ─── Bolão reminders ──────────────────────────────────────────

interface MatchReminder {
  id: string;
  home_team: string;
  away_team: string;
  utc_date: string;
  status: string;
  my_prediction: object | null;
}

export async function scheduleBolaoReminders(
  poolId: string,
  matches: MatchReminder[],
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;

  // Cancela notificações anteriores deste bolão
  const storageKey = `bolao_notif_ids_${poolId}`;
  const existingIds = JSON.parse(
    localStorage.getItem(storageKey) ?? "[]",
  ) as number[];
  if (existingIds.length > 0) {
    await LocalNotifications.cancel({
      notifications: existingIds.map((id) => ({ id })),
    });
  }

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
  const newIds: number[] = [];

  // IDs começam em 30000 para não conflitar com outras notificações do app
  let idCounter = 30000;

  for (const match of matches) {
    if (match.my_prediction !== null) continue;
    if (["FINISHED", "CANCELLED", "POSTPONED"].includes(match.status)) continue;

    const notifAt = new Date(match.utc_date).getTime() - ONE_HOUR;
    if (notifAt <= now) continue; // prazo já passou

    const id = idCounter++;
    newIds.push(id);
    toSchedule.push({
      id,
      title: "⚽ Palpite pendente!",
      body: `${match.home_team} × ${match.away_team} começa em 1h. Dê seu palpite!`,
      schedule: { at: new Date(notifAt) },
      extra: { poolId, matchId: match.id },
      sound: undefined,
      actionTypeId: "",
    });
  }

  localStorage.setItem(storageKey, JSON.stringify(newIds));

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}
const SESSION_KEY = "music_notification_scheduled";

export async function scheduleMusicReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Evita re-agendar múltiplas vezes na mesma sessão
  if (sessionStorage.getItem(SESSION_KEY)) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;

  // Cancela qualquer agendamento anterior para evitar duplicatas
  await LocalNotifications.cancel({
    notifications: [{ id: NOTIFICATION_ID }],
  });

  // Próximo 8h: se já passou hoje, agenda para amanhã
  const now = new Date();
  const next8am = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    8,
    0,
    0,
  );
  if (now >= next8am) {
    next8am.setDate(next8am.getDate() + 1);
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: "🎵 Música do Dia",
        body: "Que música você indica hoje? Compartilhe com o grupo!",
        schedule: {
          at: next8am,
          repeats: true,
          every: "day",
        },
        sound: undefined,
        actionTypeId: "",
        extra: null,
      },
    ],
  });

  sessionStorage.setItem(SESSION_KEY, "1");
}
