// ══════════════════════════════════════════════════════════════
// footballApi.ts — football-data.org (primária) + SofaScore (fallback)
// ══════════════════════════════════════════════════════════════

import { CapacitorHttp, Capacitor } from "@capacitor/core";

export type ChampionshipCode = "BSA" | "WC";

export interface FDMatch {
  id: number;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  utcDate: string;
  status: string;
  stage: string;
  matchday: number | null;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
}

export const CHAMPIONSHIPS_CONFIG: Record<
  ChampionshipCode,
  {
    name: string;
    fd_id: number;
    fd_code: string;
    season: string;
    sofa_tournament_id: number;
    sofa_date_range?: { start: string; end: string };
  }
> = {
  BSA: {
    name: "Brasileirão Série A 2026",
    fd_id: 2013,
    fd_code: "BSA",
    season: "2026",
    sofa_tournament_id: 325,
  },
  WC: {
    name: "Copa do Mundo 2026",
    fd_id: 2000,
    fd_code: "WC",
    season: "2026",
    sofa_tournament_id: 3954, // mantido como referência, não utilizado
    sofa_date_range: { start: "2026-06-11", end: "2026-07-19" },
  },
};

const FD_KEY = import.meta.env.VITE_FOOTBALL_DATA_KEY as string | undefined;
const FD_BASE_NATIVE = "https://api.football-data.org/v4";
// Dev: proxy Vite. Prod web (Vercel): serverless proxy. Nativo: direto.
const FD_BASE_WEB = import.meta.env.DEV ? "/fd-api" : "/api/fd-proxy";
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY as string | undefined;
const SOFA_BASE = "https://sportapi7.p.rapidapi.com";
const SOFA_HOST = "sportapi7.p.rapidapi.com";

// Rate limit: ~10 req/min para football-data.org
let lastFDCall = 0;
const FD_MIN_INTERVAL = 6200;

// Wrapper unificado: usa CapacitorHttp no nativo (bypassa CORS), fetch no web.
interface SimpleResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

async function nativeFetch(
  url: string,
  headers: Record<string, string>,
): Promise<SimpleResponse> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, headers });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      statusText: String(res.status),
      json: async () => res.data,
    };
  }
  const res = await fetch(url, { headers });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    json: () => res.json(),
  };
}

async function fdFetch(path: string): Promise<SimpleResponse> {
  const now = Date.now();
  const wait = FD_MIN_INTERVAL - (now - lastFDCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFDCall = Date.now();

  if (Capacitor.isNativePlatform()) {
    return nativeFetch(`${FD_BASE_NATIVE}${path}`, { "X-Auth-Token": FD_KEY ?? "" });
  }

  // Browser: dev usa /fd-api (proxy Vite), prod usa /api/fd-proxy?path=...
  const url = import.meta.env.DEV
    ? `${FD_BASE_WEB}${path}`
    : `${FD_BASE_WEB}?path=${encodeURIComponent(path)}`;
  return nativeFetch(url, {});
}

async function sofaFetch(path: string): Promise<SimpleResponse> {
  return nativeFetch(`${SOFA_BASE}${path}`, {
    "x-rapidapi-key": RAPIDAPI_KEY ?? "",
    "x-rapidapi-host": SOFA_HOST,
    "Content-Type": "application/json",
  });
}

// Mapeamento de stages para português
const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Fase de Grupos",
  ROUND_OF_16: "Oitavas de Final",
  QUARTER_FINALS: "Quartas de Final",
  SEMI_FINALS: "Semifinal",
  THIRD_PLACE: "Disputa de 3º Lugar",
  FINAL: "Final",
  PLAYOFF_ROUND_ONE: "Playoff Rodada 1",
  PLAYOFF_ROUND_TWO: "Playoff Rodada 2",
};

export function toRoundLabel(
  stage: string,
  matchday: number | null,
): string {
  if (
    (stage === "REGULAR_SEASON" || stage === "GROUP_STAGE") &&
    matchday !== null
  ) {
    return `Rodada ${matchday}`;
  }
  return STAGE_LABELS[stage] ?? stage;
}

