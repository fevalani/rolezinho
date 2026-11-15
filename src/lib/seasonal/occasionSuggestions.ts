import type { OccasionInput } from "./occasions";

/** Ideias de datas para preencher o formulário com um toque (não são temas prontos). */
export const OCCASION_SUGGESTIONS: (OccasionInput & { title: string })[] = [
  { title: "Atenção à Dislexia", emoji: "🔤", extras: ["b", "d", "p", "q", "m", "w"], dayMd: "11-16", daysBefore: 0, jumble: true },
  { title: "Consciência Negra", emoji: "✊🏿", extras: ["🖤", "🌍", "✨"], dayMd: "11-20", daysBefore: 2 },
  { title: "Dia do Amigo", emoji: "🤝", extras: ["🍻", "🎉", "❤️"], dayMd: "07-20", daysBefore: 3 },
  { title: "Dia dos Namorados", emoji: "💘", extras: ["❤️", "💕", "🌹"], dayMd: "06-12", daysBefore: 3 },
  { title: "Dia da Árvore", emoji: "🌳", extras: ["🍃", "🌿", "🌱"], dayMd: "09-21", daysBefore: 3 },
  { title: "Dia do Programador", emoji: "💻", extras: ["👾", "🕹️", "💾"], dayMd: "09-13", daysBefore: 0 },
  { title: "Dia das Crianças", emoji: "🧸", extras: ["🎈", "🍭", "🎠"], dayMd: "10-12", daysBefore: 3 },
  { title: "Halloween", emoji: "🎃", extras: ["👻", "🦇", "🕸️"], dayMd: "10-31", daysBefore: 5 },
];
