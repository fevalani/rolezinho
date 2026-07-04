import { useAuth } from "@/lib/AuthContext";

/**
 * Modo beta — ativado pelo usuário no toggle da Home (grade de 3 colunas).
 * Reaproveitado como flag global pra habilitar os tratamentos visuais
 * "modernos" (skeleton loaders, pull-to-refresh, glass panels, haptics,
 * fonte de destaque) sem afetar quem não optou pela versão beta.
 */
export function useBetaMode(): boolean {
  const { profile } = useAuth();
  return (profile?.home_layout ?? "list") === "grid";
}
