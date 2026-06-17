import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/lib/supabase";
import { upsertPrediction } from "@/features/bolao/bolaoService";

const NOTIFICATION_ID = 1;

// ─── Notificação interativa do Bolão (palpite pela notificação) ──

const BOLAO_ACTION_TYPE = "BOLAO_PREDICT";

interface BolaoNotifExtra {
  poolId?: string;
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
}

/** "2x1", "2-1", "2 1", "2:1" → { home, away } | null */
export function parseScore(raw: string): { home: number; away: number } | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[x\-:\s]\s*(\d{1,2})$/i);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

/** Registra o tipo de ação com campo de texto (uma vez, no boot). */
export async function registerBolaoActionTypes(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: BOLAO_ACTION_TYPE,
        actions: [
          {
            id: "SAVE_SCORE",
            title: "Salvar palpite",
            input: true,
            inputButtonTitle: "Salvar",
            inputPlaceholder: "Placar, ex: 2x1",
          },
          { id: "OPEN_APP", title: "Abrir" },
        ],
      },
    ],
  });
}

async function notifyResult(
  title: string,
  body: string,
  extra: BolaoNotifExtra,
): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Math.random() * 10000) + 40000,
        title,
        body,
        extra,
        actionTypeId: BOLAO_ACTION_TYPE,
      },
    ],
  });
}

let bolaoHandlerRegistered = false;

/** Trata o "Salvar palpite" da notificação: salva no Supabase e confirma. */
export async function initBolaoNotificationHandler(): Promise<void> {
  if (!Capacitor.isNativePlatform() || bolaoHandlerRegistered) return;
  bolaoHandlerRegistered = true;

  await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    async (event) => {
      const extra = (event.notification.extra ?? {}) as BolaoNotifExtra;
      if (!extra.poolId || !extra.matchId) return;
      if (event.actionId !== "SAVE_SCORE") return; // OPEN_APP/toque → só abre

      const parsed = parseScore(event.inputValue ?? "");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        await notifyResult("Faça login 🔒", "Abra o app e tente de novo.", extra);
        return;
      }
      if (!parsed) {
        await notifyResult(
          "Placar inválido 🤔",
          "Use o formato 2x1. Toque para tentar de novo.",
          extra,
        );
        return;
      }

      const { error } = await upsertPrediction(
        extra.poolId,
        extra.matchId,
        user.id,
        parsed.home,
        parsed.away,
      );
      await notifyResult(
        error ? "Erro ao salvar 😕" : "Palpite salvo ✓",
        error
          ? "Toque para tentar de novo."
          : `${extra.homeTeam ?? ""} ${parsed.home} × ${parsed.away} ${extra.awayTeam ?? ""}`,
        extra,
      );
    },
  );
}

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

/**
 * MODO TESTE (admin): dispara a CADA MINUTO para os PRÓXIMOS jogos sem palpite,
 * ignorando a janela de 1h. Notificação interativa — dá para digitar o placar e
 * salvar pela própria notificação. Para parar, basta reabrir o bolão depois de
 * palpitar (reagenda sem o jogo) ou desinstalar o app de teste.
 */
export async function scheduleBolaoTestNotifications(
  poolId: string,
  matches: MatchReminder[],
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;

  const storageKey = `bolao_test_notif_ids_${poolId}`;
  const existingIds = JSON.parse(
    localStorage.getItem(storageKey) ?? "[]",
  ) as number[];
  if (existingIds.length > 0) {
    await LocalNotifications.cancel({
      notifications: existingIds.map((id) => ({ id })),
    });
  }

  // Próximos jogos sem palpite (ordena por data; ignora finalizados)
  const upcoming = matches
    .filter(
      (m) =>
        m.my_prediction === null &&
        !["FINISHED", "CANCELLED"].includes(m.status),
    )
    .sort(
      (a, b) =>
        new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime(),
    )
    .slice(0, 3);

  const ids: number[] = [];
  let idCounter = 31000;
  const toSchedule: Parameters<
    typeof LocalNotifications.schedule
  >[0]["notifications"] = upcoming.map((m) => {
    const id = idCounter++;
    ids.push(id);
    return {
      id,
      title: "⚽ [TESTE] Palpite pendente",
      body: `${m.home_team} × ${m.away_team}`,
      schedule: { every: "minute", repeats: true },
      actionTypeId: BOLAO_ACTION_TYPE,
      extra: {
        poolId,
        matchId: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
      },
    };
  });

  localStorage.setItem(storageKey, JSON.stringify(ids));
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
