import { useSyncExternalStore } from "react";

/**
 * Modo desenvolvedor — o próprio usuário se coloca nele (Perfil) para ver
 * recursos experimentais, como jogos em teste. É só VISIBILIDADE: não é
 * permissão (regra de acesso de verdade fica no banco). Guardado por
 * dispositivo em localStorage.
 *
 * Não confundir com `useBetaMode`, que hoje é o visual padrão do app.
 */
export const DEV_MODE_KEY = "rolezinho:dev-mode";

const listeners = new Set<() => void>();

export function readDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEV_MODE_KEY, "1");
    else localStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // sem storage (janela privada etc.): o modo simplesmente não persiste
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DEV_MODE_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDevMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readDevMode, () => false);
  return [on, setDevMode];
}
