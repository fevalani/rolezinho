/**
 * Temas sazonais — LISTA ÚNICA de todos os temas do app.
 *
 * Como funciona:
 *  - Cada tema vale numa janela de datas (`isActive`).
 *  - Um tema só liga sozinho para todo mundo se estiver APROVADO pelo admin
 *    (tabela `seasonal_theme_approvals`, tela /temas). Rascunho nunca liga.
 *  - O visual (cores + decorações) mora em src/styles/seasons/<id>.css, ativado
 *    pelo atributo `data-season="<id>"` no <html>. As decorações são desenhadas
 *    em CSS a partir de pontos marcados nos componentes com `data-decor="..."`
 *    (hat, stocking, garland, lights) — o tema decide o que cada ponto vira.
 *  - SVGs ficam em public/seasons/<id>/.
 *
 * Para criar um tema novo: adicionar uma entrada aqui, um arquivo CSS em
 * src/styles/seasons/ (importado em src/main.tsx) e os SVGs em public/seasons/.
 */

export interface SeasonalTheme {
  /** Também é o valor de data-season e o theme_id no banco. */
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Texto da janela, para exibir na tela de admin. */
  windowLabel: string;
  /** O tema está dentro da janela de datas nesse dia? */
  isActive: (date: Date) => boolean;
  /** Cores de amostra para a tela de admin. */
  swatches: string[];
  /** Decorações usadas, para a tela de admin. */
  decorations: string[];
}

const month = (d: Date) => d.getMonth() + 1; // 1-12
const day = (d: Date) => d.getDate();

export const SEASONAL_THEMES: SeasonalTheme[] = [
  {
    id: "natal",
    name: "Natal",
    emoji: "🎄",
    description:
      "Verde-pinheiro e dourado, com gorro de Papai Noel, meias, guirlanda e luzes.",
    windowLabel: "1 a 26 de dezembro",
    isActive: (d) => month(d) === 12 && day(d) <= 26,
    swatches: ["#0b1f17", "#e3b95c", "#d6293a", "#1f6b45"],
    decorations: [
      "Gorro na logo e no avatar do menu",
      "Guirlanda sob o cabeçalho",
      "Luzes no topo da Home",
      "Meias nos títulos das categorias",
    ],
  },
];

export function getTheme(id: string | null | undefined) {
  return SEASONAL_THEMES.find((t) => t.id === id) ?? null;
}