// Ordem dos stages para controle de visibilidade (knockout)
// WC 2026 tem Round of 32 antes das Oitavas
export const KNOCKOUT_STAGE_ORDER = [
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

// ─── football-data.org ────────────────────────────────────────

async function fetchMatchesFD(
  code: ChampionshipCode,
): Promise<{ matches: FDMatch[]; error: string | null }> {
  if (!FD_KEY) {
    return { matches: [], error: "VITE_FOOTBALL_DATA_KEY não configurada" };
  }
  const cfg = CHAMPIONSHIPS_CONFIG[code];
  try {
    const res = await fdFetch(
      `/competitions/${cfg.fd_code}/matches?season=${cfg.season}`,
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      if (res.status === 403) detail = "API key inválida ou não confirmada";
      if (res.status === 429) detail = "Rate limit atingido, tente em 1 minuto";
      if (res.status === 404) detail = `Campeonato "${code}" não encontrado na API`;
      console.error(`[FD] ${res.status} ${res.statusText}`);
      return { matches: [], error: `football-data.org: ${detail}` };
    }
    const data = await res.json() as { matches?: FDMatch[] };
    const matches = (data.matches ?? []) as FDMatch[];
    if (matches.length === 0) {
      return { matches: [], error: `Nenhuma partida encontrada para ${cfg.name} ${cfg.season}` };
    }
    return { matches, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[FD] fetchMatchesFD error", err);
    return { matches: [], error: `Erro de conexão: ${msg}` };
  }
}

async function fetchMatchResultFD(
  fdMatchId: number,
): Promise<{ home: number | null; away: number | null; status: string } | null> {
  if (!FD_KEY) return null;
  try {
    const res = await fdFetch(`/matches/${fdMatchId}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      score?: { fullTime?: { home?: number | null; away?: number | null } };
      status?: string;
    };
    return {
      home: data.score?.fullTime?.home ?? null,
      away: data.score?.fullTime?.away ?? null,
      status: data.status ?? "UNKNOWN",
    };
  } catch {
    return null;
  }
}

// ─── SofaScore fallback ──────────────────────────────────────

interface SofaEvent {
  id: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  startTimestamp: number;
  status: { type: string };
  homeScore?: { current?: number };
  awayScore?: { current?: number };
}

function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchMatchResultSofa(
  homeTeam: string,
  awayTeam: string,
  utcDate: string,
): Promise<{ home: number | null; away: number | null; status: string } | null> {
  if (!RAPIDAPI_KEY) return null;
  const dateStr = utcDate.slice(0, 10);
  try {
    const res = await sofaFetch(
      `/api/v1/sport/football/scheduled-events/${dateStr}`,
    );
    if (!res.ok) return null;
    const data = await res.json() as { events?: SofaEvent[] };
    const events: SofaEvent[] = data.events ?? [];

    const normHome = normalizeTeamName(homeTeam);
    const normAway = normalizeTeamName(awayTeam);

    const match = events.find((e) => {
      const eHome = normalizeTeamName(e.homeTeam.name);
      const eAway = normalizeTeamName(e.awayTeam.name);
      const homeMatch =
        eHome.includes(normHome.slice(0, 5)) ||
        normHome.includes(eHome.slice(0, 5));
      const awayMatch =
        eAway.includes(normAway.slice(0, 5)) ||
        normAway.includes(eAway.slice(0, 5));
      return homeMatch && awayMatch;
    });

    if (!match) return null;

    const finished = match.status.type === "finished";
    return {
      home: finished ? (match.homeScore?.current ?? null) : null,
      away: finished ? (match.awayScore?.current ?? null) : null,
      status: finished ? "FINISHED" : match.status.type.toUpperCase(),
    };
  } catch {
    return null;
  }
}

// ─── SofaScore: busca completa de torneio ────────────────────

interface SofaTournamentEvent {
  id: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  startTimestamp: number;
  status: { type: string; code: number };
  homeScore?: { current?: number | null };
  awayScore?: { current?: number | null };
  roundInfo?: { round?: number; name?: string };
  tournament?: {
    name?: string;
    slug?: string;
    uniqueTournament?: { id?: number; name?: string; slug?: string };
  };
}

const SOFA_KNOCKOUT_STAGE_MAP: Record<string, string> = {
  "round of 32": "ROUND_OF_32",
  "round of 16": "ROUND_OF_16",
  "quarter-final": "QUARTER_FINALS",
  "semi-final": "SEMI_FINALS",
  "3rd place": "THIRD_PLACE",
  "final": "FINAL",
};

function sofaStatusToFD(type: string): string {
  switch (type) {
    case "finished":   return "FINISHED";
    case "inprogress": return "IN_PLAY";
    case "postponed":  return "POSTPONED";
    case "canceled":   return "CANCELLED";
    default:           return "TIMED";
  }
}

function sofaEventToFDMatch(e: SofaTournamentEvent): FDMatch {
  const utcDate = new Date(e.startTimestamp * 1000).toISOString();
  const status = sofaStatusToFD(e.status.type);
  const finished = e.status.type === "finished";

  // Determina stage e matchday a partir de roundInfo
  const roundName = (e.roundInfo?.name ?? "").toLowerCase();
  let stage = "GROUP_STAGE";
  let matchday: number | null = e.roundInfo?.round ?? null;

  for (const [key, val] of Object.entries(SOFA_KNOCKOUT_STAGE_MAP)) {
    if (roundName.includes(key)) {
      stage = val;
      matchday = null;
      break;
    }
  }

  return {
    id: e.id,
    homeTeam: { name: e.homeTeam.name, crest: null },
    awayTeam: { name: e.awayTeam.name, crest: null },
    utcDate,
    status,
    stage,
    matchday,
    score: {
      fullTime: {
        home: finished ? (e.homeScore?.current ?? null) : null,
        away: finished ? (e.awayScore?.current ?? null) : null,
      },
    },
  };
}

// Retorna true se o evento pertence à Copa do Mundo (filtro por nome/slug do torneio)
function isWorldCupEvent(e: SofaTournamentEvent): boolean {
  const ut = e.tournament?.uniqueTournament;
  const combined = [
    ut?.name ?? "",
    ut?.slug ?? "",
    e.tournament?.name ?? "",
    e.tournament?.slug ?? "",
  ].join(" ").toLowerCase();

  return (
    (combined.includes("world cup") ||
      combined.includes("world championship") ||
      combined.includes("copa do mundo") ||
      combined.includes("mondial")) &&
    // Exclui competições menores (beach soccer, futsal, etc.)
    !combined.includes("beach") &&
    !combined.includes("futsal") &&
    !combined.includes("youth") &&
    !combined.includes("women")
  );
}

// Retorna eventos do dia + status HTTP (para detectar 429)
async function fetchSofaEventsByDate(
  dateStr: string,
): Promise<{ events: SofaTournamentEvent[]; rateLimited: boolean }> {
  try {
    const res = await sofaFetch(`/api/v1/sport/football/scheduled-events/${dateStr}`);
    if (res.status === 429) return { events: [], rateLimited: true };
    if (!res.ok) return { events: [], rateLimited: false };
    const data = await res.json() as { events?: SofaTournamentEvent[] };
    return { events: data.events ?? [], rateLimited: false };
  } catch {
    return { events: [], rateLimited: false };
  }
}

async function fetchMatchesSofaByDateRange(
  startDate: string,
  endDate: string,
  filter: (e: SofaTournamentEvent) => boolean,
): Promise<{ matches: FDMatch[]; partialError: string | null }> {
  if (!RAPIDAPI_KEY) {
    return { matches: [], partialError: "VITE_RAPIDAPI_KEY não configurada" };
  }

  // Gera lista de datas no intervalo
  const dates: string[] = [];
  const d = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const all: SofaTournamentEvent[] = [];
  let rateLimitedFrom: string | null = null;

  // Busca sequencial com 1.2s entre chamadas para respeitar rate limit (~50 req/min)
  for (const dateStr of dates) {
    const { events, rateLimited } = await fetchSofaEventsByDate(dateStr);

    if (rateLimited) {
      rateLimitedFrom = dateStr;
      console.warn(`[SofaScore] Rate limit atingido em ${dateStr}. Partidas parciais: ${all.length}`);
      break;
    }

    all.push(...events.filter(filter));
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Loga IDs dos torneios encontrados para facilitar futura otimização
  if (all.length > 0) {
    const tourInfo = new Map<number, string>();
    for (const e of all) {
      const id = e.tournament?.uniqueTournament?.id;
      const name = e.tournament?.uniqueTournament?.name ?? e.tournament?.name ?? "?";
      if (id !== undefined) tourInfo.set(id, name);
    }
    console.log(`[SofaScore] ${all.length} partidas encontradas.`);
    for (const [id, name] of tourInfo) {
      console.log(`  uniqueTournament.id=${id} → "${name}"`);
    }
  }

  const seen = new Set<number>();
  const unique = all.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const partialError = rateLimitedFrom
    ? `Rate limit atingido (a partir de ${rateLimitedFrom}). ${unique.length} partidas salvas. Aguarde alguns minutos e tente novamente para carregar o restante.`
    : null;

  return { matches: unique.map(sofaEventToFDMatch), partialError };
}

async function fetchAllMatchesSofaTournament(
  code: ChampionshipCode,
): Promise<{ matches: FDMatch[]; error: string | null }> {
  if (!RAPIDAPI_KEY) {
    return { matches: [], error: "VITE_RAPIDAPI_KEY não configurada" };
  }

  const cfg = CHAMPIONSHIPS_CONFIG[code];

  // Estratégia por intervalo de datas (Copa do Mundo e similares)
  if (cfg.sofa_date_range) {
    const { matches, partialError } = await fetchMatchesSofaByDateRange(
      cfg.sofa_date_range.start,
      cfg.sofa_date_range.end,
      isWorldCupEvent,
    );
    if (matches.length === 0) {
      return { matches: [], error: partialError ?? "Nenhuma partida encontrada no período" };
    }
    // Retorna o que foi coletado; o erro parcial é propagado para informar o usuário
    return { matches, error: partialError };
  }

  // Estratégia por tournament ID direto (Brasileirão e outros)
  const all: SofaTournamentEvent[] = [];
  for (const direction of ["last", "next"] as const) {
    for (let page = 0; page < 10; page++) {
      try {
        const res = await sofaFetch(
          `/api/v1/tournament/${cfg.sofa_tournament_id}/events/${direction}/${page}`,
        );
        if (!res.ok) break;
        const data = await res.json() as { events?: SofaTournamentEvent[] };
        const events = data.events ?? [];
        if (events.length === 0) break;
        all.push(...events);
      } catch {
        break;
      }
    }
  }

  if (all.length === 0) {
    return { matches: [], error: `SofaScore: nenhuma partida encontrada para tournament ${cfg.sofa_tournament_id}` };
  }

  const seen = new Set<number>();
  const unique = all.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  console.log(`[SofaScore] ${unique.length} partidas carregadas para tournament ${cfg.sofa_tournament_id}`);
  return { matches: unique.map(sofaEventToFDMatch), error: null };
}

// ─── API pública ─────────────────────────────────────────────

export async function fetchChampionshipMatches(
  code: ChampionshipCode,
): Promise<{ matches: FDMatch[]; error: string | null }> {
  const result = await fetchMatchesFD(code);
  if (result.matches.length > 0) return result;

  // Fallback: SofaScore para campeonatos não disponíveis no football-data.org
  console.log(`[SofaScore] FD falhou para ${code}, tentando SofaScore...`);
  return fetchAllMatchesSofaTournament(code);
}

export async function fetchMatchResult(
  fdMatchId: number,
  homeTeam: string,
  awayTeam: string,
  utcDate: string,
): Promise<{ home: number | null; away: number | null; status: string } | null> {
  const primary = await fetchMatchResultFD(fdMatchId);
  if (primary) return primary;
  return fetchMatchResultSofa(homeTeam, awayTeam, utcDate);
}
