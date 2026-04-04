import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchPoolById,
  fetchMatchesForPool,
  fetchPoolMembers,
  fetchLeaderboard,
  fetchRoundLeaderboards,
  upsertPrediction,
  syncPoolResults,
  syncMatchSchedules,
  leavePool,
  type BolaoPool,
  type RoundGroup,
  type MatchWithPrediction,
  type BolaoPoolMember,
  type LeaderboardEntry,
  type RoundLeaderboard,
  subscribeBolao,
} from "./bolaoService";

type Tab = "palpites" | "classificacao" | "info";

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
}: {
  match: MatchWithPrediction;
  pending?: { home: number; away: number };
  onPredictionChange: (matchId: string, home: number, away: number) => void;
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

  const isFinished = match.status === "FINISHED";
  const hasResult =
    match.score_home !== null && match.score_away !== null;

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
    if (!isNaN(h) && !isNaN(a) && h >= 0 && a >= 0 && other !== "" && cleaned !== "") {
      onPredictionChange(match.id, h, a);
    }
  };

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
          {match.is_locked && !isFinished && (
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
        </div>
      </div>

      {/* Times + placar/palpite */}
      <div className="flex items-center gap-2">
        {/* Casa */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {match.home_crest && (
            <img
              src={match.home_crest}
              alt=""
              className="w-5 h-5 object-contain shrink-0"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <span className="text-xs text-[var(--text-primary)] font-medium truncate">
            {match.home_team}
          </span>
        </div>

        {/* Resultado real ou palpite */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isFinished && hasResult ? (
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
                <div
                  className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] shrink-0"
                />
              )}
            </>
          )}
        </div>

        {/* Visitante */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-xs text-[var(--text-primary)] font-medium truncate text-right">
            {match.away_team}
          </span>
          {match.away_crest && (
            <img
              src={match.away_crest}
              alt=""
              className="w-5 h-5 object-contain shrink-0"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
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
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-4 scrollbar-none">
      {rounds.map((r, i) => (
        <button
          key={r.label}
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

// ─── Leaderboard ──────────────────────────────────────────────

function LeaderboardTable({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
}) {
  const medals = ["🥇", "🥈", "🥉"];

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        Nenhuma pontuação ainda
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => (
        <div
          key={entry.user_id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
            entry.user_id === currentUserId
              ? "bg-[rgba(201,165,90,0.07)] border-[rgba(201,165,90,0.2)]"
              : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.04)]"
          }`}
        >
          <span className="w-6 text-center text-base shrink-0">
            {i < 3 ? medals[i] : `${i + 1}º`}
          </span>

          <Avatar
            url={entry.avatar_url}
            name={entry.display_name}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {entry.display_name}
              {entry.user_id === currentUserId && (
                <span className="ml-1.5 text-[0.6rem] text-[var(--text-muted)]">
                  (você)
                </span>
              )}
            </p>
            <p className="text-[0.65rem] text-[var(--text-muted)]">
              {entry.predictions_made} palpites
              {entry.exact_scores > 0 && (
                <span className="ml-1.5 text-[var(--gold)]">
                  · {entry.exact_scores} cravada{entry.exact_scores !== 1 ? "s" : ""}
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
        </div>
      ))}
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
  const [activeTab, setActiveTab] = useState<Tab>("palpites");
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [selectedLeaderRoundIdx, setSelectedLeaderRoundIdx] = useState(-1); // -1 = geral
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingSchedule, setSyncingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [pendingPredictions, setPendingPredictions] = useState<
    Record<string, { home: number; away: number }>
  >({});

  const isAdmin = user?.email === "valanife@gmail.com";

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

  const loadAll = useCallback(async () => {
    if (!poolId || !user) return;
    setLoading(true);
    const [poolData, roundsData, membersData, lbData, roundLbData] =
      await Promise.all([
        fetchPoolById(poolId, user.id),
        fetchMatchesForPool(poolId, user.id),
        fetchPoolMembers(poolId),
        fetchLeaderboard(poolId),
        fetchRoundLeaderboards(poolId),
      ]);
    setPool(poolData);
    setRounds(roundsData);
    setMembers(membersData);
    setLeaderboard(lbData);
    setRoundLeaderboards(roundLbData);
    setLoading(false);

    // Abre na rodada atual baseada no último jogo finalizado.
    // Ignora jogos adiados (POSTPONED) para o cálculo de "rodada completa".
    // Se todos os jogos não-adiados da rodada estão finalizados → próxima rodada.
    // Se ainda há jogos não finalizados na rodada → permanece nela.
    const currentIdx = (() => {
      if (roundsData.length === 0) return 0;

      // Última rodada (pelo índice) que contém ao menos um jogo finalizado
      let lastFinishedRoundIdx = -1;
      for (let i = 0; i < roundsData.length; i++) {
        if (roundsData[i].matches.some((m) => m.status === "FINISHED")) {
          lastFinishedRoundIdx = i;
        }
      }

      // Nenhum jogo finalizado ainda → abre na primeira rodada
      if (lastFinishedRoundIdx === -1) return 0;

      // Verifica se a rodada está completa (excluindo adiados)
      const round = roundsData[lastFinishedRoundIdx];
      const nonPostponed = round.matches.filter((m) => m.status !== "POSTPONED");
      const roundComplete = nonPostponed.every((m) => m.status === "FINISHED");

      if (roundComplete && lastFinishedRoundIdx + 1 < roundsData.length) {
        return lastFinishedRoundIdx + 1; // Próxima rodada
      }
      return lastFinishedRoundIdx;
    })();
    setSelectedRoundIdx(currentIdx);
  }, [poolId, user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime
  useEffect(() => {
    if (!poolId) return;
    const channel = subscribeBolao(poolId, loadAll);
    return () => {
      channel.unsubscribe();
    };
  }, [poolId, loadAll]);

  // Auto-sync on mount — apenas para o admin
  useEffect(() => {
    if (!poolId || !isAdmin) return;
    syncPoolResults(poolId).then((updated) => {
      if (updated > 0) loadAll();
    });
  }, [poolId, isAdmin, loadAll]);

  const handleSync = async () => {
    if (!poolId || syncing) return;
    setSyncing(true);
    const updated = await syncPoolResults(poolId);
    setSyncing(false);
    if (updated > 0) {
      loadAll();
      showToast(`${updated} partida${updated !== 1 ? "s" : ""} atualizada${updated !== 1 ? "s" : ""} e pontos recalculados ✓`);
    } else {
      showToast("Nenhuma partida nova para atualizar");
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
      loadAll();
      showToast(`${updated} horário${updated !== 1 ? "s" : ""} atualizado${updated !== 1 ? "s" : ""} ✓`);
    } else {
      showToast("Horários já estão atualizados");
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
    await Promise.all(
      Object.entries(pendingPredictions).map(([matchId, { home, away }]) =>
        upsertPrediction(poolId, matchId, user.id, home, away),
      ),
    );
    setPendingPredictions({});
    setSaving(false);
    loadAll();
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
        {isAdmin && (
          <>
            <button
              onClick={handleSyncSchedule}
              disabled={syncingSchedule}
              title="Atualizar horários das partidas"
              className="p-2 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors disabled:opacity-50"
            >
              {syncingSchedule ? (
                <span className="spinner" style={{ width: 16, height: 16 }} />
              ) : (
                "📅"
              )}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Sincronizar resultados e pontos"
              className="p-2 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <span className="spinner" style={{ width: 16, height: 16 }} />
              ) : (
                "🔄"
              )}
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[rgba(255,255,255,0.06)] px-4">
        {(
          [
            ["palpites", "Palpites"],
            ["classificacao", "Classificação"],
            ["info", "Info"],
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
                onSelect={setSelectedRoundIdx}
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
                  {currentRound?.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      pending={pendingPredictions[match.id]}
                      onPredictionChange={handlePredictionChange}
                    />
                  ))}

                  {/* Botão inline — aparece após o último jogo */}
                  {Object.keys(pendingPredictions).length > 0 && (
                    <div ref={saveButtonRef} className="pt-1 pb-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-[var(--gold)] text-[#08080f] shadow-lg disabled:opacity-70 transition-all active:scale-95"
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
              entries={currentLeaderboard}
              currentUserId={user!.id}
            />
          </div>
        </div>
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
