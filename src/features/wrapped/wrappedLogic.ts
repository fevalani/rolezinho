import type {
  AutoMetricKey,
  CustomSlideType,
  GameKey,
  ResolvedSlide,
  WrappedMode,
  WrappedEdition,
  WrappedItem,
  WrappedRaw,
  WrappedSlideConfig,
  WrappedStats,
  WrappedTheme,
} from "./wrappedTypes";

// ═══════════════════════════════════════════
// Validação do JSON do admin
// ═══════════════════════════════════════════

const TYPE_ALIASES: Record<string, CustomSlideType | "auto_user_stats"> = {
  intro: "intro",
  auto_user_stats: "auto_user_stats",
  "auto-user-stats": "auto_user_stats",
  custom_ranking: "custom_ranking",
  "custom-ranking": "custom_ranking",
  "top-list": "custom_ranking",
  top_list: "custom_ranking",
  highlight: "highlight",
  quote: "quote",
  media: "media",
};

const METRIC_ALIASES: Record<string, AutoMetricKey> = {
  summary: "summary",
  total_activity: "summary",
  top_members: "top_members",
  top_music: "top_music",
  top_artists: "top_music",
  top_cultura: "top_cultura",
  top_categories: "top_cultura",
  games: "games",
  dice: "dice",
  bolao: "bolao",
  agenda: "agenda",
  peak_weekday: "peak_weekday",
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/i;
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([0-9\s.,%]+\)|hsla?\([0-9\s.,%deg]+\))$/i;

/** Só http(s): evita `javascript:`/`data:` vindos de JSON editado à mão. */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!/^https?:\/\//i.test(s) || /["'()\s<>]/.test(s)) return undefined;
  return s;
}

const str = (v: unknown, max = 300): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

function parseTheme(v: unknown): WrappedTheme | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const pick = (x: unknown) =>
    typeof x === "string" && COLOR_RE.test(x.trim()) ? x.trim() : undefined;
  const theme: WrappedTheme = {
    primary: pick(o.primary),
    secondary: pick(o.secondary),
    background: pick(o.background),
  };
  return theme.primary || theme.secondary || theme.background ? theme : undefined;
}

function parseItems(v: unknown): WrappedItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v
    .map((it, i): WrappedItem | null => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      const label = str(o.label, 80);
      if (!label) return null;
      const rank = Number(o.rank);
      return {
        rank: Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : i + 1,
        label,
        sublabel: str(o.sublabel, 80),
        imageUrl: safeUrl(o.imageUrl),
      };
    })
    .filter((x): x is WrappedItem => x !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10);
  return items;
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Data de hoje "YYYY-MM-DD" no fuso de São Paulo (padrão dos jogos diários). */
export function todayStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** Edição no ar: ativa e dentro da janela startsAt..endsAt (inclusive). */
export function isEditionLive(e: Pick<WrappedEdition, "isActive" | "startsAt" | "endsAt">, now: Date = new Date()): boolean {
  if (!e.isActive) return false;
  const today = todayStr(now);
  return (!e.startsAt || today >= e.startsAt) && (!e.endsAt || today <= e.endsAt);
}

export interface ParseResult {
  edition: WrappedEdition | null;
  errors: string[];
  warnings: string[];
}

/**
 * Valida e normaliza a configuração de uma edição. Aceita aliases do schema
 * (`order`/`position`, `top-list`/`custom_ranking`, `customSlides`/`slides`).
 * Slides inválidos são descartados com aviso; erro só se faltar o essencial.
 */
