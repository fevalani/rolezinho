import type { ChatStats, ChatStatsPerson, ChatStatsTopics } from "./chatStatsTypes";

// ═══════════════════════════════════════════
// Validação do JSON (colado pelo admin ou lido do banco)
// ═══════════════════════════════════════════

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/i;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numArr = (v: unknown, len: number): number[] | null =>
  Array.isArray(v) && v.length === len && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : null;

function parsePerson(v: unknown): ChatStatsPerson | null {
  if (!isObj(v) || !str(v.name).trim()) return null;
  return {
    name: str(v.name).trim(),
    messages: num(v.messages),
    share: num(v.share),
    avgChars: numOrNull(v.avgChars),
    medianResponseSec: numOrNull(v.medianResponseSec),
    starts: num(v.starts),
    enders: num(v.enders),
    questionRate: numOrNull(v.questionRate),
    nightMessages: num(v.nightMessages),
    audio: num(v.audio),
    stickers: num(v.stickers),
    photos: num(v.photos),
    laughPercent: numOrNull(v.laughPercent),
    signatureEmoji: strOrNull(v.signatureEmoji),
  };
}

function parseTopics(v: unknown): ChatStatsTopics | null {
  if (!isObj(v)) return null;
  const cats = arr(v.categories).filter(isObj).map((c) => ({
    name: str(c.name), messages: num(c.messages), conversations: num(c.conversations), share: num(c.share),
  })).filter((c) => c.name);
  if (!cats.length) return null;
  return {
    categories: cats,
    byMonth: arr(v.byMonth).filter(isObj).map((m) => ({ month: str(m.month), top: str(m.top) })).filter((m) => m.month && m.top),
    byPerson: arr(v.byPerson).filter(isObj).map((p) => ({
      name: str(p.name),
      categories: arr(p.categories).filter(isObj).map((c) => ({ name: str(c.name), messages: num(c.messages) })).filter((c) => c.name),
    })).filter((p) => p.name),
    highlights: arr(v.highlights).filter(isObj).map((h) => ({
      label: str(h.label), category: str(h.category), date: str(h.date), messages: num(h.messages),
    })).filter((h) => h.label),
  };
}

/** Valida e normaliza. Erros impedem salvar; `warnings` só avisam. */
export function parseChatStats(raw: unknown): { stats: ChatStats | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { stats: null, errors: ["O JSON precisa ser um objeto."], warnings };
  const slug = str(raw.slug).trim();
  if (!SLUG_RE.test(slug)) errors.push("slug inválido: use letras, números e hífen (até 40 caracteres).");
  const byHour = numArr(raw.byHour, 24);
  const byWeekday = numArr(raw.byWeekday, 7);
  if (!byHour) errors.push("byHour precisa ter 24 números (0h a 23h).");
  if (!byWeekday) errors.push("byWeekday precisa ter 7 números (segunda a domingo).");
  if (typeof raw.totalMessages !== "number" || raw.totalMessages < 0) errors.push("totalMessages é obrigatório.");
  const people = arr(raw.people).map(parsePerson).filter((p): p is ChatStatsPerson => p !== null);
  if (arr(raw.people).length !== people.length) warnings.push("Algumas pessoas sem nome foram descartadas.");
  if (!people.length) errors.push("people: precisa de pelo menos uma pessoa.");
  if (errors.length) return { stats: null, errors, warnings };

  const ls = isObj(raw.longestStreak) ? raw.longestStreak : null;
  const topics = parseTopics(raw.topics);
  if (raw.topics && !topics) warnings.push("topics ignorado (sem categorias válidas).");
  return {
    stats: {
      slug,
      title: str(raw.title, "Estatísticas do grupo").slice(0, 100),
      isActive: raw.isActive === true,
      generatedAt: strOrNull(raw.generatedAt),
      periodStart: strOrNull(raw.periodStart),
      periodEnd: strOrNull(raw.periodEnd),
      totalMessages: num(raw.totalMessages),
      activeDays: num(raw.activeDays),
      conversations: num(raw.conversations),
      byHour: byHour!,
      byWeekday: byWeekday!,
      byMonth: arr(raw.byMonth).filter(isObj).map((m) => ({ month: str(m.month), messages: num(m.messages), avgChars: num(m.avgChars) })).filter((m) => m.month),
      longestStreak: ls && num(ls.days) > 0 ? { days: num(ls.days), start: str(ls.start), end: str(ls.end) } : null,
      people,
      interactions: arr(raw.interactions).filter(isObj).map((i) => ({ from: str(i.from), to: str(i.to), count: num(i.count) })).filter((i) => i.from && i.to),
      catchphrases: arr(raw.catchphrases).filter(isObj).map((c) => ({ phrase: str(c.phrase), count: num(c.count), topAuthor: str(c.topAuthor) })).filter((c) => c.phrase),
      topWords: arr(raw.topWords).filter(isObj).map((w) => ({ word: str(w.word), count: num(w.count) })).filter((w) => w.word),
      topics,
    },
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════
// Formatação e rankings (puro)
// ═══════════════════════════════════════════

export const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const fmtInt = (n: number): string => Math.round(n).toLocaleString("pt-BR");
export const fmtPct = (n: number): string => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** 90 → "1 min 30 s"; 5400 → "1 h 30 min"; 40 → "40 s". */
export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "2026-03" → "mar/26"; valor fora do formato volta como veio. */
export function fmtMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m || +m[2] < 1 || +m[2] > 12) return ym;
  return `${MONTHS[+m[2] - 1]}/${m[1].slice(2)}`;
}

