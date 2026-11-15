/**
 * Modo beta — agora é o padrão fixo do app (grade de 3 colunas na Home e
 * tratamentos visuais "modernos": skeleton loaders, pull-to-refresh, glass
 * panels, haptics, fonte de destaque).
 *
 * A versão antiga (lista na Home, com toggle) foi preservada na tag git
 * `legacy-home-list`. Para consultar:
 *   git show legacy-home-list:src/pages/HomePage.tsx
 * O hook foi mantido para não precisar mexer em todas as telas que o usam.
 */
export function useBetaMode(): boolean {
  return true;
}
