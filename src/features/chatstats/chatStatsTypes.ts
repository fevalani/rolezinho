// Tabelas: chat_stats_snapshots e chat_stats_viewers — migration: supabase/chat_stats_migration.sql
// O JSON vem do pipeline local scripts/chat-insights (só números agregados, nada de mensagem crua).

export interface ChatStatsPerson {
  name: string;
  messages: number;
  /** % do total de mensagens */
  share: number;
  avgChars: number | null;
  medianResponseSec: number | null;
  /** conversas iniciadas / encerradas por essa pessoa */
  starts: number;
  enders: number;
  /** % das mensagens de texto com "?" */
  questionRate: number | null;
  nightMessages: number;
  audio: number;
  stickers: number;
  photos: number;
  /** % das mensagens que renderam risada dos outros */
  laughPercent: number | null;
  signatureEmoji: string | null;
}

export interface ChatStatsTopics {
  categories: { name: string; messages: number; conversations: number; share: number }[];
  byMonth: { month: string; top: string }[];
  byPerson: { name: string; categories: { name: string; messages: number }[] }[];
  highlights: { label: string; category: string; date: string; messages: number }[];
}

export interface ChatStats {
  slug: string;
  title: string;
  isActive: boolean;
  generatedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalMessages: number;
  activeDays: number;
  conversations: number;
  /** 24 posições (0h–23h) */
  byHour: number[];
  /** 7 posições, segunda a domingo */
  byWeekday: number[];
  byMonth: { month: string; messages: number; avgChars: number }[];
  longestStreak: { days: number; start: string; end: string } | null;
  people: ChatStatsPerson[];
  interactions: { from: string; to: string; count: number }[];
  catchphrases: { phrase: string; count: number; topAuthor: string }[];
  topWords: { word: string; count: number }[];
  topics: ChatStatsTopics | null;
}
