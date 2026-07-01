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
    /** Placar final "oficial" da API. Em jogos REGULAR é o placar de 90min.
     *  Em jogos com prorrogação/pênaltis, a API inclui TUDO aqui (90min + ET + pênaltis) —
     *  não usar como placar de 90min nesses casos, usar regularTime. */
    fullTime: { home: number | null; away: number | null };
    /** Placar ao fim dos 90min regulamentares. Só vem preenchido quando houve
     *  prorrogação e/ou pênaltis (duration !== "REGULAR"). */
    regularTime?: { home: number | null; away: number | null } | null;
    /** Gols marcados APENAS na prorrogação (delta, não cumulativo). Null quando não houve. */
    extraTime?: { home: number | null; away: number | null } | null;
    /** Gols convertidos na disputa de pênaltis. Null quando não houve. */
    penalties?: { home: number | null; away: number | null } | null;
    /** "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" */
    duration?: string | null;
  };
}

/** Resultado detalhado retornado pelas funções de fetch de resultado. */
export interface MatchScoreResult {
  /** Placar após prorrogação (sem gols de pênaltis). Valor que fica em score_home/away no banco. */
  home: number | null;
  away: number | null;
  /** Placar apenas aos 90min, diferente de home/away somente quando houve prorrogação. */
  regularHome: number | null;
  regularAway: number | null;
  /** Gols da disputa de pênaltis (ex: 5-3). Null quando não houve. */
  penaltyHome: number | null;
  penaltyAway: number | null;
  status: string;
}

export const CHAMPIONSHIPS_CONFIG: Record<
  ChampionshipCode,
  {
    name: string;
    fd_id: number;
    fd_code: string;
    season: string;
    sofa_tournament_id: number;
    // Unique tournament ID permanente (ex: FIFA World Cup = 16). Quando presente,
    // o season ID é descoberto automaticamente via /api/v1/unique-tournament/{id}/seasons.
    sofa_unique_id?: number;
    sofa_season_year?: string;
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
    sofa_tournament_id: 3954,  // fallback (season-specific, pode mudar)
    sofa_unique_id: 16,         // FIFA World Cup — ID permanente no SofaScore
    sofa_season_year: "2026",
  },
};

