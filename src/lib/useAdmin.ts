import { useAuth } from "@/lib/AuthContext";

/**
 * Papel de admin para a UI (vem do banco, via is_app_admin()). SÓ esconde/mostra telas:
 * a permissão de verdade fica na RLS. Único ponto de leitura — o app usa este hook.
 * `loading` = o banco ainda não respondeu; trate como "não sei" (não redirecione ainda).
 */
export function useAdmin(): { isAdmin: boolean; loading: boolean } {
  const { isAdmin, adminLoading } = useAuth();
  return { isAdmin, loading: adminLoading };
}
