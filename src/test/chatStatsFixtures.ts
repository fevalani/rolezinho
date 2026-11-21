// Dados de exemplo compartilhados pelos testes de estatísticas do chat.

export const RAW = {
  slug: "2026",
  title: "Estatísticas 2026",
  totalMessages: 100,
  byHour: Array.from({ length: 24 }, (_, h) => (h === 22 ? 30 : 1)),
  byWeekday: [1, 2, 3, 4, 20, 5, 6],
  people: [
    { name: "Ana", messages: 60, share: 60, medianResponseSec: 45, starts: 10, enders: 2, audio: 5 },
    { name: "Beto", messages: 30, share: 30, medianResponseSec: 600, starts: 3, enders: 9 },
    { name: "Caio", messages: 10, share: 10 },
  ],
  interactions: [{ from: "Ana", to: "Beto", count: 20 }, { from: "Beto", to: "Ana", count: 15 }, { from: "Caio", to: "Ana", count: 5 }],
};