/** "2026-03-14" → "14/03/2026"; fora do formato volta como veio. */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export interface RankRow {
  name: string;
  /** número usado para ordenar */
  value: number;
  /** texto já formatado para a tela */
  label: string;
}

export interface Ranking {
  key: string;
  title: string;
  description?: string;
  rows: RankRow[];
}

type Pick = (p: ChatStatsPerson) => number | null;

function rank(people: ChatStatsPerson[], pick: Pick, label: (v: number) => string, dir: "desc" | "asc" = "desc", n = 5): RankRow[] {
  return people
    .map((p) => ({ name: p.name, value: pick(p) }))
    .filter((r): r is { name: string; value: number } => r.value !== null && (dir === "asc" || r.value > 0))
    .sort((a, b) => (dir === "desc" ? b.value - a.value : a.value - b.value) || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, n)
    .map((r) => ({ ...r, label: label(r.value) }));
}

/** Rankings por pessoa (sem filtro de "pudor": inclui os piores). Rankings vazios são omitidos. */
export function buildRankings(stats: ChatStats, n = 5): Ranking[] {
  const p = stats.people;
  const all: Ranking[] = [
    { key: "talkers", title: "Quem mais fala", rows: rank(p, (x) => x.messages, (v) => `${fmtInt(v)} mensagens`, "desc", n) },
    { key: "ghosts", title: "Os mais calados", rows: rank(p, (x) => x.messages, (v) => `${fmtInt(v)} mensagens`, "asc", n) },
    { key: "fast", title: "Responde mais rápido", description: "Tempo mediano para responder outra pessoa (até 30 min).", rows: rank(p, (x) => x.medianResponseSec, fmtDuration, "asc", n) },
    { key: "slow", title: "Demora mais para responder", rows: rank(p, (x) => x.medianResponseSec, fmtDuration, "desc", n) },
    { key: "starters", title: "Quem puxa assunto", description: "Conversas iniciadas (depois de 3 h de silêncio).", rows: rank(p, (x) => x.starts, (v) => `${fmtInt(v)} conversas`, "desc", n) },
    { key: "enders", title: "Quem encerra a conversa", description: "Última fala antes do silêncio.", rows: rank(p, (x) => x.enders, (v) => `${fmtInt(v)} conversas`, "desc", n) },
    { key: "questions", title: "Os curiosos", description: "Proporção de mensagens com pergunta.", rows: rank(p, (x) => x.questionRate, fmtPct, "desc", n) },
    { key: "essay", title: "Reis do textão", rows: rank(p, (x) => x.avgChars, (v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} caracteres por mensagem`, "desc", n) },
    { key: "funny", title: "Quem faz o grupo rir", rows: rank(p, (x) => x.laughPercent, fmtPct, "desc", n) },
    { key: "owls", title: "Corujas da madrugada", rows: rank(p, (x) => x.nightMessages, (v) => `${fmtInt(v)} mensagens de 1h às 5h`, "desc", n) },
    { key: "audio", title: "Sommeliers de áudio", rows: rank(p, (x) => x.audio, (v) => `${fmtInt(v)} áudios`, "desc", n) },
    { key: "stickers", title: "Reis da figurinha", rows: rank(p, (x) => x.stickers, (v) => `${fmtInt(v)} figurinhas`, "desc", n) },
    { key: "photos", title: "Fotógrafos", rows: rank(p, (x) => x.photos, (v) => `${fmtInt(v)} fotos`, "desc", n) },
  ];
  return all.filter((r) => r.rows.length > 0);
}

/** Índice (0-based) do maior valor; empate fica com o primeiro. -1 se vazio ou tudo zero. */
export function peakIndex(values: number[]): number {
  let best = -1;
  let max = 0;
  values.forEach((v, i) => {
    if (v > max) {
      max = v;
      best = i;
    }
  });
  return best;
}

/** Resumo em uma linha: "mais movimentado às 22h, nas sextas". */
export function peakSummary(stats: ChatStats): string | null {
  const h = peakIndex(stats.byHour);
  const d = peakIndex(stats.byWeekday);
  if (h < 0 || d < 0) return null;
  return `Horário de pico: ${h}h · dia mais movimentado: ${WEEKDAY_NAMES[d]}`;
}

/** Pares de pessoas que mais conversam entre si (soma das duas direções), para a seção de duplas. */
export function topPairs(stats: ChatStats, n = 5): { a: string; b: string; count: number }[] {
  const sums = new Map<string, { a: string; b: string; count: number }>();
  for (const i of stats.interactions) {
    const [a, b] = [i.from, i.to].sort((x, y) => x.localeCompare(y, "pt-BR"));
    const key = `${a}\u0000${b}`;
    const cur = sums.get(key) ?? { a, b, count: 0 };
    cur.count += i.count;
    sums.set(key, cur);
  }
  return [...sums.values()].sort((x, y) => y.count - x.count || x.a.localeCompare(y.a, "pt-BR")).slice(0, n);
}
