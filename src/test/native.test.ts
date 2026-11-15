import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { native, ln, push } = vi.hoisted(() => ({
  native: { value: true },
  ln: { requestPermissions: vi.fn(), cancel: vi.fn(), schedule: vi.fn() },
  push: { requestPermissions: vi.fn(), register: vi.fn(), addListener: vi.fn() },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => native.value,
    getPlatform: () => "android",
  },
}));

vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: ln }));

vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: push }));

import {
  scheduleBolaoReminders,
  scheduleMusicReminder,
  notifyCulturaIndicacao,
} from "@/lib/notificationService";
import { registerPushToken } from "@/lib/pushTokenService";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { useBetaMode } from "@/lib/useBetaMode";
import { mockDb } from "./supabaseMock";

const NOW = new Date(2026, 5, 10, 12, 0, 0); // 10/06/2026 12:00

beforeEach(() => {
  native.value = true;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  for (const f of [...Object.values(ln), ...Object.values(push)]) f.mockReset();
  ln.requestPermissions.mockResolvedValue({ display: "granted" });
  ln.schedule.mockResolvedValue(undefined);
  ln.cancel.mockResolvedValue(undefined);
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

const match = (id: string, hoursAhead: number, over: Record<string, unknown> = {}) => ({
  id,
  home_team: "Brasil",
  away_team: "Argentina",
  utc_date: new Date(NOW.getTime() + hoursAhead * 3600_000).toISOString(),
  status: "SCHEDULED",
  my_prediction: null,
  ...over,
});

describe("scheduleBolaoReminders", () => {
  it("na web não faz nada", async () => {
    native.value = false;
    await scheduleBolaoReminders("p1", [match("m1", 5)]);
    expect(ln.requestPermissions).not.toHaveBeenCalled();
  });
  it("sem permissão não agenda", async () => {
    ln.requestPermissions.mockResolvedValue({ display: "denied" });
    await scheduleBolaoReminders("p1", [match("m1", 5)]);
    expect(ln.schedule).not.toHaveBeenCalled();
  });
  it("agenda 1h antes só dos jogos futuros sem palpite", async () => {
    await scheduleBolaoReminders("p1", [
      match("futuro", 5),
      match("ja-palpitei", 5, { my_prediction: { h: 1, a: 0 } }),
      match("encerrado", 5, { status: "FINISHED" }),
      match("cancelado", 5, { status: "CANCELLED" }),
      match("adiado", 5, { status: "POSTPONED" }),
      match("em-30-min", 0.5), // lembrete (1h antes) já passou
    ]);
    expect(ln.schedule).toHaveBeenCalledTimes(1);
    const [{ notifications }] = ln.schedule.mock.calls[0];
    expect(notifications).toHaveLength(1);
    expect(notifications[0].extra).toEqual({ poolId: "p1", matchId: "futuro" });
    expect(notifications[0].schedule.at.getTime()).toBe(NOW.getTime() + 4 * 3600_000);
    expect(notifications[0].id).toBeGreaterThanOrEqual(30000);
    expect(notifications[0].body).toContain("Brasil × Argentina");
  });
  it("cancela os lembretes anteriores do mesmo bolão antes de reagendar", async () => {
    localStorage.setItem("bolao_notif_ids_p1", JSON.stringify([30000, 30001]));
    await scheduleBolaoReminders("p1", [match("m1", 5)]);
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 30000 }, { id: 30001 }] });
    expect(JSON.parse(localStorage.getItem("bolao_notif_ids_p1")!)).toEqual([30000]);
  });
  it("sem jogos elegíveis não chama schedule", async () => {
    await scheduleBolaoReminders("p1", [match("m1", 5, { status: "FINISHED" })]);
    expect(ln.schedule).not.toHaveBeenCalled();
    expect(localStorage.getItem("bolao_notif_ids_p1")).toBe("[]");
  });
});

