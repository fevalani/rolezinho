import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { BolaoStatsTab } from "./BolaoStatsTab";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import { scheduleBolaoReminders } from "@/lib/notificationService";
import { readCache, writeCache } from "@/lib/localCache";
import {
  fetchBolaoSnapshot,
  snapshotSignature,
  withRecomputedLocks,
  upsertPrediction,
  syncPoolResults,
  syncMatchSchedules,
  forcePopulateMatches,
  setMatchResultManually,
  recalculateAllPoints,
  updatePoolScoringModel,
  updatePoolVariationMode,
  fetchKnockoutStages,
  updatePoolStageMultipliers,
  computePositionVariations,
  leavePool,
  SCORING_MODELS,
  VARIATION_MODES,
  getScoringDisplay,
  toRoundLabel,
  CUSTOM_SCORING_CATEGORIES,
  DEFAULT_CUSTOM_CONFIG,
  type ScoringModel,
  type PresetScoringModel,
  type VariationMode,
  type CustomScoringConfig,
  type StageMultipliers,
  type BolaoPool,
  type RoundGroup,
  type MatchWithPrediction,
  type BolaoPoolMember,
  type LeaderboardEntry,
  type RoundLeaderboard,
  type UserPredictionDetail,
  type BolaoSnapshot,
  subscribeBolao,
} from "./bolaoService";
import { getTeamCrest } from "./teamCrests";

