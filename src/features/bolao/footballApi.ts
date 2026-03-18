// ══════════════════════════════════════════════════════════════
// footballApi.ts — football-data.org (primária) + SofaScore (fallback)
// ══════════════════════════════════════════════════════════════

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
    sofa_tournament_id: 16,
  },
};

const FD_KEY = import.meta.env.VITE_FOOTBALL_DATA_KEY as string | undefined;
// Em dev, usa proxy Vite (/fd-api) para evitar CORS.
// Em produção (Capacitor), chama diretamente — WebKit nativo não bloqueia CORS.
const FD_BASE = import.meta.env.DEV
  ? "/fd-api"
  : "https://api.football-data.org/v4";
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY as string | undefined;
const SOFA_BASE = "https://sportapi7.p.rapidapi.com";
const SOFA_HOST = "sportapi7.p.rapidapi.com";

// Rate limit: ~10 req/min para football-data.org
let lastFDCall = 0;
const FD_MIN_INTERVAL = 6200;

async function fdFetch(path: string): Promise<Response> {
  const now = Date.now();
  const wait = FD_MIN_INTERVAL - (now - lastFDCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFDCall = Date.now();
  return fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": FD_KEY ?? "" },
  });
}

async function sofaFetch(path: string): Promise<Response> {
  return fetch(`${SOFA_BASE}${path}`, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY ?? "",
      "x-rapidapi-host": SOFA_HOST,
      "Content-Type": "application/json",
    },
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
export const KNOCKOUT_STAGE_ORDER = [
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
    const data = await res.json();
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
    const data = await res.json();
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
    const data = await res.json();
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

// ─── API pública ─────────────────────────────────────────────

export async function fetchChampionshipMatches(
  code: ChampionshipCode,
): Promise<{ matches: FDMatch[]; error: string | null }> {
  const result = await fetchMatchesFD(code);
  if (result.matches.length > 0) return result;
  // SofaScore não tem endpoint simples para listar todas as partidas de um campeonato
  return result;
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
