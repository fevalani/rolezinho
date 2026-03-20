import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const NOTIFICATION_ID = 1;
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