function TeamCrestImg({
  team,
  crest,
  size = "sm",
}: {
  team: string | null | undefined;
  crest: string | null | undefined;
  size?: "xs" | "sm";
}) {
  const localSrc = team ? getTeamCrest(team, null) : null;
  const preferred = localSrc ?? crest ?? null;
  const [src, setSrc] = useState<string | null>(preferred);

  // Sincroniza quando props mudam (ex: HMR ou match TBD que foi definido)
  useEffect(() => {
    setSrc(localSrc ?? crest ?? null);
  }, [localSrc, crest]);

  const cls = size === "xs" ? "w-4 h-4" : "w-5 h-5";

  if (!src) {
    return (
      <span className={`${cls} shrink-0 flex items-center justify-center text-[var(--text-muted)] text-[0.6rem]`}>
        🛡️
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={`${cls} object-contain shrink-0`}
      onError={() => {
        // fallback: arquivo local → URL da CDN → placeholder
        if (src !== crest && crest) setSrc(crest);
        else setSrc(null);
      }}
    />
  );
}

type Tab = "palpites" | "classificacao" | "stats" | "info" | "admin";

interface ParticipantPrediction {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  pred_home: number;
  pred_away: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(utcDate: string): string {
  return new Date(utcDate).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PointsBadge({ pts }: { pts: number | null }) {
  if (pts === null) return null;
  const color =
    pts === 15
      ? "text-[var(--gold)] bg-[rgba(201,165,90,0.12)] border-[rgba(201,165,90,0.3)]"
      : pts >= 10
        ? "text-green-400 bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.25)]"
        : pts >= 3
          ? "text-blue-400 bg-[rgba(96,165,250,0.1)] border-[rgba(96,165,250,0.25)]"
          : "text-[var(--text-muted)] bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]";

  return (
    <span
      className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-md border ${color}`}
    >
      +{pts}
    </span>
  );
}

// ─── Match Card ───────────────────────────────────────────────

function MatchCard({
  match,
  pending,
  onPredictionChange,
  isAdmin,
  onAdminEditResult,
  otherPredictions,
  currentUserId,
}: {
  match: MatchWithPrediction;
  pending?: { home: number; away: number };
  onPredictionChange: (matchId: string, home: number, away: number) => void;
  isAdmin?: boolean;
  onAdminEditResult?: (matchId: string, home: number, away: number) => void;
  otherPredictions?: ParticipantPrediction[];
  currentUserId?: string;
}) {
  const [homeGoals, setHomeGoals] = useState<string>(
    pending !== undefined
      ? String(pending.home)
      : match.my_prediction !== null
        ? String(match.my_prediction.home_goals)
        : "",
  );
  const [awayGoals, setAwayGoals] = useState<string>(
    pending !== undefined
      ? String(pending.away)
      : match.my_prediction !== null
        ? String(match.my_prediction.away_goals)
        : "",
  );

  const [adminEditing, setAdminEditing] = useState(false);
  const [adminHome, setAdminHome] = useState(String(match.score_home ?? ""));
  const [adminAway, setAdminAway] = useState(String(match.score_away ?? ""));
  const [showParticipants, setShowParticipants] = useState(false);

  const isFinished = match.status === "FINISHED";
  const hasResult = match.score_home !== null && match.score_away !== null;
  const isTbd = !match.home_team || match.home_team === "A definir"
    || !match.away_team || match.away_team === "A definir";
  // Só revela palpites dos outros quando a partida JÁ COMEÇOU (utc_date no passado).
  // Partidas futuras travadas (TBD ou dentro de 1 min do início) ficam ocultas.
  const isStarted = Date.now() >= new Date(match.utc_date).getTime();
  const isLive = match.is_locked && !isFinished && !isTbd && isStarted;

  const handleAdminSave = () => {
    const h = parseInt(adminHome);
    const a = parseInt(adminAway);
    if (!isNaN(h) && !isNaN(a) && h >= 0 && a >= 0) {
      onAdminEditResult?.(match.id, h, a);
      setAdminEditing(false);
    }
  };

  const handleChange = (
    value: string,
    setter: (v: string) => void,
    other: string,
    isHome: boolean,
  ) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    setter(cleaned);
    const home = isHome ? cleaned : homeGoals;
    const away = isHome ? awayGoals : cleaned;
    const h = parseInt(isHome ? cleaned : home);
    const a = parseInt(isHome ? away : cleaned);
    if (
      !isNaN(h) &&
      !isNaN(a) &&
      h >= 0 &&
      a >= 0 &&
      other !== "" &&
      cleaned !== ""
    ) {
      onPredictionChange(match.id, h, a);
    }
  };

  // ── Card compacto para partidas finalizadas ──────────────────
  // Jogo já decidido só precisa mostrar placar, meu palpite e pontos —
  // ocupa bem menos espaço que o card de palpite. Admin editando cai no
  // layout completo abaixo (precisa dos inputs de placar).
  if (isFinished && !adminEditing) {
    return (
      <div className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2 border border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          {/* Casa */}
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <TeamCrestImg team={match.home_team} crest={match.home_crest} size="xs" />
            <span className="text-xs text-[var(--text-secondary)] truncate">
              {match.home_team ?? "A definir"}
            </span>
          </div>

          {/* Placar */}
          <div className="flex items-center gap-1 shrink-0 text-sm font-bold text-[var(--text-primary)] tabular-nums">
            <span>{hasResult ? match.score_home : "—"}</span>
            <span className="text-[var(--text-muted)] text-xs">×</span>
            <span>{hasResult ? match.score_away : "—"}</span>
          </div>

          {/* Visitante */}
          <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
            <span className="text-xs text-[var(--text-secondary)] truncate text-right">
              {match.away_team ?? "A definir"}
            </span>
            <TeamCrestImg team={match.away_team} crest={match.away_crest} size="xs" />
          </div>
        </div>

        {/* Rodapé: palpite + pontos (sem borda nem header) */}
        <div className="flex items-center justify-between gap-2 mt-1 text-[0.6rem] text-[var(--text-muted)]">
          <span className="shrink-0">{formatDate(match.utc_date)}</span>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            {match.my_prediction && hasResult && (
              <span>
                Palpite{" "}
                <span className="text-[var(--text-secondary)] font-medium text-xs">
                  {match.my_prediction.home_goals}×
                  {match.my_prediction.away_goals}
                </span>
              </span>
            )}
            {match.my_prediction?.points_earned !== undefined && (
              <PointsBadge pts={match.my_prediction.points_earned} />
            )}
            {isAdmin && match.is_locked && (
              <button
                onClick={() => {
                  setAdminHome(String(match.score_home ?? ""));
                  setAdminAway(String(match.score_away ?? ""));
                  setAdminEditing(true);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors"
                title="Editar resultado"
              >
                ✏️
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-[var(--bg-elevated)] rounded-xl p-3 border ${
        isFinished
          ? "border-[rgba(255,255,255,0.06)]"
          : "border-[rgba(255,255,255,0.04)]"
      }`}
    >
      {/* Data + status */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[0.65rem] text-[var(--text-muted)]">
          {formatDate(match.utc_date)}
        </span>
        <div className="flex items-center gap-1.5">
          {match.is_locked && !isFinished && isTbd && (
            <span className="text-[0.6rem] text-[var(--text-muted)] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded-md font-medium">
              Aguardando
            </span>
          )}
          {match.is_locked && !isFinished && !isTbd && (
            <span className="text-[0.6rem] text-orange-400 bg-[rgba(251,146,60,0.1)] border border-[rgba(251,146,60,0.2)] px-1.5 py-0.5 rounded-md font-medium">
              Encerrado
            </span>
          )}
          {isFinished && (
            <span className="text-[0.6rem] text-[var(--text-muted)] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-md">
              Finalizado
            </span>
          )}
          {match.my_prediction?.points_earned !== undefined && (
            <PointsBadge pts={match.my_prediction.points_earned} />
          )}
          {isAdmin && match.is_locked && !adminEditing && (
            <button
              onClick={() => {
                setAdminHome(String(match.score_home ?? ""));
                setAdminAway(String(match.score_away ?? ""));
                setAdminEditing(true);
              }}
              className="text-[0.6rem] text-[var(--text-muted)] hover:text-[var(--gold)] px-1 transition-colors"
              title="Editar resultado"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* Times + placar/palpite */}
      <div className="flex items-center gap-2">
        {/* Casa */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <TeamCrestImg team={match.home_team} crest={match.home_crest} />
          <span className="text-xs text-[var(--text-primary)] font-medium truncate">
            {match.home_team ?? "A definir"}
          </span>
        </div>

        {/* Resultado real ou palpite */}
        <div className="flex items-center gap-1.5 shrink-0">
          {adminEditing ? (
            <>
              <input
                type="number"
                min={0}
                max={99}
                value={adminHome}
                onChange={(e) =>
                  setAdminHome(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="w-8 h-8 text-center bg-[var(--bg-card)] border border-[rgba(201,165,90,0.5)] rounded-lg text-sm font-bold text-[var(--gold)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[var(--text-muted)] text-xs">×</span>
              <input
                type="number"
                min={0}
                max={99}
                value={adminAway}
                onChange={(e) =>
                  setAdminAway(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="w-8 h-8 text-center bg-[var(--bg-card)] border border-[rgba(201,165,90,0.5)] rounded-lg text-sm font-bold text-[var(--gold)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={handleAdminSave}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-[rgba(74,222,128,0.15)] text-green-400 text-xs hover:bg-[rgba(74,222,128,0.25)] transition-colors"
                title="Confirmar resultado"
              >
                ✓
              </button>
              <button
                onClick={() => setAdminEditing(false)}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-[rgba(255,255,255,0.06)] text-[var(--text-muted)] text-xs hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                title="Cancelar"
              >
                ✗
              </button>
            </>
          ) : isFinished && hasResult ? (
            <>
              <span className="w-8 h-8 flex items-center justify-center bg-[rgba(255,255,255,0.06)] rounded-lg text-sm font-bold text-[var(--text-primary)]">
                {match.score_home}
              </span>
              <span className="text-[var(--text-muted)] text-xs">×</span>
              <span className="w-8 h-8 flex items-center justify-center bg-[rgba(255,255,255,0.06)] rounded-lg text-sm font-bold text-[var(--text-primary)]">
                {match.score_away}
              </span>
            </>
          ) : match.is_locked ? (
            <>
              <span className="w-8 h-8 flex items-center justify-center bg-[rgba(255,255,255,0.04)] rounded-lg text-sm font-semibold text-[var(--text-muted)]">
                {match.my_prediction !== null
                  ? match.my_prediction.home_goals
                  : "—"}
              </span>
              <span className="text-[var(--text-muted)] text-xs">×</span>
              <span className="w-8 h-8 flex items-center justify-center bg-[rgba(255,255,255,0.04)] rounded-lg text-sm font-semibold text-[var(--text-muted)]">
                {match.my_prediction !== null
                  ? match.my_prediction.away_goals
                  : "—"}
              </span>
            </>
          ) : (
            <>
              <input
                type="number"
                min={0}
                max={99}
                value={homeGoals}
                onChange={(e) =>
                  handleChange(e.target.value, setHomeGoals, awayGoals, true)
                }
                className="w-8 h-8 text-center bg-[var(--bg-card)] border border-[rgba(201,165,90,0.2)] rounded-lg text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.5)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[var(--text-muted)] text-xs">×</span>
              <input
                type="number"
                min={0}
                max={99}
                value={awayGoals}
                onChange={(e) =>
                  handleChange(e.target.value, setAwayGoals, homeGoals, false)
                }
                className="w-8 h-8 text-center bg-[var(--bg-card)] border border-[rgba(201,165,90,0.2)] rounded-lg text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.5)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {pending !== undefined && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] shrink-0" />
              )}
            </>
          )}
        </div>

        {/* Visitante */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-xs text-[var(--text-primary)] font-medium truncate text-right">
            {match.away_team ?? "A definir"}
          </span>
          <TeamCrestImg team={match.away_team} crest={match.away_crest} />
        </div>
      </div>

      {/* Meu palpite vs resultado (se jogo finalizado) */}
      {isFinished && match.my_prediction && hasResult && (
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-center gap-1 text-[0.65rem] text-[var(--text-muted)]">
          Seu palpite:{" "}
          <span className="text-[var(--text-primary)] font-medium">
            {match.my_prediction.home_goals} × {match.my_prediction.away_goals}
          </span>
        </div>
      )}

      {/* Palpites dos participantes (partida ao vivo / já travada) */}
      {isLive && (
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.04)]">
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className="w-full flex items-center justify-between gap-1.5 text-[0.65rem] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <span>
              👥 Palpites dos participantes
              {otherPredictions && otherPredictions.length > 0
                ? ` (${otherPredictions.length})`
                : ""}
            </span>
            <span
              className={`shrink-0 transition-transform duration-200 ${
                showParticipants ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>

          {showParticipants && (
            <div className="mt-2 flex flex-col gap-1.5">
              {!otherPredictions || otherPredictions.length === 0 ? (
                <p className="text-[0.65rem] text-[var(--text-muted)] text-center py-1">
                  Nenhum palpite registrado
                </p>
              ) : (
                otherPredictions.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-2">
                    <Avatar url={p.avatar_url} name={p.display_name} size="xs" />
                    <span className="flex-1 text-[0.65rem] text-[var(--text-primary)] truncate">
                      {p.display_name}
                      {p.user_id === currentUserId && (
                        <span className="ml-1 text-[var(--text-muted)]">
                          (você)
                        </span>
                      )}
                    </span>
                    <span className="text-[0.7rem] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
                      {p.pred_home}–{p.pred_away}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Round Selector ───────────────────────────────────────────

function RoundSelector({
  rounds,
  selectedIdx,
  onSelect,
}: {
  rounds: RoundGroup[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = btnRefs.current[selectedIdx];
    if (el)
      el.scrollIntoView({
        inline: "center",
        behavior: "smooth",
        block: "nearest",
      });
  }, [selectedIdx]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-4 scrollbar-none">
      {rounds.map((r, i) => (
        <button
          key={r.label}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
          onClick={() => onSelect(i)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            i === selectedIdx
              ? "bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.35)]"
              : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
          } ${!r.is_visible ? "opacity-40" : ""}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── Variação de posição ──────────────────────────────────────

function VariationArrow({ delta }: { delta: number | undefined }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <span
      className={`flex items-center justify-center gap-px text-[0.55rem] font-bold leading-none ${
        up ? "text-green-400" : "text-red-400"
      }`}
      title={`${up ? "Subiu" : "Desceu"} ${Math.abs(delta)} posiç${
        Math.abs(delta) !== 1 ? "ões" : "ão"
      }`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────

function LeaderboardTable({
  entries,
  currentUserId,
  userPredictions,
  variations,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
  userPredictions: Map<string, UserPredictionDetail[]>;
  variations?: Map<string, number>;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  const PREDS_PAGE_SIZE = 5;
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [visiblePredsCount, setVisiblePredsCount] = useState(PREDS_PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        Nenhuma pontuação ainda
      </div>
    );
  }

  const toggle = (userId: string) =>
    setExpandedUserId((prev) => {
      const next = prev === userId ? null : userId;
      setVisiblePredsCount(PREDS_PAGE_SIZE);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => {
        const isExpanded = expandedUserId === entry.user_id;
        const isCurrentUser = entry.user_id === currentUserId;
        const preds = (userPredictions.get(entry.user_id) ?? [])
          .filter((p) => p.score_home !== null && p.score_away !== null)
          .sort(
            (a, b) =>
              new Date(b.utc_date).getTime() - new Date(a.utc_date).getTime(),
          );

        const visiblePreds = isExpanded
          ? preds.slice(0, visiblePredsCount)
          : preds;
        const hasMorePreds = preds.length > visiblePredsCount;
        const remainingPreds = preds.length - visiblePredsCount;

        const byRound = new Map<string, UserPredictionDetail[]>();
        for (const p of visiblePreds) {
          if (!byRound.has(p.round_label)) byRound.set(p.round_label, []);
          byRound.get(p.round_label)!.push(p);
        }

        return (
          <div key={entry.user_id} className="flex flex-col">
            <button
              onClick={() => toggle(entry.user_id)}
              className={`flex items-center gap-3 px-4 py-3 border transition-all text-left w-full ${
                isExpanded ? "rounded-t-xl" : "rounded-xl"
              } ${
                isCurrentUser
                  ? "bg-[rgba(201,165,90,0.07)] border-[rgba(201,165,90,0.2)]"
                  : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.04)]"
              }`}
            >
              <span className="w-6 flex gap-2 items-center justify-center shrink-0">
                <VariationArrow delta={variations?.get(entry.user_id)} />
                <span className="text-base leading-none">
                  {i < 3 ? medals[i] : `${i + 1}º`}
                </span>
              </span>

              <Avatar
                url={entry.avatar_url}
                name={entry.display_name}
                size="sm"
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {entry.display_name}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-[0.6rem] text-[var(--text-muted)]">
                      (você)
                    </span>
                  )}
                </p>
                <p className="text-[0.65rem] text-[var(--text-muted)]">
                  {entry.predictions_made} palpites
                  {entry.exact_scores > 0 && (
                    <span className="ml-1.5 text-[var(--gold)]">
                      · {entry.exact_scores} cravada
                      {entry.exact_scores !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>

              <span className="text-base font-bold text-[var(--gold)] shrink-0">
                {entry.total_points}
                <span className="text-[0.6rem] text-[var(--text-muted)] font-normal ml-0.5">
                  pts
                </span>
              </span>

              <span
                className={`text-[var(--text-muted)] text-xs shrink-0 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>

            {isExpanded && (
              <div
                className={`rounded-b-xl border border-t-0 overflow-hidden ${
                  isCurrentUser
                    ? "border-[rgba(201,165,90,0.2)]"
                    : "border-[rgba(255,255,255,0.04)]"
                }`}
              >
                {preds.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    Nenhum palpite registrado
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {[...byRound.entries()].map(([roundLabel, roundPreds]) => (
                      <div key={roundLabel}>
                        <div className="px-4 py-1.5 text-[0.6rem] font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[rgba(255,255,255,0.02)]">
                          {roundLabel}
                        </div>
                        {roundPreds.map((pred) => {
                          const hasResult =
                            pred.score_home !== null &&
                            pred.score_away !== null;
                          return (
                            <div
                              key={pred.match_id}
                              className="flex items-center gap-2 px-4 py-2 border-t border-[rgba(255,255,255,0.03)]"
                            >
                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                <img
                                  src={getTeamCrest(pred.home_team, pred.home_crest) ?? undefined}
                                  alt=""
                                  className="w-3.5 h-3.5 object-contain shrink-0"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                                <span className="text-[0.65rem] text-[var(--text-primary)] truncate">
                                  {pred.home_team}
                                </span>
                                <span className="text-[0.55rem] text-[var(--text-muted)] shrink-0 mx-0.5">
                                  ×
                                </span>
                                <span className="text-[0.65rem] text-[var(--text-primary)] truncate">
                                  {pred.away_team}
                                </span>
                                <img
                                  src={getTeamCrest(pred.away_team, pred.away_crest) ?? undefined}
                                  alt=""
                                  className="w-3.5 h-3.5 object-contain shrink-0"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[0.65rem] font-medium text-[var(--text-primary)]">
                                  {pred.pred_home}–{pred.pred_away}
                                </span>
                                {hasResult && (
                                  <span className="text-[0.6rem] text-[var(--text-muted)]">
                                    ({pred.score_home}–{pred.score_away})
                                  </span>
                                )}
                                <PointsBadge pts={pred.points_earned} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {hasMorePreds && (
                      <button
                        onClick={() =>
                          setVisiblePredsCount((c) => c + PREDS_PAGE_SIZE)
                        }
                        className="px-4 py-2.5 text-[0.7rem] font-semibold text-[var(--gold)] border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-center"
                      >
                        Ver mais {Math.min(remainingPreds, PREDS_PAGE_SIZE)}{" "}
                        palpite
                        {Math.min(remainingPreds, PREDS_PAGE_SIZE) !== 1
                          ? "s"
                          : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── BolaoDetailPage ──────────────────────────────────────────

export function BolaoDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pool, setPool] = useState<BolaoPool | null>(null);
  const [rounds, setRounds] = useState<RoundGroup[]>([]);
  const [members, setMembers] = useState<BolaoPoolMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roundLeaderboards, setRoundLeaderboards] = useState<
    RoundLeaderboard[]
  >([]);
  const [allUserPredictions, setAllUserPredictions] = useState<
    Map<string, UserPredictionDetail[]>
  >(new Map());
  const [activeTab, setActiveTab] = useState<Tab>("palpites");
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [selectedLeaderRoundIdx, setSelectedLeaderRoundIdx] = useState(-1); // -1 = geral
  const [loading, setLoading] = useState(true); // true só enquanto não há nada para exibir
  const [revalidating, setRevalidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingSchedule, setSyncingSchedule] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [adminScoringModel, setAdminScoringModel] =
    useState<ScoringModel>("classic");
  const [adminCustomConfig, setAdminCustomConfig] =
    useState<CustomScoringConfig>(DEFAULT_CUSTOM_CONFIG);
  const [changingModel, setChangingModel] = useState(false);
  const [adminVariationMode, setAdminVariationMode] =
    useState<VariationMode>("off");
  const [changingVariation, setChangingVariation] = useState(false);
  const [adminStageMultipliers, setAdminStageMultipliers] =
    useState<StageMultipliers>({});
  const [knockoutStages, setKnockoutStages] = useState<string[]>([]);
  const [changingMultipliers, setChangingMultipliers] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [pendingPredictions, setPendingPredictions] = useState<
    Record<string, { home: number; away: number }>
  >({});

  const isAdmin = user?.email === "valanife@gmail.com";
  const isCreator = !!user && !!pool && user.id === pool.created_by;
  // Criador do bolão pode configurar pontuação (modelo, variação, multiplicador
  // de mata-mata), mas não tem acesso a edição manual de placar, importação de
  // dados via API nem recálculo manual de pontos — isso fica restrito ao admin.
  const canManageScoring = isAdmin || isCreator;

  // ── Cache + revalidação (stale-while-revalidate) ──
  const cacheKey = poolId && user ? `bolao:${poolId}:${user.id}` : null;
  const sigRef = useRef<string>("");
  const userPickedRoundRef = useRef(false); // true após o usuário escolher uma rodada manualmente

  // Pull-to-refresh: puxar a tela para baixo a partir do topo dispara a
  // revalidação (gesto padrão do Android).
  const PULL_THRESHOLD = 70; // distância mínima (px) para disparar a atualização
  const PULL_MAX = 110; // distância máxima do indicador (efeito de resistência)
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const pullDistRef = useRef(0);

  // Controla visibilidade do botão inline para decidir se mostra o fixo
  const [isSaveButtonVisible, setIsSaveButtonVisible] = useState(false);
  const saveObserverRef = useRef<IntersectionObserver | null>(null);
  const saveButtonRef = useCallback((node: HTMLDivElement | null) => {
    saveObserverRef.current?.disconnect();
    saveObserverRef.current = null;
    if (node) {
      const observer = new IntersectionObserver(
        ([entry]) => setIsSaveButtonVisible(entry.isIntersecting),
        { threshold: 0.5 },
      );
      observer.observe(node);
      saveObserverRef.current = observer;
    }
  }, []);

  // Calcula a rodada a abrir com base no último jogo finalizado.
  // Ignora jogos adiados (POSTPONED) para o cálculo de "rodada completa".
  // Se todos os jogos não-adiados da rodada estão finalizados → próxima rodada.
  // Se ainda há jogos não finalizados na rodada → permanece nela.
  const computeCurrentRoundIdx = useCallback((roundsData: RoundGroup[]) => {
    if (roundsData.length === 0) return 0;

    let lastFinishedRoundIdx = -1;
    for (let i = 0; i < roundsData.length; i++) {
      if (roundsData[i].matches.some((m) => m.status === "FINISHED")) {
        lastFinishedRoundIdx = i;
      }
    }
    if (lastFinishedRoundIdx === -1) return 0;

    const round = roundsData[lastFinishedRoundIdx];
    const nonPostponed = round.matches.filter((m) => m.status !== "POSTPONED");
    const roundComplete = nonPostponed.every((m) => m.status === "FINISHED");

    if (roundComplete && lastFinishedRoundIdx + 1 < roundsData.length) {
      return lastFinishedRoundIdx + 1;
    }
    return lastFinishedRoundIdx;
  }, []);

  // Aplica um snapshot ao estado da tela. Recalcula is_locked (o cache pode
  // estar defasado) e só auto-seleciona a rodada enquanto o usuário não escolheu.
  const applySnapshot = useCallback(
    (snap: BolaoSnapshot, autoSelectRound: boolean) => {
      const rounds = withRecomputedLocks(snap.rounds);
      setPool(snap.pool);
      setRounds(rounds);
      setMembers(snap.members);
      setLeaderboard(snap.leaderboard);
      setRoundLeaderboards(snap.roundLeaderboards);
      setAllUserPredictions(new Map(snap.userPredictions));
      if (snap.pool) {
        setAdminScoringModel(snap.pool.scoring_model);
        setAdminCustomConfig(snap.pool.scoring_config ?? DEFAULT_CUSTOM_CONFIG);
        setAdminVariationMode(snap.pool.variation_mode);
        setAdminStageMultipliers(snap.pool.stage_multipliers ?? {});
      }
      if (autoSelectRound && !userPickedRoundRef.current) {
        setSelectedRoundIdx(computeCurrentRoundIdx(rounds));
      }
      setLoading(false);
    },
    [computeCurrentRoundIdx],
  );

  // Revalida contra o banco; só re-renderiza/regrava cache se algo mudou.
  const revalidate = useCallback(async () => {
    if (!poolId || !user) return;
    setRevalidating(true);
    try {
      const fresh = await fetchBolaoSnapshot(poolId, user.id);
      const sig = snapshotSignature(fresh);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        applySnapshot(fresh, true);
        if (cacheKey) writeCache(cacheKey, fresh);
      } else {
        setLoading(false);
      }
    } finally {
      setRevalidating(false);
    }
  }, [poolId, user, applySnapshot, cacheKey]);

  // Hidratação síncrona do cache no mount + primeira revalidação.
  useEffect(() => {
    if (!cacheKey) return;
    const cached = readCache<BolaoSnapshot>(cacheKey);
    if (cached) {
      sigRef.current = snapshotSignature(cached);
      applySnapshot(cached, true);
    }
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Realtime → revalida (só atualiza a UI se o dado realmente mudou)
  useEffect(() => {
    if (!poolId) return;
    const channel = subscribeBolao(poolId, revalidate);
    return () => {
      channel.unsubscribe();
    };
  }, [poolId, revalidate]);

  // Recalcula is_locked periodicamente: trava os inputs no horário do jogo
  // mesmo sem interação do usuário (ex.: página aberta no celular desde antes
  // do início). Sem isto, o lock só era reavaliado em fetch/rehidratação.
  useEffect(() => {
    const id = setInterval(() => {
      setRounds((prev) => {
        const next = withRecomputedLocks(prev);
        const changed = prev.some((r, i) =>
          r.matches.some(
            (m, j) => m.is_locked !== next[i].matches[j].is_locked,
          ),
        );
        return changed ? next : prev;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Pull-to-refresh: puxar para baixo a partir do topo da página revalida.
  // Enquanto o dedo arrasta, mostra um indicador que cresce com resistência;
  // ao soltar acima do limiar, dispara a revalidação.
  useEffect(() => {
    const setDist = (d: number) => {
      pullDistRef.current = d;
      setPullDistance(d);
    };

    const onTouchStart = (e: TouchEvent) => {
      // Só inicia o gesto se a página estiver no topo e não houver refresh ativo
      pullStartY.current =
        window.scrollY <= 0 && !pullRefreshing ? e.touches[0].clientY : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pullStartY.current === null) return;
      const delta = e.touches[0].clientY - pullStartY.current;
      if (delta > 0 && window.scrollY <= 0) {
        setPulling(true);
        // resistência: a distância exibida é metade do arrasto, limitada
        setDist(Math.min(delta * 0.5, PULL_MAX));
      } else {
        setPulling(false);
        setDist(0);
      }
    };

    const onTouchEnd = () => {
      if (
        pullStartY.current !== null &&
        pullDistRef.current >= PULL_THRESHOLD
      ) {
        setPullRefreshing(true);
        revalidate().finally(() => setPullRefreshing(false));
      }
      pullStartY.current = null;
      setPulling(false);
      setDist(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [revalidate, pullRefreshing]);

  // Auto-sync on mount — apenas para o admin
  useEffect(() => {
    if (!poolId || !isAdmin) return;
    syncPoolResults(poolId).then((updated) => {
      if (updated > 0) revalidate();
    });
  }, [poolId, isAdmin, revalidate]);

  // Agenda notificações 1h antes de partidas sem palpite
  const allMatches = useMemo(() => rounds.flatMap((r) => r.matches), [rounds]);

  // Palpites de todos os participantes agrupados por partida — usado para
  // exibir "palpites dos participantes" nas partidas já encerradas (ao vivo).
  const predictionsByMatch = useMemo(() => {
    const map = new Map<string, ParticipantPrediction[]>();
    const profileByUserId = new Map(members.map((m) => [m.user_id, m.profile]));
    for (const [userId, preds] of allUserPredictions) {
      const profile = profileByUserId.get(userId);
      if (!profile) continue;
      for (const p of preds) {
        if (!map.has(p.match_id)) map.set(p.match_id, []);
        map.get(p.match_id)!.push({
          user_id: userId,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          pred_home: p.pred_home,
          pred_away: p.pred_away,
        });
      }
    }
    return map;
  }, [allUserPredictions, members]);

  // Variação de posição na classificação geral (só quando habilitada no bolão)
  const positionVariations = useMemo(
    () =>
      computePositionVariations(
        leaderboard,
        allUserPredictions,
        allMatches,
        pool?.variation_mode ?? "off",
      ),
    [leaderboard, allUserPredictions, allMatches, pool?.variation_mode],
  );
  useEffect(() => {
    if (!poolId || allMatches.length === 0) return;
    scheduleBolaoReminders(poolId, allMatches);
  }, [poolId, allMatches]);

  // Fases eliminatórias que existem de fato no campeonato deste bolão (cada
  // campeonato pode começar em uma fase diferente).
  useEffect(() => {
    if (!pool?.championship_id) return;
    fetchKnockoutStages(pool.championship_id).then(setKnockoutStages);
  }, [pool?.championship_id]);

  const handleSync = async () => {
    if (!poolId || syncing) return;
    setSyncing(true);
    // Admin sempre força bypass do cooldown ao clicar manualmente
    const updated = await syncPoolResults(poolId, isAdmin);
    setSyncing(false);
    if (updated > 0) {
      revalidate();
      showToast(
        `${updated} partida${updated !== 1 ? "s" : ""} atualizada${updated !== 1 ? "s" : ""} e pontos recalculados ✓`,
      );
    } else {
      showToast("Nenhuma partida nova para atualizar");
    }
  };

  const handleAdminEditResult = async (
    matchId: string,
    home: number,
    away: number,
  ) => {
    if (!poolId) return;
    const { error } = await setMatchResultManually(matchId, home, away);
    if (error) {
      showToast(`Erro: ${error}`);
    } else {
      revalidate();
      showToast(`Resultado salvo e pontos recalculados ✓`);
    }
  };

  const handleRecalculate = async () => {
    if (!poolId || recalculating) return;
    setRecalculating(true);
    const { updated, error } = await recalculateAllPoints(poolId);
    setRecalculating(false);
    if (error) {
      showToast(`Erro: ${error}`);
    } else if (updated > 0) {
      revalidate();
      showToast(
        `Pontos recalculados para ${updated} partida${updated !== 1 ? "s" : ""} ✓`,
      );
    } else {
      showToast("Nenhuma partida finalizada para recalcular");
    }
  };

  const handleForcePopulate = async () => {
    if (!poolId || populating) return;
    setPopulating(true);
    const { populated, error } = await forcePopulateMatches(poolId);
    setPopulating(false);
    if (populated > 0) {
      revalidate();
      if (error) {
        showToast(
          `API indisponível — usando ${populated} partida${populated !== 1 ? "s" : ""} do banco ✓`,
        );
      } else {
        showToast(
          `${populated} partida${populated !== 1 ? "s" : ""} disponíve${populated !== 1 ? "is" : "l"} ✓`,
        );
      }
    } else {
      showToast(
        `Erro: ${error ?? "Nenhuma partida encontrada na API nem no banco"}`,
      );
    }
  };

  const handleSyncSchedule = async () => {
    if (!poolId || syncingSchedule) return;
    setSyncingSchedule(true);
    const { updated, error } = await syncMatchSchedules(poolId);
    setSyncingSchedule(false);
    if (error === "cooldown") {
      showToast("Aguarde alguns minutos antes de sincronizar novamente");
    } else if (error) {
      showToast(`Erro: ${error}`);
    } else if (updated > 0) {
      revalidate();
      showToast(
        `${updated} horário${updated !== 1 ? "s" : ""} atualizado${updated !== 1 ? "s" : ""} ✓`,
      );
    } else {
      showToast("Horários já estão atualizados");
    }
  };

  const handleModelChange = async () => {
    if (!poolId || changingModel) return;
    setChangingModel(true);
    const { error } = await updatePoolScoringModel(
      poolId,
      adminScoringModel,
      adminScoringModel === "custom" ? adminCustomConfig : null,
    );
    setChangingModel(false);
    if (error) {
      showToast(`Erro: ${error}`);
    } else {
      revalidate();
      const label = getScoringDisplay(
        adminScoringModel,
        adminCustomConfig,
      ).label;
      showToast(`Modelo alterado para ${label} e pontos recalculados ✓`);
    }
  };

  const handleVariationModeChange = async () => {
    if (!poolId || changingVariation) return;
    setChangingVariation(true);
    const { error } = await updatePoolVariationMode(poolId, adminVariationMode);
    setChangingVariation(false);
    if (error) {
      showToast(`Erro: ${error}`);
    } else {
      revalidate();
      showToast(
        `Variação de posição: ${VARIATION_MODES[adminVariationMode]} ✓`,
      );
    }
  };

  // Há alterações pendentes no modelo de pontuação?
  const modelDirty = (() => {
    if (!pool) return false;
    if (adminScoringModel !== pool.scoring_model) return true;
    if (adminScoringModel === "custom") {
      const saved = pool.scoring_config ?? DEFAULT_CUSTOM_CONFIG;
      return CUSTOM_SCORING_CATEGORIES.some(
        (c) => saved[c.key] !== adminCustomConfig[c.key],
      );
    }
    return false;
  })();

  const handleCustomConfigChange = (
    key: keyof CustomScoringConfig,
    value: number,
  ) => {
    setAdminCustomConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleStageMultiplierChange = (stage: string, value: number) => {
    setAdminStageMultipliers((prev) => ({ ...prev, [stage]: value }));
  };

  // Há alterações pendentes nos multiplicadores de fase eliminatória?
  const multipliersDirty = (() => {
    if (!pool) return false;
    const saved = pool.stage_multipliers ?? {};
    return knockoutStages.some(
      (stage) => (saved[stage] ?? 1) !== (adminStageMultipliers[stage] ?? 1),
    );
  })();

  const handleMultipliersChange = async () => {
    if (!poolId || changingMultipliers) return;
    setChangingMultipliers(true);
    const { error } = await updatePoolStageMultipliers(
      poolId,
      adminStageMultipliers,
    );
    setChangingMultipliers(false);
    if (error) {
      showToast(`Erro: ${error}`);
    } else {
      revalidate();
      showToast("Multiplicadores de fase salvos e pontos recalculados ✓");
    }
  };

  const handlePredictionChange = useCallback(
    (matchId: string, home: number, away: number) => {
      setPendingPredictions((prev) => ({ ...prev, [matchId]: { home, away } }));
    },
    [],
  );

  const handleSave = async () => {
    if (!poolId || !user || saving) return;
    setSaving(true);
    const results = await Promise.all(
      Object.entries(pendingPredictions).map(([matchId, { home, away }]) =>
        upsertPrediction(poolId, matchId, user.id, home, away),
      ),
    );
    const failed = results.find((r) => r.error);
    setPendingPredictions({});
    setSaving(false);
    if (failed) showToast(failed.error ?? "Não foi possível salvar o palpite.");
    revalidate();
  };

  const handleLeave = async () => {
    if (!poolId || !user) return;
    if (!confirm("Sair do bolão?")) return;
    setLeaveLoading(true);
    await leavePool(user.id, poolId);
    navigate("/bolao");
  };

  const currentRound = rounds[selectedRoundIdx] ?? null;
  const currentLeaderboard =
    selectedLeaderRoundIdx === -1
      ? leaderboard
      : (roundLeaderboards[selectedLeaderRoundIdx]?.entries ?? []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-abyss)]">
        <div className="spinner" />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-[var(--bg-abyss)]">
        <p className="text-[var(--text-muted)]">Bolão não encontrado</p>
        <button
          onClick={() => navigate("/bolao")}
          className="text-sm text-[var(--gold)] underline underline-offset-2"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)] flex flex-col"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      {/* Indicador de pull-to-refresh */}
      {(pullDistance > 0 || pullRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none"
          style={{
            transform: `translateY(${pullRefreshing ? 12 : Math.max(0, pullDistance - 28)}px)`,
            opacity: pullRefreshing
              ? 1
              : Math.min(pullDistance / PULL_THRESHOLD, 1),
            transition: pulling ? "none" : "transform 0.25s, opacity 0.25s",
          }}
        >
          <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-center">
            {pullRefreshing || pullDistance >= PULL_THRESHOLD ? (
              <span className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              <span
                className="text-[var(--text-muted)] text-sm leading-none"
                style={{ transform: `rotate(${pullDistance * 2.4}deg)` }}
              >
                ↓
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/bolao")}
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1
            className="font-bold text-[var(--text-primary)] text-base truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pool.name}
          </h1>
          <p className="text-[0.65rem] text-[var(--text-muted)] truncate">
            {pool.championship.name} · {pool.member_count} participante
            {pool.member_count !== 1 ? "s" : ""}
          </p>
        </div>
        {revalidating && (
          <span
            className="spinner shrink-0"
            style={{ width: 14, height: 14 }}
            title="Atualizando…"
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[rgba(255,255,255,0.06)] px-4">
        {(
          [
            ["palpites", "Palpites"],
            ["classificacao", "Classificação"],
            ["stats", "Stats"],
            ["info", "Info"],
            ...(canManageScoring ? [["admin", "Admin"]] : []),
          ] as [Tab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === tab
                ? "border-[var(--gold)] text-[var(--gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Palpites ── */}
      {activeTab === "palpites" && (
        <div className="flex flex-col gap-3 mt-3">
          {rounds.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              Nenhuma partida encontrada
            </div>
          ) : (
            <>
              <RoundSelector
                rounds={rounds}
                selectedIdx={selectedRoundIdx}
                onSelect={(idx) => {
                  userPickedRoundRef.current = true;
                  setSelectedRoundIdx(idx);
                }}
              />

              {currentRound && !currentRound.is_visible ? (
                <div className="mx-4 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-8 text-center">
                  <p className="text-2xl mb-2">🔒</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Times ainda não definidos
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    A fase anterior precisa ser concluída
                  </p>
                </div>
              ) : (
                <div className="px-4 flex flex-col gap-2">
                  {(() => {
                    const all = currentRound?.matches ?? [];
                    const upcoming = all.filter((m) => m.status !== "FINISHED");
                    const finished = all.filter((m) => m.status === "FINISHED");
                    const renderCard = (match: MatchWithPrediction) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        pending={pendingPredictions[match.id]}
                        onPredictionChange={handlePredictionChange}
                        isAdmin={isAdmin}
                        onAdminEditResult={handleAdminEditResult}
                        otherPredictions={predictionsByMatch.get(match.id)}
                        currentUserId={user?.id}
                      />
                    );
                    const sectionLabel = (text: string) => (
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] px-1 pt-1">
                        {text}
                      </div>
                    );
                    return (
                      <>
                        {upcoming.length > 0 && (
                          <>
                            {sectionLabel("Próximas partidas")}
                            {upcoming.map(renderCard)}
                          </>
                        )}
                        {finished.length > 0 && (
                          <>
                            {sectionLabel("Partidas Finalizadas")}
                            {finished.map(renderCard)}
                          </>
                        )}
                      </>
                    );
                  })()}

                  {/* Botão inline — aparece após o último jogo */}
                  {Object.keys(pendingPredictions).length > 0 && (
                    <div ref={saveButtonRef} className="pt-1 pb-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-[var(--gold)] text-[#08080f] shadow-lg disabled:opacity-70 transition-all active:scale-95"
                      >
                        {saving ? (
                          <span
                            className="spinner"
                            style={{ width: 14, height: 14 }}
                          />
                        ) : (
                          <>
                            Salvar palpites
                            <span className="bg-[rgba(0,0,0,0.15)] rounded-full px-2 py-0.5 text-[0.65rem]">
                              {Object.keys(pendingPredictions).length}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Classificação ── */}
      {activeTab === "classificacao" && (
        <div className="flex flex-col gap-3 mt-3">
          {/* Seletor geral / por rodada */}
          <div className="flex gap-2 overflow-x-auto pb-1 px-4 scrollbar-none">
            <button
              onClick={() => setSelectedLeaderRoundIdx(-1)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                selectedLeaderRoundIdx === -1
                  ? "bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border-[rgba(201,165,90,0.35)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[rgba(255,255,255,0.06)]"
              }`}
            >
              Geral
            </button>
            {roundLeaderboards.map((r, i) => (
              <button
                key={r.round_label}
                onClick={() => setSelectedLeaderRoundIdx(i)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  selectedLeaderRoundIdx === i
                    ? "bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border-[rgba(201,165,90,0.35)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[rgba(255,255,255,0.06)]"
                }`}
              >
                {r.round_label}
              </button>
            ))}
          </div>

          <div className="px-4">
            <LeaderboardTable
              key={selectedLeaderRoundIdx}
              entries={currentLeaderboard}
              currentUserId={user!.id}
              userPredictions={allUserPredictions}
              variations={
                selectedLeaderRoundIdx === -1 ? positionVariations : undefined
              }
            />
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      {activeTab === "stats" && (
        <BolaoStatsTab
          allUserPredictions={allUserPredictions}
          leaderboard={leaderboard}
          roundLeaderboards={roundLeaderboards}
          members={members}
          pool={pool}
          currentUserId={user?.id ?? null}
        />
      )}

      {/* ── Info ── */}
      {activeTab === "info" && (
        <div className="px-4 mt-3 flex flex-col gap-4">
          {/* Detalhes */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
              Detalhes
            </p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Campeonato</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {pool.championship.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Temporada</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {pool.championship.season}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Participantes</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {pool.member_count}
                </span>
              </div>
            </div>
          </div>

          {/* Pontuação */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
              Pontuação —{" "}
              {getScoringDisplay(pool.scoring_model, pool.scoring_config).label}
            </p>
            <div className="flex flex-col gap-1.5">
              {getScoringDisplay(
                pool.scoring_model,
                pool.scoring_config,
              ).rules.map(([icon, pts, desc]) => (
                <div key={pts} className="flex items-center gap-2 text-xs">
                  <span>{icon}</span>
                  <span className="font-bold text-[var(--text-primary)] w-12 shrink-0">
                    {pts}
                  </span>
                  <span className="text-[var(--text-muted)]">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Membros */}
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              Participantes
            </p>
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.04)] rounded-xl"
                >
                  <Avatar
                    url={m.profile.avatar_url}
                    name={m.profile.display_name}
                    size="sm"
                  />
                  <span className="flex-1 text-sm text-[var(--text-primary)]">
                    {m.profile.display_name}
                    {m.user_id === user?.id && (
                      <span className="ml-1.5 text-[0.6rem] text-[var(--text-muted)]">
                        (você)
                      </span>
                    )}
                  </span>
                  {m.user_id === pool.created_by && (
                    <span className="text-[0.6rem] text-[var(--gold)] bg-[rgba(201,165,90,0.08)] border border-[rgba(201,165,90,0.2)] px-1.5 py-0.5 rounded-md">
                      criador
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sair */}
          {pool.is_member && (
            <button
              onClick={handleLeave}
              disabled={leaveLoading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-[var(--red)] bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.2)] rounded-xl hover:bg-[rgba(196,64,64,0.15)] disabled:opacity-50 transition-colors"
            >
              Sair do bolão
            </button>
          )}
        </div>
      )}

      {/* ── Admin ── */}
      {activeTab === "admin" && canManageScoring && (
        <div className="px-4 mt-3 flex flex-col gap-4">
          {isAdmin && (
            <>
              {/* Partidas */}
              <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-1">
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide mb-2">
                  Partidas
                </p>

                <button
                  onClick={handleForcePopulate}
                  disabled={populating}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)] transition-all disabled:opacity-50 text-left"
                >
                  <span className="text-lg shrink-0">
                    {populating ? (
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      "⬇️"
                    )}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Importar da API
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Busca todas as partidas do campeonato e preserva rodadas já
                      inseridas
                    </span>
                  </div>
                </button>

                <button
                  onClick={handleSyncSchedule}
                  disabled={syncingSchedule}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)] transition-all disabled:opacity-50 text-left"
                >
                  <span className="text-lg shrink-0">
                    {syncingSchedule ? (
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      "📅"
                    )}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Atualizar horários
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Atualiza datas e status das partidas ainda não finalizadas
                    </span>
                  </div>
                </button>
              </div>

              {/* Pontuação */}
              <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-1">
                <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide mb-2">
                  Pontuação
                </p>

                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)] transition-all disabled:opacity-50 text-left"
                >
                  <span className="text-lg shrink-0">
                    {syncing ? (
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      "🔄"
                    )}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Sincronizar resultados
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Busca resultados finais via API e calcula pontos
                      automaticamente
                    </span>
                  </div>
                </button>

                <button
                  onClick={handleRecalculate}
                  disabled={recalculating}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)] transition-all disabled:opacity-50 text-left"
                >
                  <span className="text-lg shrink-0">
                    {recalculating ? (
                      <span className="spinner" style={{ width: 18, height: 18 }} />
                    ) : (
                      "♻️"
                    )}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Recalcular pontos
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Força recálculo de pontos para todas as partidas com resultado
                      registrado
                    </span>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Modelo de pontuação */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Modelo de Pontuação
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">
                Atual:{" "}
                <span className="text-[var(--gold)]">
                  {pool &&
                    getScoringDisplay(pool.scoring_model, pool.scoring_config)
                      .label}
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {(Object.keys(SCORING_MODELS) as PresetScoringModel[]).map(
                (model) => (
                  <button
                    key={model}
                    onClick={() => setAdminScoringModel(model)}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                      adminScoringModel === model
                        ? "bg-[rgba(201,165,90,0.08)] border-[rgba(201,165,90,0.35)]"
                        : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold mb-1 ${adminScoringModel === model ? "text-[var(--gold)]" : "text-[var(--text-primary)]"}`}
                    >
                      {SCORING_MODELS[model].label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {SCORING_MODELS[model].rules.map(([icon, pts, desc]) => (
                        <span
                          key={pts}
                          className="text-[0.6rem] text-[var(--text-muted)] flex gap-1.5"
                        >
                          <span>{icon}</span>
                          <span className="font-bold w-10 shrink-0">{pts}</span>
                          <span>{desc}</span>
                        </span>
                      ))}
                    </div>
                  </button>
                ),
              )}

              {/* Modelo personalizado */}
              <button
                onClick={() => setAdminScoringModel("custom")}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                  adminScoringModel === "custom"
                    ? "bg-[rgba(201,165,90,0.08)] border-[rgba(201,165,90,0.35)]"
                    : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                }`}
              >
                <p
                  className={`text-sm font-semibold mb-1 ${adminScoringModel === "custom" ? "text-[var(--gold)]" : "text-[var(--text-primary)]"}`}
                >
                  Personalizado
                </p>
                <p className="text-[0.6rem] text-[var(--text-muted)]">
                  Defina manualmente os pontos de cada tipo de acerto.
                </p>
              </button>
            </div>

            {/* Editor de pontos do modelo personalizado */}
            {adminScoringModel === "custom" && (
              <div className="flex flex-col gap-1.5 bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.2)] rounded-xl p-3">
                {CUSTOM_SCORING_CATEGORIES.map((cat) => (
                  <div key={cat.key} className="flex items-center gap-2">
                    <span className="text-sm shrink-0">{cat.icon}</span>
                    <span className="flex-1 text-xs text-[var(--text-primary)]">
                      {cat.label}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={adminCustomConfig[cat.key]}
                      onChange={(e) =>
                        handleCustomConfigChange(
                          cat.key,
                          e.target.value === ""
                            ? 0
                            : parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-16 shrink-0 text-center text-sm font-bold text-[var(--gold)] bg-[var(--bg-card)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[rgba(201,165,90,0.5)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {modelDirty && (
              <p className="text-[0.65rem] text-orange-400 bg-[rgba(251,146,60,0.08)] border border-[rgba(251,146,60,0.2)] rounded-lg px-3 py-2">
                Ao salvar, todas as pontuações serão zeradas e recalculadas com
                o novo modelo.
              </p>
            )}

            <button
              onClick={handleModelChange}
              disabled={changingModel || !modelDirty}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {changingModel ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Recalculando…
                </>
              ) : (
                "Salvar modelo"
              )}
            </button>
          </div>

          {/* Variação de posição */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Variação de Posição
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">
                Exibe uma seta na classificação geral indicando quantas posições
                cada participante subiu ou desceu.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {(Object.keys(VARIATION_MODES) as VariationMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAdminVariationMode(mode)}
                  className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                    adminVariationMode === mode
                      ? "bg-[rgba(201,165,90,0.08)] border-[rgba(201,165,90,0.35)]"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${adminVariationMode === mode ? "text-[var(--gold)]" : "text-[var(--text-primary)]"}`}
                  >
                    {VARIATION_MODES[mode]}
                  </p>
                  <p className="text-[0.6rem] text-[var(--text-muted)] mt-0.5">
                    {mode === "off"
                      ? "Nenhuma seta é exibida."
                      : mode === "round"
                        ? "Compara com a classificação antes da última rodada."
                        : "Compara com a classificação antes da última partida."}
                  </p>
                </button>
              ))}
            </div>

            <button
              onClick={handleVariationModeChange}
              disabled={
                changingVariation ||
                adminVariationMode === (pool?.variation_mode ?? "off")
              }
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {changingVariation ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                "Salvar variação"
              )}
            </button>
          </div>

          {/* Multiplicador por fase eliminatória */}
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Multiplicador de Mata-Mata
              </p>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">
                Multiplica os pontos ganhos em cada fase eliminatória. Fases
                sem multiplicador definido valem 1x (sem alteração). Cada
                campeonato tem suas próprias fases — a Copa do Mundo, por
                exemplo, começa nas dezesseis-avos de final.
              </p>
            </div>

            {knockoutStages.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Este campeonato ainda não tem fases eliminatórias cadastradas.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  {knockoutStages.map((stage) => (
                    <div key={stage} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-[var(--text-primary)]">
                        {toRoundLabel(stage, null)}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={adminStageMultipliers[stage] ?? 1}
                        onChange={(e) =>
                          handleStageMultiplierChange(
                            stage,
                            e.target.value === ""
                              ? 1
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-16 shrink-0 text-center text-sm font-bold text-[var(--gold)] bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[rgba(201,165,90,0.5)]"
                      />
                      <span className="text-xs text-[var(--text-muted)] shrink-0">
                        x
                      </span>
                    </div>
                  ))}
                </div>

                {multipliersDirty && (
                  <p className="text-[0.65rem] text-orange-400 bg-[rgba(251,146,60,0.08)] border border-[rgba(251,146,60,0.2)] rounded-lg px-3 py-2">
                    Ao salvar, as pontuações dos jogos eliminatórios serão
                    recalculadas.
                  </p>
                )}

                <button
                  onClick={handleMultipliersChange}
                  disabled={changingMultipliers || !multipliersDirty}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {changingMultipliers ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                      Recalculando…
                    </>
                  ) : (
                    "Salvar multiplicadores"
                  )}
                </button>
              </>
            )}
          </div>

          {isAdmin && (
            <p className="text-[0.65rem] text-[var(--text-muted)] text-center px-2">
              Para editar o resultado de um jogo manualmente, acesse a aba
              Palpites e toque em ✏️ no card da partida.
            </p>
          )}
        </div>
      )}

      {/* Toast de feedback */}
      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] shadow-[0_4px_20px_rgba(0,0,0,0.5)] pointer-events-none whitespace-nowrap"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {toast}
        </div>
      )}

      {/* Botão fixo — aparece apenas quando o botão inline ainda não está visível */}
      {Object.keys(pendingPredictions).length > 0 && !isSaveButtonVisible && (
        <div className="fixed bottom-[calc(4rem+var(--safe-bottom))] left-0 right-0 px-4 z-50 flex justify-center">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-[var(--gold)] text-[#08080f] shadow-lg disabled:opacity-70 transition-all active:scale-95"
          >
            {saving ? (
              <span className="spinner" style={{ width: 14, height: 14 }} />
            ) : (
              <>
                Salvar palpites
                <span className="bg-[rgba(0,0,0,0.15)] rounded-full px-2 py-0.5 text-[0.65rem]">
                  {Object.keys(pendingPredictions).length}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