describe("scheduleMusicReminder", () => {
  it("na web não faz nada", async () => {
    native.value = false;
    await scheduleMusicReminder();
    expect(ln.schedule).not.toHaveBeenCalled();
  });
  it("agenda para as 8h do dia seguinte quando já passou das 8h, repetindo todo dia", async () => {
    await scheduleMusicReminder();
    const [{ notifications }] = ln.schedule.mock.calls[0];
    const at: Date = notifications[0].schedule.at;
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([11, 8, 0]);
    expect(notifications[0].schedule).toMatchObject({ repeats: true, every: "day" });
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
  });
  it("antes das 8h agenda para hoje", async () => {
    vi.setSystemTime(new Date(2026, 5, 10, 6, 0, 0));
    await scheduleMusicReminder();
    expect(ln.schedule.mock.calls[0][0].notifications[0].schedule.at.getDate()).toBe(10);
  });
  it("não reagenda na mesma sessão", async () => {
    await scheduleMusicReminder();
    await scheduleMusicReminder();
    expect(ln.schedule).toHaveBeenCalledTimes(1);
  });
  it("sem permissão não agenda", async () => {
    ln.requestPermissions.mockResolvedValue({ display: "denied" });
    await scheduleMusicReminder();
    expect(ln.schedule).not.toHaveBeenCalled();
  });
});

describe("notifyCulturaIndicacao", () => {
  it("monta a notificação com emoji do tipo e a nota", async () => {
    await notifyCulturaIndicacao("Ana", "Matrix", "movie", 4);
    const n = ln.schedule.mock.calls[0][0].notifications[0];
    expect(n.title).toBe("🎬 Ana indicou no Cultura");
    expect(n.body).toBe('"Matrix" · ★ 4/5');
  });
  it("sem nota e tipo desconhecido", async () => {
    await notifyCulturaIndicacao("Ana", "X", "podcast", null);
    const n = ln.schedule.mock.calls[0][0].notifications[0];
    expect(n.title).toContain("🎭");
    expect(n.body).toBe('"X"');
  });
  it("web ou sem permissão não notifica", async () => {
    native.value = false;
    await notifyCulturaIndicacao("Ana", "X", "movie", null);
    native.value = true;
    ln.requestPermissions.mockResolvedValue({ display: "denied" });
    await notifyCulturaIndicacao("Ana", "X", "movie", null);
    expect(ln.schedule).not.toHaveBeenCalled();
  });
});

describe("registerPushToken", () => {
  it("web não registra", async () => {
    native.value = false;
    await registerPushToken("u1");
    expect(push.requestPermissions).not.toHaveBeenCalled();
  });
  it("sem permissão não registra", async () => {
    push.requestPermissions.mockResolvedValue({ receive: "denied" });
    await registerPushToken("u1");
    expect(push.register).not.toHaveBeenCalled();
  });
  it("com permissão registra e grava o token do usuário", async () => {
    push.requestPermissions.mockResolvedValue({ receive: "granted" });
    push.register.mockResolvedValue(undefined);
    await registerPushToken("u1");
    expect(push.register).toHaveBeenCalled();
    const [event, cb] = push.addListener.mock.calls[0];
    expect(event).toBe("registration");
    await cb({ value: "tok-123" });
    expect(mockDb.writes[0]).toMatchObject({ table: "push_tokens", op: "upsert" });
    expect(mockDb.writes[0].args[0]).toEqual({ user_id: "u1", token: "tok-123", platform: "android" });
    expect(mockDb.writes[0].args[1]).toEqual({ onConflict: "user_id,token" });
  });
});

describe("hooks", () => {
  it("useBetaMode é sempre verdadeiro (modo fixo)", () => {
    expect(renderHook(() => useBetaMode()).result.current).toBe(true);
  });

  const touch = (type: string, y: number) =>
    window.dispatchEvent(
      Object.assign(new Event(type), { touches: [{ clientY: y }] }),
    );

  it("puxar além do limite dispara a atualização", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(onRefresh, true));
    act(() => {
      touch("touchstart", 0);
      touch("touchmove", 200); // delta 200 × 0,5 = 100 ≥ 70
    });
    expect(result.current.pullDistance).toBe(100);
    expect(result.current.pulling).toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event("touchend"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.pullDistance).toBe(0);
  });
  it("puxar pouco não atualiza", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh(onRefresh, true));
    act(() => {
      touch("touchstart", 0);
      touch("touchmove", 60); // 30 < 70
      window.dispatchEvent(new Event("touchend"));
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it("a distância tem teto (efeito de resistência)", () => {
    const { result } = renderHook(() => usePullToRefresh(vi.fn().mockResolvedValue(undefined), true));
    act(() => {
      touch("touchstart", 0);
      touch("touchmove", 1000);
    });
    expect(result.current.pullDistance).toBe(110);
  });
  it("desligado não escuta gestos", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh(onRefresh, false));
    act(() => {
      touch("touchstart", 0);
      touch("touchmove", 300);
      window.dispatchEvent(new Event("touchend"));
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