export function parseEdition(raw: unknown): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { edition: null, errors: ["O JSON precisa ser um objeto."], warnings };
  }
  const o = raw as Record<string, unknown>;

  const slugRaw = String(o.slug ?? o.id ?? "").trim();
  if (!SLUG_RE.test(slugRaw)) {
    errors.push('"slug" é obrigatório (letras, números e hífen, ex.: "2026").');
  }
  const pageTitle = str(o.pageTitle, 80);
  if (!pageTitle) errors.push('"pageTitle" é obrigatório.');

  const list: unknown[] = [
    ...(Array.isArray(o.slides) ? o.slides : []),
    ...(Array.isArray(o.customSlides) ? o.customSlides : []),
  ];
  const slides: WrappedSlideConfig[] = [];
  list.forEach((s, idx) => {
    const n = idx + 1;
    if (!s || typeof s !== "object") {
      warnings.push(`Slide ${n} ignorado: não é um objeto.`);
      return;
    }
    const so = s as Record<string, unknown>;
    const type = TYPE_ALIASES[String(so.type ?? "").toLowerCase()];
    if (!type) {
      warnings.push(`Slide ${n} ignorado: tipo "${String(so.type)}" desconhecido.`);
      return;
    }
    const pos = Number(so.position ?? so.order);
    const slide: WrappedSlideConfig = {
      position: Number.isFinite(pos) ? pos : 1000 + idx,
      type,
      title: str(so.title, 100),
      description: str(so.description, 400),
      imageUrl: safeUrl(so.imageUrl),
      backgroundImageUrl: safeUrl(so.backgroundImageUrl),
    };
    if (type === "auto_user_stats") {
      const key = METRIC_ALIASES[String(so.metricKey ?? "").toLowerCase()];
      if (!key) {
        warnings.push(`Slide ${n} ignorado: metricKey "${String(so.metricKey)}" desconhecida.`);
        return;
      }
      slide.metricKey = key;
    }
    if (type === "custom_ranking") {
      slide.items = parseItems(so.items);
      if (!slide.items?.length) {
        warnings.push(`Slide ${n} ignorado: ranking sem itens válidos.`);
        return;
      }
    }
    if ((type === "quote" || type === "highlight") && !slide.title && !slide.description) {
      warnings.push(`Slide ${n} ignorado: sem título nem texto.`);
      return;
    }
    if (type === "media" && !slide.imageUrl && !slide.backgroundImageUrl) {
      warnings.push(`Slide ${n} ignorado: mídia sem imagem válida.`);
      return;
    }
    slides.push(slide);
  });
  slides.sort((a, b) => a.position - b.position);

  const date = (k: "startsAt" | "endsAt") => {
    const v = o[k];
    if (v == null || v === "") return undefined;
    if (typeof v === "string" && DATE_RE.test(v)) return v;
    errors.push(`"${k}" deve ser uma data no formato AAAA-MM-DD.`);
    return undefined;
  };
  const startsAt = date("startsAt");
  const endsAt = date("endsAt");
  if (startsAt && endsAt && endsAt < startsAt) errors.push('"endsAt" não pode ser anterior a "startsAt".');

  if (errors.length) return { edition: null, errors, warnings };
  return {
    edition: {
      slug: slugRaw,
      pageTitle: pageTitle!,
      subtitle: str(o.subtitle, 160),
      theme: parseTheme(o.theme),
      isActive: o.isActive === true,
      startsAt,
      endsAt,
      slides,
    },
    errors,
    warnings,
  };
}

export const SAMPLE_EDITION_JSON = JSON.stringify(
  {
    slug: String(new Date().getFullYear()),
    pageTitle: `Wrapped ${new Date().getFullYear()}`,
    subtitle: "Tudo o que marcou o seu ano por aqui",
    isActive: false,
    startsAt: `${new Date().getFullYear()}-12-01`,
    endsAt: `${new Date().getFullYear() + 1}-01-15`,
    theme: { primary: "#e8c86e", secondary: "#7c5cff", background: "#05050a" },
    slides: [
      { position: 1, type: "intro", title: "Preparado para rever seu ano?", description: "Separamos seus melhores momentos e números." },
      { position: 2, type: "auto_user_stats", metricKey: "summary" },
      { position: 3, type: "auto_user_stats", metricKey: "top_music" },
      { position: 4, type: "auto_user_stats", metricKey: "games" },
      { position: 5, type: "auto_user_stats", metricKey: "top_members" },
      {
        position: 6,
        type: "custom_ranking",
        title: "Destaques do grupo",
        items: [{ rank: 1, label: "Item campeão", sublabel: "12 votos" }],
      },
    ],
  },
  null,
  2,
);

// ═══════════════════════════════════════════
// Datas
// ═══════════════════════════════════════════

/** Ano da edição: o próprio slug quando for "AAAA", senão o ano atual. */
export function editionYear(slug: string, now: Date = new Date()): number {
  return /^\d{4}$/.test(slug) ? Number(slug) : now.getFullYear();
}

