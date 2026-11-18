import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import { FronteirasMap } from "./FronteirasMap";
import { WORLD, PAIRS, GRAPH } from "./fronteirasData";
import {
  COLOR_FILL,
  FRONTEIRAS_BASE_SCORE,
  FRONTEIRAS_EXTRA_GUESSES,
  FRONTEIRAS_MIN_WIN_SCORE,
  FRONTEIRAS_PENALTY_PER_EXTRA,
  distanceToPath,
  buildFronteirasShareText,
  colorForDistance,
  fronteirasScore,
  getFronteirasGameDate,
  intermediatesCount,
  isSolved,
  maxGuessesFor,
  pairOfDay,
  resolveCountry,
  searchCountries,
  shortestPath,
  shortestPathNodes,
  validateGuess,
} from "./fronteirasLogic";
import { CountryName } from "./CountryName";
import {
  getFronteirasDailyLeaderboard,
  getFronteirasTodayGame,
  saveFronteirasGame,
} from "./fronteirasService";
import type {
  FronteirasLeaderboardEntry,
  GameStatus,
  GuessColor,
} from "./fronteirasTypes";

const COUNTRY_BY_ISO = new Map(WORLD.countries.map((c) => [c.iso, c]));
const VALID_ISOS = new Set(WORLD.countries.map((c) => c.iso));
const nameOf = (iso: string) => COUNTRY_BY_ISO.get(iso)?.name ?? iso;
const nameNode = (iso: string) => <CountryName iso={iso} name={nameOf(iso)} />;

const COLOR_LABEL: Record<GuessColor, string> = {
  green: "No caminho",
  orange: "1 fronteira do caminho",
  red: "2 fronteiras do caminho",
  darkred: "Longe do caminho",
};

const VALIDATION_MSG = {
  unknown: "País não encontrado",
  duplicate: "Você já chutou esse país",
  endpoint: "Origem e destino já estão no mapa",
} as const;

