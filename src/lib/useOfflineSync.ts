import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/online";
import { flushQueue, pendingCount, subscribeQueue } from "@/lib/offlineQueue";

/**
 * Estado de conexão + escritas pendentes do usuário. Ao abrir o app logado e toda vez
 * que a conexão volta, reenvia o que ficou na fila.
 */
export function useOfflineSync(userId: string | undefined): { online: boolean; pending: number } {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(() => (userId ? pendingCount(userId) : 0));

  useEffect(() => {
    if (!userId) return;
    const refresh = () => setPending(pendingCount(userId));
    refresh();
    return subscribeQueue(refresh);
  }, [userId]);

  useEffect(() => {
    if (!userId || !online) return;
    void flushQueue(userId);
  }, [userId, online]);

  return { online, pending };
}
