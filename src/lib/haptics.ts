import { Haptics, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

async function safe(fn: () => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await fn();
  } catch {
    // dispositivo sem suporte a haptics — ignora
  }
}

/** Toque leve — navegação e seleções. Usa vibrate() com duração curta em vez
 * de impact("Light"), que em vários Android soa forte demais e não dá pra
 * ajustar a intensidade (só o estilo Light/Medium/Heavy, fixos). */
export function hapticTap() {
  return safe(() => Haptics.vibrate({ duration: 10 }));
}

/** Confirmação — ações concluídas com sucesso (salvar, aprovar, criar) */
export function hapticSuccess() {
  return safe(() => Haptics.notification({ type: NotificationType.Success }));
}