function Leaderboard({
  entries,
  meId,
}: {
  entries: FronteirasLeaderboardEntry[];
  meId: string | undefined;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--text-muted)] py-4">
        Ninguém terminou ainda hoje. Seja o primeiro! 🏆
      </p>
    );
  }
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((e, i) => (
        <div
          key={e.user_id}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
            e.user_id === meId
              ? "bg-[rgba(201,165,90,0.1)] border-[rgba(201,165,90,0.3)]"
              : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.05)]"
          }`}
        >
          <span className="w-6 text-center text-sm font-bold text-[var(--text-muted)]">
            {medal[i] ?? i + 1}
          </span>
          <Avatar url={e.avatar_url} name={e.display_name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {e.display_name.split(" ")[0]}
              {e.user_id === meId && <span className="text-[var(--gold)]"> (você)</span>}
            </p>
            <p className="text-[0.65rem] text-[var(--text-muted)]">
              {e.status === "won" ? `Fechou em ${e.attempts} palpites` : "Não fechou"}
            </p>
          </div>
          <span className="text-sm font-bold text-[var(--gold)] shrink-0">{e.score} pts</span>
        </div>
      ))}
    </div>
  );
}

export function FronteirasGame() {
  const { user } = useAuth();
  const gameDate = useMemo(() => getFronteirasGameDate(), []);
  const [from, to] = useMemo(() => pairOfDay(PAIRS), []);
  const onPath = useMemo(() => shortestPathNodes(GRAPH, from, to) ?? new Set<string>(), [from, to]);
  const example = useMemo(
    () => (shortestPath(GRAPH, from, to) ?? []).slice(1, -1),
    [from, to],
  );
  const optimal = useMemo(() => intermediatesCount(GRAPH, from, to) ?? 0, [from, to]);
  const maxGuesses = maxGuessesFor(optimal);
  const distances = useMemo(() => distanceToPath(GRAPH, onPath), [onPath]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<FronteirasLeaderboardEntry[]>([]);
  const [shareLabel, setShareLabel] = useState("Compartilhar resultado");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const colorOf = useCallback(
    (iso: string): GuessColor => colorForDistance(distances.get(iso)),
    [distances],
  );
  const colors = useMemo(() => {
    const m: Record<string, GuessColor> = {};
    for (const g of guesses) m[g] = colorOf(g);
    return m;
  }, [guesses, colorOf]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboard(await getFronteirasDailyLeaderboard(gameDate));
  }, [gameDate]);

  // Carrega a partida do dia
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const game = await getFronteirasTodayGame(user.id, gameDate);
      if (!active) return;
      if (game) {
        setGuesses(game.guesses);
        setStatus(game.status);
        setScore(game.score);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, gameDate]);

  const finished = status !== "playing";
  // Exemplo do caminho mais curto: só na derrota ou quando venceu por uma rota mais longa.
  const showExample = finished && (status === "lost" || guesses.length > optimal);
  const revealed = useMemo(
    () => (showExample ? new Set(example) : undefined),
    [showExample, example],
  );

  useEffect(() => {
    if (!finished) return;
    let active = true;
    (async () => {
      const lb = await getFronteirasDailyLeaderboard(gameDate);
      if (active) setLeaderboard(lb);
    })();
    return () => {
      active = false;
    };
  }, [finished, gameDate]);

  const suggestions = useMemo(
    () => searchCountries(query, WORLD.countries, new Set([...guesses, from, to])),
    [query, guesses, from, to],
  );

  const submit = useCallback(
    async (iso: string) => {
      if (!user || finished) return;
      const v = validateGuess(iso, guesses, from, to, VALID_ISOS);
      if (v !== "ok") {
        flash(VALIDATION_MSG[v]);
        return;
      }
      const next = [...guesses, iso];
      const won = isSolved(GRAPH, from, to, next);
      const lost = !won && next.length >= maxGuesses;
      const newStatus: GameStatus = won ? "won" : lost ? "lost" : "playing";
      const newScore = fronteirasScore(next.length, optimal, won);
      setGuesses(next);
      setStatus(newStatus);
      setScore(newScore);
      setQuery("");
      const { error } = await saveFronteirasGame(user.id, gameDate, {
        guesses: next,
        status: newStatus,
        attempts: next.length,
        score: newScore,
      });
      if (error) flash("Não foi possível salvar o palpite");
    },
    [user, finished, guesses, from, to, maxGuesses, optimal, gameDate, flash],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const country = resolveCountry(query, WORLD.countries) ?? suggestions[0];
    if (!country) {
      flash(VALIDATION_MSG.unknown);
      return;
    }
    void submit(country.iso);
  };

  const handleShare = async () => {
    const text = buildFronteirasShareText(
      guesses.map(colorOf),
      status === "won",
      gameDate,
      maxGuesses,
    );
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShareLabel("Copiado! ✓");
        setTimeout(() => setShareLabel("Compartilhar resultado"), 2000);
      }
    } catch {
      /* compartilhamento cancelado */
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 flex flex-col gap-3">
      <div className="text-center">
        <p className="text-xs text-[var(--text-muted)]">Conecte os países vizinhos</p>
        <p
          className="text-base font-bold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span style={{ color: "#4a90d9" }}>{nameNode(from)}</span>
          {" → "}
          <span style={{ color: "#a064d6" }}>{nameNode(to)}</span>
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Palpites: {guesses.length}/{maxGuesses}
        </p>
        <details className="mt-2 text-left text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-xl px-3 py-2 border border-[rgba(255,255,255,0.05)]">
          <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">
            Como funciona
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-4">
            <li>
              <b>Objetivo:</b> chutar países que, juntos, formem uma rota de vizinhos
              ligando a origem ao destino. <b>Qualquer rota vale</b>, não só a mais curta.
            </li>
            <li>
              <b>Cores:</b> 🟩 está num caminho mais curto · 🟧 a 1 fronteira dele · 🟥 a 2 ·
              🟫 mais longe. É só uma pista; chutar país de outra cor também pode fazer
              parte da sua rota.
            </li>
            <li>
              <b>Termina</b> quando os países chutados (de qualquer cor) formam uma cadeia
              contínua de vizinhos entre origem e destino. Só vale fronteira <b>por terra</b>:
              mar, ilhas e pontes não ligam países.
            </li>
            <li>
              <b>Limite:</b> o nº de países do caminho mais curto + {FRONTEIRAS_EXTRA_GUESSES}{" "}
              palpites. Estourou sem fechar a rota, perdeu (0 pts).
            </li>
            <li>
              <b>Pontos:</b> {FRONTEIRAS_BASE_SCORE} se fechar com o mínimo de palpites (
              {optimal} hoje). Cada palpite a mais — chute errado ou rota mais longa — tira{" "}
              {FRONTEIRAS_PENALTY_PER_EXTRA} pontos (mínimo {FRONTEIRAS_MIN_WIN_SCORE}).
            </li>
          </ul>
        </details>
      </div>

      <FronteirasMap
        world={WORLD}
        from={from}
        to={to}
        colors={colors}
        revealed={revealed}
      />

      {!finished && (
        <form onSubmit={handleSubmit} className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite um país…"
            aria-label="Palpite de país"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.25)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
          />
          {suggestions.length > 0 && (
            <ul className="mt-1 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[var(--bg-elevated)]">
              {suggestions.map((c) => (
                <li key={c.iso}>
                  <button
                    type="button"
                    onClick={() => void submit(c.iso)}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[rgba(201,165,90,0.1)]"
                  >
                    <CountryName iso={c.iso} name={c.name} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {toast && (
        <p role="status" className="text-center text-xs font-semibold text-[var(--gold)]">
          {toast}
        </p>
      )}

      {guesses.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label="Palpites">
          {[...guesses].reverse().map((iso, idx) => {
            const color = colorOf(iso);
            return (
              <li
                key={iso}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)]"
              >
                <span className="w-5 text-xs text-[var(--text-muted)]">
                  {guesses.length - idx}
                </span>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: COLOR_FILL[color] }}
                />
                <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
                  {nameNode(iso)}
                </span>
                <span className="text-[0.65rem] text-[var(--text-muted)]">
                  {COLOR_LABEL[color]}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {finished && (
        <div className="flex flex-col gap-3 rounded-2xl p-4 bg-[var(--bg-card)] border border-[rgba(201,165,90,0.2)]">
          <p
            className="text-center text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {status === "won" ? `Conectou! +${score} pts 🎉` : "Acabaram os palpites 😕"}
          </p>
          {status === "won" && guesses.length > optimal && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Você usou {guesses.length} palpites; o mínimo era {optimal}.
            </p>
          )}
          {showExample && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Exemplo de caminho mais curto:{" "}
              {[from, ...example, to].map((iso, i) => (
                <span key={`${iso}-${i}`}>
                  {i > 0 && " → "}
                  {nameNode(iso)}
                </span>
              ))}
            </p>
          )}
          <button
            onClick={handleShare}
            className="py-2.5 rounded-xl text-sm font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)]"
          >
            📋 {shareLabel}
          </button>
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold">
            Placar de hoje
          </h3>
          <Leaderboard entries={leaderboard} meId={user?.id} />
          <button
            onClick={loadLeaderboard}
            className="text-xs text-[var(--text-muted)] underline self-center"
          >
            Atualizar placar
          </button>
        </div>
      )}
    </div>
  );
}