const FD_KEY = import.meta.env.VITE_FOOTBALL_DATA_KEY as string | undefined;
const FD_BASE_NATIVE = "https://api.football-data.org/v4";
// Dev: proxy Vite. Prod web (Vercel): serverless proxy. Nativo: direto.
const FD_BASE_WEB = import.meta.env.DEV ? "/fd-api" : "/api/fd-proxy";
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY as string | undefined;
const SPORTSDB_BASE_NATIVE = "https://www.thesportsdb.com/api/v1/json/3";
const SPORTSDB_BASE_WEB = import.meta.env.DEV ? "/sportsdb-api" : "/api/sportsdb-proxy";
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
  return nativeFetch(url, FD_KEY ? { "X-Auth-Token": FD_KEY } : {});
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
  LAST_32: "Dezesseis-avos de Final",
  ROUND_OF_32: "Dezesseis-avos de Final",
  LAST_16: "Oitavas de Final",
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
// WC 2026 usa LAST_32; outros campeonatos podem usar ROUND_OF_32
// WC 2026 usa LAST_32 e LAST_16; outros campeonatos podem usar ROUND_OF_32/ROUND_OF_16.
// Ambas as variantes são listadas para que a lógica de visibilidade funcione em qualquer caso.
export const KNOCKOUT_STAGE_ORDER = [
  "LAST_32",
  "ROUND_OF_32",
  "LAST_16",
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
): Promise<MatchScoreResult | null> {
  if (!FD_KEY) return null;
  try {
    const res = await fdFetch(`/matches/${fdMatchId}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      score?: {
        fullTime?: { home?: number | null; away?: number | null };
        regularTime?: { home?: number | null; away?: number | null } | null;
        extraTime?: { home?: number | null; away?: number | null } | null;
        penalties?: { home?: number | null; away?: number | null } | null;
        duration?: string | null;
      };
      status?: string;
    };

    const ftHome = data.score?.fullTime?.home ?? null;
    const ftAway = data.score?.fullTime?.away ?? null;
    const rtHome = data.score?.regularTime?.home ?? null;
    const rtAway = data.score?.regularTime?.away ?? null;
    // delta de gols na prorrogação (não cumulativo)
    const etDeltaHome = data.score?.extraTime?.home ?? null;
    const etDeltaAway = data.score?.extraTime?.away ?? null;
    const penHome = data.score?.penalties?.home ?? null;
    const penAway = data.score?.penalties?.away ?? null;
    const duration = data.score?.duration ?? null;

    const hadET = duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT";
    // Placar dos 90min: quando houve ET/pênaltis, a API já inclui tudo em
    // fullTime, então o placar de 90min real vem de regularTime, não de fullTime.
    const baseHome = hadET ? (rtHome ?? ftHome) : ftHome;
    const baseAway = hadET ? (rtAway ?? ftAway) : ftAway;
    const etHome = hadET && etDeltaHome !== null && baseHome !== null ? baseHome + etDeltaHome : null;
    const etAway = hadET && etDeltaAway !== null && baseAway !== null ? baseAway + etDeltaAway : null;

    return {
      // score_home/away no banco = placar após prorrogação (sem pênaltis)
      home: etHome ?? baseHome,
      away: etAway ?? baseAway,
      // score_regular = 90min somente, preenchido só quando houve prorrogação
      regularHome: hadET ? baseHome : null,
      regularAway: hadET ? baseAway : null,
      penaltyHome: penHome,
      penaltyAway: penAway,
      status: data.status ?? "UNKNOWN",
    };
  } catch {
    return null;
  }
}

// ─── SofaScore fallback ──────────────────────────────────────

interface SofaScore {
  current?: number | null;
  /** Placar ao fim dos 90min (sem prorrogação). Disponível via API RapidAPI. */
  normaltime?: number | null;
  /** Gols convertidos na disputa de pênaltis. */
  penalties?: number | null;
}

interface SofaEvent {
  id: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  startTimestamp: number;
  status: { type: string };
  homeScore?: SofaScore;
  awayScore?: SofaScore;
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
): Promise<MatchScoreResult | null> {
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
    if (!finished) {
      return { home: null, away: null, regularHome: null, regularAway: null, penaltyHome: null, penaltyAway: null, status: match.status.type.toUpperCase() };
    }

    const curHome = match.homeScore?.current ?? null;
    const curAway = match.awayScore?.current ?? null;
    // normaltime = placar 90min; se disponível e diferente de current, houve prorrogação
    const ntHome = match.homeScore?.normaltime ?? null;
    const ntAway = match.awayScore?.normaltime ?? null;
    const penHome = match.homeScore?.penalties ?? null;
    const penAway = match.awayScore?.penalties ?? null;

    const hadET = ntHome !== null && ntHome !== curHome;
    return {
      home: curHome,  // current = placar após prorrogação (sem pênaltis)
      away: curAway,
      regularHome: hadET ? ntHome : null,
      regularAway: hadET ? ntAway : null,
      penaltyHome: penHome,
      penaltyAway: penAway,
      status: "FINISHED",
    };
  } catch {
    return null;
  }
}

// ─── TheSportsDB (gratuito, sem chave, fallback final) ────────

interface SportsDBEvent {
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
}

async function fetchMatchResultSportsDB(
  homeTeam: string,
  awayTeam: string,
  utcDate: string,
): Promise<MatchScoreResult | null> {
  const dateStr = utcDate.slice(0, 10);
  const path = `/eventsday.php?d=${dateStr}&s=Soccer`;
  try {
    let res: SimpleResponse;
    if (Capacitor.isNativePlatform()) {
      res = await nativeFetch(`${SPORTSDB_BASE_NATIVE}${path}`, {});
    } else {
      const url = import.meta.env.DEV
        ? `${SPORTSDB_BASE_WEB}${path}`
        : `${SPORTSDB_BASE_WEB}?path=${encodeURIComponent(path)}`;
      res = await nativeFetch(url, {});
    }
    if (!res.ok) return null;

    const data = await res.json() as { events?: SportsDBEvent[] | null };
    const events = data.events ?? [];

    const normHome = normalizeTeamName(homeTeam);
    const normAway = normalizeTeamName(awayTeam);

    const match = events.find((e) => {
      const eHome = normalizeTeamName(e.strHomeTeam);
      const eAway = normalizeTeamName(e.strAwayTeam);
      const homeMatch = eHome.includes(normHome.slice(0, 5)) || normHome.includes(eHome.slice(0, 5));
      const awayMatch = eAway.includes(normAway.slice(0, 5)) || normAway.includes(eAway.slice(0, 5));
      return homeMatch && awayMatch;
    });

    if (!match) return null;

    const st = (match.strStatus ?? "").toLowerCase();
    const finished = st === "match finished" || st === "ft" || st === "aet" || st === "pen";
    const home = match.intHomeScore !== null && match.intHomeScore !== "" ? parseInt(match.intHomeScore) : null;
    const away = match.intAwayScore !== null && match.intAwayScore !== "" ? parseInt(match.intAwayScore) : null;

    if (!finished) {
      return { home: null, away: null, regularHome: null, regularAway: null, penaltyHome: null, penaltyAway: null, status: "TIMED" };
    }

    // Quando status é "pen", o TheSportsDB retorna o placar da disputa de
    // pênaltis em intHomeScore/Away, não o placar regulamentar. Como não temos
    // como separar os valores confiável­mente, descartamos o score desta fonte
    // para jogos decididos nos pênaltis e deixamos o FD/SofaScore resolver.
    if (st === "pen") {
      return { home: null, away: null, regularHome: null, regularAway: null, penaltyHome: null, penaltyAway: null, status: "FINISHED" };
    }

    // "aet" = após prorrogação: intHomeScore já inclui gols da prorrogação.
    // Não temos o placar de 90min separado nesta fonte.
    return {
      home,
      away,
      regularHome: null,
      regularAway: null,
      penaltyHome: null,
      penaltyAway: null,
      status: "FINISHED",
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
  homeScore?: SofaScore;
  awayScore?: SofaScore;
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

  // SofaScore: current = placar após prorrogação (sem pênaltis), normaltime = 90min
  const curHome = finished ? (e.homeScore?.current ?? null) : null;
  const curAway = finished ? (e.awayScore?.current ?? null) : null;
  const ntHome = finished ? (e.homeScore?.normaltime ?? null) : null;
  const ntAway = finished ? (e.awayScore?.normaltime ?? null) : null;
  const penHome = finished ? (e.homeScore?.penalties ?? null) : null;
  const penAway = finished ? (e.awayScore?.penalties ?? null) : null;

  // hadET: normaltime existe e é diferente de current → houve prorrogação
  const hadET = ntHome !== null && ntHome !== curHome;
  // etDeltaHome: gols SOMENTE na prorrogação (delta p/ montar o FDMatch.score)
  const etDeltaHome = hadET && curHome !== null && ntHome !== null ? curHome - ntHome : null;
  const etDeltaAway = hadET && curAway !== null && ntAway !== null ? curAway - ntAway : null;

  return {
    id: e.id,
    homeTeam: { name: e.homeTeam.name, crest: null },
    awayTeam: { name: e.awayTeam.name, crest: null },
    utcDate,
    status,
    stage,
    matchday,
    score: {
      // fullTime = placar de 90min (como no FD); current do SofaScore = após prorrogação
      fullTime: {
        home: hadET ? ntHome : curHome,
        away: hadET ? ntAway : curAway,
      },
      extraTime: hadET && etDeltaHome !== null ? { home: etDeltaHome, away: etDeltaAway ?? null } : null,
      penalties: penHome !== null ? { home: penHome, away: penAway ?? null } : null,
      duration: penHome !== null ? "PENALTY_SHOOTOUT" : (hadET ? "EXTRA_TIME" : "REGULAR"),
    },
  };
}


// Descobre o season ID de um unique-tournament pelo ano da temporada
async function fetchSofaSeasonId(uniqueId: number, year: string): Promise<number | null> {
  try {
    const res = await sofaFetch(`/api/v1/unique-tournament/${uniqueId}/seasons`);
    if (!res.ok) return null;
    const data = await res.json() as { seasons?: Array<{ id: number; year: string }> };
    const match = (data.seasons ?? []).find((s) => String(s.year).includes(year));
    if (match) console.log(`[SofaScore] Season descoberta: unique-tournament ${uniqueId} → seasonId ${match.id} (${match.year})`);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

// Busca eventos de um unique-tournament/season paginando last+next
async function fetchSofaUniqueTournamentMatches(
  uniqueId: number,
  seasonId: number,
): Promise<SofaTournamentEvent[]> {
  const all: SofaTournamentEvent[] = [];
  for (const direction of ["last", "next"] as const) {
    for (let page = 0; page < 20; page++) {
      try {
        const res = await sofaFetch(
          `/api/v1/unique-tournament/${uniqueId}/season/${seasonId}/events/${direction}/${page}`,
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
  return all;
}

async function fetchAllMatchesSofaTournament(
  code: ChampionshipCode,
): Promise<{ matches: FDMatch[]; error: string | null }> {
  if (!RAPIDAPI_KEY) {
    return { matches: [], error: "VITE_RAPIDAPI_KEY não configurada" };
  }

  const cfg = CHAMPIONSHIPS_CONFIG[code];

  // Torneios com unique ID estável: auto-descobre o season ID (ex: Copa do Mundo)
  if (cfg.sofa_unique_id && cfg.sofa_season_year) {
    const seasonId = await fetchSofaSeasonId(cfg.sofa_unique_id, cfg.sofa_season_year);
    if (seasonId) {
      const all = await fetchSofaUniqueTournamentMatches(cfg.sofa_unique_id, seasonId);
      if (all.length > 0) {
        const seen = new Set<number>();
        const unique = all.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        console.log(`[SofaScore] ${unique.length} partidas via unique-tournament ${cfg.sofa_unique_id} season ${seasonId}`);
        return { matches: unique.map(sofaEventToFDMatch), error: null };
      }
    }
    console.warn(`[SofaScore] unique-tournament ${cfg.sofa_unique_id} sem resultados, tentando tournament ID ${cfg.sofa_tournament_id}`);
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

// ─── Lance.com.br — scraping SSR (fallback Copa do Mundo) ────

const LANCE_WC_NATIVE = "https://www.lance.com.br/tabela/copa-do-mundo";
const LANCE_WC_WEB = import.meta.env.DEV ? "/lance-api/tabela/copa-do-mundo" : "/api/lance-proxy";

interface LanceParsedMatch {
  home: string;
  away: string;
  scoreHome: number;
  scoreAway: number;
}

let lanceCacheData: LanceParsedMatch[] | null = null;
let lanceCacheTs = 0;
const LANCE_CACHE_TTL = 3 * 60 * 1000;

async function fetchLanceHTML(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: LANCE_WC_NATIVE,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    return typeof res.data === "string" ? res.data : "";
  }
  const res = await fetch(LANCE_WC_WEB);
  return res.text();
}

// Busca recursiva em JSON de __NEXT_DATA__ por objetos com estrutura de partida
function extractMatchesFromJson(obj: unknown, depth = 0): LanceParsedMatch[] {
  if (depth > 12 || obj === null || typeof obj !== "object") return [];
  const results: LanceParsedMatch[] = [];

  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...extractMatchesFromJson(item, depth + 1));
    return results;
  }

  const o = obj as Record<string, unknown>;

  // Tenta vários schemas de campo que sites brasileiros costumam usar
  const scoreHome =
    o.placarMandante ?? o.gols_mandante ?? o.score_home ?? o.scoreHome ??
    o.placar_mandante ?? o.golsMandante ?? o.home_score;
  const scoreAway =
    o.placarVisitante ?? o.gols_visitante ?? o.score_away ?? o.scoreAway ??
    o.placar_visitante ?? o.golsVisitante ?? o.away_score;

  const rawHome =
    (o.mandante as Record<string, unknown>)?.nome ??
    (o.mandante as Record<string, unknown>)?.name ??
    (o.homeTeam as Record<string, unknown>)?.name ??
    (o.home as Record<string, unknown>)?.name ??
    o.mandante ?? o.timeA ?? o.home_team;
  const rawAway =
    (o.visitante as Record<string, unknown>)?.nome ??
    (o.visitante as Record<string, unknown>)?.name ??
    (o.awayTeam as Record<string, unknown>)?.name ??
    (o.away as Record<string, unknown>)?.name ??
    o.visitante ?? o.timeB ?? o.away_team;

  if (
    typeof scoreHome === "number" && typeof scoreAway === "number" &&
    scoreHome >= 0 && scoreAway >= 0 &&
    typeof rawHome === "string" && rawHome.length > 1 &&
    typeof rawAway === "string" && rawAway.length > 1
  ) {
    results.push({ home: rawHome, away: rawAway, scoreHome, scoreAway });
    return results;
  }

  for (const val of Object.values(o)) results.push(...extractMatchesFromJson(val, depth + 1));
  return results;
}

function parseLanceHTML(html: string): LanceParsedMatch[] {
  // Estratégia 1: __NEXT_DATA__ (Next.js SSR embute dados da página aqui)
  const nextDataRx = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
  const nextMatch = html.match(nextDataRx);
  if (nextMatch) {
    try {
      const json = JSON.parse(nextMatch[1]);
      const matches = extractMatchesFromJson(json);
      if (matches.length > 0) {
        console.log(`[Lance] ${matches.length} partidas via __NEXT_DATA__`);
        return matches;
      }
    } catch { /* continua */ }
  }

  // Estratégia 2: qualquer bloco application/ld+json
  const ldRx = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  for (const m of html.matchAll(ldRx)) {
    try {
      const json = JSON.parse(m[1]);
      const matches = extractMatchesFromJson(json);
      if (matches.length > 0) {
        console.log(`[Lance] ${matches.length} partidas via ld+json`);
        return matches;
      }
    } catch { /* continua */ }
  }

  // Estratégia 3: regex no HTML — "Nome do Time  2  x  1  Outro Time"
  // Captura: texto com inicial maiúscula + espaço + dígito(s) + x/X/× + dígito(s) + espaço + texto
  const scoreRx =
    /([A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ][A-Za-záéíóúàâêôãõçü\s\-']{1,28}?)\s{1,4}(\d{1,2})\s*[xX×]\s*(\d{1,2})\s{1,4}([A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ][A-Za-záéíóúàâêôãõçü\s\-']{1,28})/g;
  const regexMatches = [...html.matchAll(scoreRx)];
  if (regexMatches.length > 0) {
    // Remove duplicatas pelo par de times
    const seen = new Set<string>();
    const parsed: LanceParsedMatch[] = [];
    for (const m of regexMatches) {
      const key = `${m[1].trim()}|${m[4].trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        parsed.push({
          home: m[1].trim(),
          away: m[4].trim(),
          scoreHome: parseInt(m[2]),
          scoreAway: parseInt(m[3]),
        });
      }
    }
    if (parsed.length > 0) {
      console.log(`[Lance] ${parsed.length} partidas via regex HTML`);
      return parsed;
    }
  }

  console.warn("[Lance] Nenhuma partida extraída do HTML");
  return [];
}