export function yearRange(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year + 1}-01-01`,
    startTs: `${year}-01-01T00:00:00.000Z`,
    endTs: `${year + 1}-01-01T00:00:00.000Z`,
  };
}

const dayNumber = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, dd) / 86_400_000);
};

/** Maior sequência de dias consecutivos presentes em `dates` (YYYY-MM-DD). */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map((d) => d.slice(0, 10)))].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  days.forEach((d, i) => {
    cur = i > 0 && d === days[i - 1] + 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  });
  return best;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const GAME_LABELS: Record<GameKey, string> = {
  letreco: "Letreco",
  letroso: "Letroso",
  sudoku: "Sudoku",
  word500: "Word500",
  fronteiras: "Fronteiras",
};

function topCounts<T>(rows: T[], key: (r: T) => string | null | undefined, n: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r)?.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}

// ═══════════════════════════════════════════
// Estatísticas automáticas
// ═══════════════════════════════════════════

export function computeStats(raw: WrappedRaw, year: number): WrappedStats {
  const { musics, culturaPosts, culturaItems, dice, games, predictions, rsvps } = raw;

  const itemById = new Map(culturaItems.map((i) => [i.id, i]));

  const music = musics.length
    ? {
        total: musics.length,
        top: topCounts(musics, (m) => m.artist ?? m.title, 5).map(([label, count]) => ({
          label,
          count,
          imageUrl: safeUrl(
            musics.find((m) => (m.artist ?? m.title)?.trim() === label && m.thumbnail)?.thumbnail,
          ),
        })),
      }
    : null;

  let cultura: WrappedStats["cultura"] = null;
  if (culturaPosts.length) {
    const rated = culturaPosts.filter((p) => p.personal_rating != null);
    const avg = rated.length
      ? rated.reduce((s, p) => s + (p.personal_rating ?? 0), 0) / rated.length
      : null;
    const bestPost = [...rated].sort((a, b) => (b.personal_rating ?? 0) - (a.personal_rating ?? 0))[0];
    const bestItem = bestPost ? itemById.get(bestPost.item_id) : undefined;
    cultura = {
      total: culturaPosts.length,
      avgRating: avg == null ? null : Math.round(avg * 10) / 10,
      topGenres: topCounts(
        culturaPosts.flatMap((p) => itemById.get(p.item_id)?.genres ?? []),
        (g) => g,
        5,
      ).map(([label, count]) => ({ label, count })),
      best:
        bestPost && bestItem
          ? { title: bestItem.title, rating: bestPost.personal_rating!, imageUrl: safeUrl(bestItem.cover_url) }
          : null,
    };
  }

  let gamesStats: WrappedStats["games"] = null;
  if (games.length) {
    const [favKey, favCount] = topCounts(games, (g) => g.game, 1)[0];
    gamesStats = {
      played: games.length,
      won: games.filter((g) => g.status === "won").length,
      points: games.reduce((s, g) => s + (g.score || 0), 0),
      favorite: { game: favKey as GameKey, label: GAME_LABELS[favKey as GameKey] ?? favKey, count: favCount },
      longestStreak: longestStreak(games.map((g) => g.game_date)),
    };
  }

  let diceStats: WrappedStats["dice"] = null;
  if (dice.length) {
    const d20 = dice.filter((d) => d.dice_type === "d20");
    diceStats = {
      total: dice.length,
      crits: d20.filter((d) => d.result === 20).length,
      fumbles: d20.filter((d) => d.result === 1).length,
      favoriteDice: topCounts(dice, (d) => d.dice_type, 1)[0][0].toUpperCase(),
    };
  }

  const bolao = predictions.length
    ? { total: predictions.length, points: predictions.reduce((s, p) => s + (p.points_earned ?? 0), 0) }
    : null;

  const agenda = rsvps.length
    ? {
        confirmed: rsvps.filter((r) => r.status === "confirmed").length,
        maybe: rsvps.filter((r) => r.status === "maybe").length,
      }
    : null;

  const allDates = [
    ...musics.map((m) => m.pick_date),
    ...games.map((g) => g.game_date),
    ...culturaPosts.map((p) => p.created_at),
    ...dice.map((d) => d.created_at),
    ...predictions.map((p) => p.created_at),
    ...rsvps.map((r) => r.updated_at),
  ];
  const wd = topCounts(allDates, (d) => String(new Date(d.slice(0, 10) + "T12:00:00Z").getUTCDay()), 1)[0];

  return {
    year,
    totalActions: allDates.length,
    music,
    cultura,
    games: gamesStats,
    dice: diceStats,
    bolao,
    agenda,
    peakWeekday: wd ? { label: WEEKDAYS[Number(wd[0])], count: wd[1] } : null,
  };
}

/** Membros mais ativos do grupo (modo grupo). `names` = id → nome de exibição. */
export function computeMemberRanking(raw: WrappedRaw, names: Record<string, string>): WrappedItem[] {
  const all = [...raw.musics, ...raw.culturaPosts, ...raw.dice, ...raw.games, ...raw.predictions, ...raw.rsvps];
  return topCounts(all, (r) => r.user_id, 5).map(([id, count], i) => ({
    rank: i + 1,
    label: (names[id] ?? "Alguém").split(" ")[0],
    sublabel: `${nf(count)} ${count === 1 ? "ação" : "ações"}`,
  }));
}

// ═══════════════════════════════════════════
// Edição + estatísticas → slides
// ═══════════════════════════════════════════

const nf = (n: number) => n.toLocaleString("pt-BR");

/** Slide automático; `null` quando o usuário não tem dados dessa métrica. */
export function resolveAuto(
  key: AutoMetricKey,
  s: WrappedStats,
  cfg: { title?: string; description?: string },
  mode: WrappedMode = "user",
  members: WrappedItem[] = [],
): Omit<ResolvedSlide, "key"> | null {
  const g = mode === "group";
  const t = (user: string, group = user) => cfg.title ?? (g ? group : user);
  switch (key) {
    case "top_members":
      if (!g || !members.length) return null;
      return { kind: "list", emoji: "🏆", title: t("", "Quem mais apareceu"), description: cfg.description, items: members };
    case "summary":
      if (!s.totalActions) return null;
      return {
        kind: "stat",
        emoji: "✨",
        title: t("Seu ano em números", "O ano do grupo em números"),
        description: cfg.description,
        big: { value: nf(s.totalActions), label: g ? "ações registradas pelo grupo" : "ações registradas por aqui" },
      };
    case "top_music":
      if (!s.music) return null;
      return {
        kind: "list",
        emoji: "🎵",
        title: t("O que você mais ouviu", "O que o grupo mais ouviu"),
        description: cfg.description ?? `${nf(s.music.total)} indicações no ano`,
        items: s.music.top.map((m, i) => ({
          rank: i + 1,
          label: m.label,
          sublabel: `${nf(m.count)} ${m.count === 1 ? "vez" : "vezes"}`,
          imageUrl: m.imageUrl,
        })),
      };
    case "top_cultura": {
      if (!s.cultura) return null;
      const c = s.cultura;
      if (c.topGenres.length) {
        return {
          kind: "list",
          emoji: "🎬",
          title: t("O que você mais explorou", "O que o grupo mais explorou"),
          description: cfg.description ?? `${nf(c.total)} posts em Cultura`,
          items: c.topGenres.map((g, i) => ({
            rank: i + 1,
            label: g.label,
            sublabel: `${nf(g.count)} ${g.count === 1 ? "post" : "posts"}`,
          })),
        };
      }
      return {
        kind: "stat",
        emoji: "🎬",
        title: t("Sua cultura", "A cultura do grupo"),
        big: { value: nf(c.total), label: c.total === 1 ? "post em Cultura" : "posts em Cultura" },
      };
    }
    case "games":
      if (!s.games) return null;
      return {
        kind: "stat",
        emoji: "🎮",
        title: t("Nos jogos diários", "Nos jogos do grupo"),
        description: cfg.description,
        big: { value: nf(s.games.played), label: "partidas jogadas" },
        facts: [
          { label: "Vitórias", value: nf(s.games.won) },
          { label: "Favorito", value: s.games.favorite.label },
          { label: "Maior sequência", value: `${s.games.longestStreak} ${s.games.longestStreak === 1 ? "dia" : "dias"}` },
        ],
      };
    case "dice":
      if (!s.dice) return null;
      return {
        kind: "stat",
        emoji: "🎲",
        title: t("Rolando os dados", "Os dados do grupo"),
        description: cfg.description,
        big: { value: nf(s.dice.total), label: "rolagens" },
        facts: [
          { label: "Críticos (20)", value: nf(s.dice.crits) },
          { label: "Falhas (1)", value: nf(s.dice.fumbles) },
          { label: "Dado favorito", value: s.dice.favoriteDice },
        ],
      };
    case "bolao":
      if (!s.bolao) return null;
      return {
        kind: "stat",
        emoji: "⚽",
        title: t("No bolão", "O grupo no bolão"),
        description: cfg.description,
        big: { value: nf(s.bolao.total), label: "palpites dados" },
        facts: [{ label: "Pontos", value: nf(s.bolao.points) }],
      };
    case "agenda":
      if (!s.agenda) return null;
      return {
        kind: "stat",
        emoji: "📅",
        title: t("Presença nos rolês", "Presença do grupo nos rolês"),
        description: cfg.description,
        big: { value: nf(s.agenda.confirmed), label: "presenças confirmadas" },
        facts: s.agenda.maybe ? [{ label: "Talvez", value: nf(s.agenda.maybe) }] : undefined,
      };
    case "peak_weekday":
      if (!s.peakWeekday) return null;
      return {
        kind: "stat",
        emoji: "🗓️",
        title: t("Seu dia favorito", "O dia favorito do grupo"),
        description: cfg.description,
        big: { value: s.peakWeekday.label, label: g ? "foi o dia em que o grupo mais apareceu" : "foi o dia em que você mais apareceu" },
      };
  }
}

/** Resumo final (também usado no card de compartilhar). */
export function summaryFacts(s: WrappedStats): { label: string; value: string }[] {
  const f: { label: string; value: string }[] = [];
  if (s.totalActions) f.push({ label: "Ações no ano", value: nf(s.totalActions) });
  if (s.games) f.push({ label: "Partidas", value: nf(s.games.played) });
  if (s.music?.top[0]) f.push({ label: "Mais ouvido", value: s.music.top[0].label });
  if (s.cultura?.best) f.push({ label: "Melhor nota", value: s.cultura.best.title });
  else if (s.cultura) f.push({ label: "Posts em Cultura", value: nf(s.cultura.total) });
  if (s.dice) f.push({ label: "Rolagens", value: nf(s.dice.total) });
  if (s.peakWeekday) f.push({ label: "Dia favorito", value: s.peakWeekday.label });
  return f.slice(0, 4);
}

/**
 * Monta o fluxo final: slides da edição na ordem, omitindo métricas sem dados;
 * garante abertura (intro) e fechamento (resumo + compartilhar).
 */
export function buildSlides(
  edition: WrappedEdition,
  stats: WrappedStats,
  opts: { mode?: WrappedMode; members?: WrappedItem[] } = {},
): ResolvedSlide[] {
  const out: ResolvedSlide[] = [];
  edition.slides.forEach((c, i) => {
    const key = `s${i}`;
    switch (c.type) {
      case "intro":
        out.push({ key, kind: "intro", title: c.title ?? edition.pageTitle, description: c.description ?? edition.subtitle, imageUrl: c.imageUrl, backgroundImageUrl: c.backgroundImageUrl });
        break;
      case "auto_user_stats": {
        const r = resolveAuto(c.metricKey!, stats, c, opts.mode, opts.members);
        if (r) out.push({ key, backgroundImageUrl: c.backgroundImageUrl, imageUrl: c.imageUrl, ...r });
        break;
      }
      case "custom_ranking":
        out.push({ key, kind: "list", title: c.title, description: c.description, items: c.items, backgroundImageUrl: c.backgroundImageUrl, imageUrl: c.imageUrl });
        break;
      case "highlight":
      case "quote":
      case "media":
        out.push({ key, kind: c.type, title: c.title, description: c.description, imageUrl: c.imageUrl, backgroundImageUrl: c.backgroundImageUrl });
        break;
    }
  });

  if (!out.some((s) => s.kind === "intro")) {
    out.unshift({ key: "intro", kind: "intro", title: edition.pageTitle, description: edition.subtitle });
  }
  out.push({
    key: "outro",
    kind: "outro",
    emoji: "🎉",
    title: edition.pageTitle,
    description: "Obrigado por fazer parte do ano!",
    facts: summaryFacts(stats),
  });
  return out;
}

// ═══════════════════════════════════════════
// Navegação dos stories
// ═══════════════════════════════════════════

export const SLIDE_MS = 6000;

export type TapAction = "prev" | "next" | "none";

/** Decide o que um toque/arrasto faz. Toque curto: 1/3 esquerdo volta, resto avança. */
export function resolveGesture(g: {
  dx: number;
  dy: number;
  heldMs: number;
  x: number;
  width: number;
}): TapAction {
  if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy)) return g.dx < 0 ? "next" : "prev";
  if (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10 || g.heldMs >= 250) return "none";
  return g.x < g.width / 3 ? "prev" : "next";
}

export const clampIndex = (i: number, len: number) => Math.max(0, Math.min(len - 1, i));
