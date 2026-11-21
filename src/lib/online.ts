import { useSyncExternalStore } from "react";

/** O navegador acha que há rede? (SSR/jsdom sem `navigator` contam como online.) */
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** A mensagem de erro parece falta de conexão (e não, por exemplo, uma regra do banco)? */
export function isNetworkErrorMessage(msg: unknown): boolean {
  const text = typeof msg === "string" ? msg : msg instanceof Error ? msg.message : "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timed? ?out|aborterror/i.test(
    text,
  );
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** `true` enquanto há conexão; reage aos eventos online/offline do navegador. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