async function fetchMatchResultLance(
  homeTeam: string,
  awayTeam: string,
): Promise<MatchScoreResult | null> {
  try {
    if (!lanceCacheData || Date.now() - lanceCacheTs > LANCE_CACHE_TTL) {
      const html = await fetchLanceHTML();
      lanceCacheData = parseLanceHTML(html);
      lanceCacheTs = Date.now();
    }

    if (!lanceCacheData || lanceCacheData.length === 0) return null;

    const normHome = normalizeTeamName(homeTeam);
    const normAway = normalizeTeamName(awayTeam);

    const found = lanceCacheData.find((m) => {
      const mHome = normalizeTeamName(m.home);
      const mAway = normalizeTeamName(m.away);
      // Slice de 4 chars para tolerar abreviações (Ivory Coast → ivory, Côte d'Ivoire → cotei)
      const homeOk =
        mHome.includes(normHome.slice(0, 4)) || normHome.includes(mHome.slice(0, 4));
      const awayOk =
        mAway.includes(normAway.slice(0, 4)) || normAway.includes(mAway.slice(0, 4));
      return homeOk && awayOk;
    });

    if (!found) return null;

    console.log(`[Lance] Resultado encontrado: ${found.home} ${found.scoreHome}×${found.scoreAway} ${found.away}`);
    // Lance.com.br exibe o placar após prorrogação; não temos detalhamento de pênaltis.
    return {
      home: found.scoreHome,
      away: found.scoreAway,
      regularHome: null,
      regularAway: null,
      penaltyHome: null,
      penaltyAway: null,
      status: "FINISHED",
    };
  } catch (err) {
    console.error("[Lance] Erro ao buscar resultado:", err);
    return null;
  }
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
): Promise<MatchScoreResult | null> {
  // Cada fallback tenta preservar o detalhamento (regular/ET/penalty).
  // O FD é a fonte mais confiável; SofaScore e TheSportsDB são fallbacks.
  // Lance.com.br é o último recurso (scraping, sem detalhamento).
  const primary = await fetchMatchResultFD(fdMatchId);
  if (primary && (primary.home !== null || primary.status !== "UNKNOWN")) return primary;

  const sofa = await fetchMatchResultSofa(homeTeam, awayTeam, utcDate);
  if (sofa && sofa.home !== null) return sofa;

  const sportsdb = await fetchMatchResultSportsDB(homeTeam, awayTeam, utcDate);
  // TheSportsDB retorna {home:null} para jogos decididos nos pênaltis (corrigido acima)
  // mas retorna status "FINISHED" — se home não é null, usamos.
  if (sportsdb && sportsdb.home !== null) return sportsdb;

  // Fallback final: Lance.com.br (scraping SSR — principalmente para Copa do Mundo)
  return fetchMatchResultLance(homeTeam, awayTeam);
}
