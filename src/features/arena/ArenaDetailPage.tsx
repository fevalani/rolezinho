import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchDuelById,
  fetchBetsForDuel,
  fetchWallet,
  ensureWallet,
  closeDuel,
  resolveDuel,
  placeBet,
  deleteBet,
  claimPayout,
  generateVerdict,
  subscribeArena,
  type ArenaDuel,
  type ArenaBet,
  type ArenaWallet,
  type BetSide,
} from "./arenaService";

// ─── Helpers ─────────────────────────────────────────────────

const SIDE_NAME = (duel: ArenaDuel, side: BetSide) =>
  side === "A" ? duel.side_a : side === "B" ? duel.side_b : "Empate";

const SIDE_ODDS = (duel: ArenaDuel, side: BetSide) =>
  side === "A" ? duel.odds_a : side === "draw" ? duel.odds_draw : duel.odds_b;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Apostas abertas", color: "text-green-400 bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.25)]" },
  closed: { label: "Apostas encerradas", color: "text-amber-400 bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.25)]" },
  resolved: { label: "Resolvido", color: "text-[var(--gold)] bg-[rgba(201,165,90,0.1)] border-[rgba(201,165,90,0.25)]" },
};

// ─── Odds Display ─────────────────────────────────────────────

function OddsDisplay({
  duel,
  selected,
  onSelect,
}: {
  duel: ArenaDuel;
  selected?: BetSide | null;
  onSelect?: (side: BetSide) => void;
}) {
  const sides: { side: BetSide; label: string; sublabel: string }[] = [
    { side: "A", label: "1", sublabel: duel.side_a },
    { side: "draw", label: "X", sublabel: "Empate" },
    { side: "B", label: "2", sublabel: duel.side_b },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {sides.map(({ side, label, sublabel }) => {
        const odds = SIDE_ODDS(duel, side);
        const isSelected = selected === side;
        const isResult = duel.result === side;
        const isWrong = duel.result && !isResult;

        return (
          <button
            key={side}
            onClick={() => onSelect?.(side)}
            disabled={!onSelect}
            className={`flex flex-col items-center py-3 px-2 rounded-xl border transition-all ${
              isResult
                ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.5)]"
                : isSelected
                  ? "bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.4)]"
                  : isWrong
                    ? "opacity-40 bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.05)]"
                    : onSelect
                      ? "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.05)] cursor-pointer"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.08)] cursor-default"
            }`}
          >
            <span className="text-[0.6rem] text-[var(--text-muted)] font-semibold mb-0.5">
              {label}
            </span>
            <span
              className={`text-xl font-black tabular-nums ${
                isResult ? "text-[var(--gold)]" : isSelected ? "text-green-400" : "text-[var(--text-primary)]"
              }`}
            >
              {Number(odds).toFixed(2)}
            </span>
            <span className="text-[0.6rem] text-[var(--text-muted)] text-center leading-tight mt-0.5 truncate w-full">
              {sublabel}
            </span>
            {isResult && <span className="text-[0.55rem] text-[var(--gold)] font-bold mt-0.5">RESULTADO</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Bets List ────────────────────────────────────────────────

function BetsList({ bets, duel }: { bets: ArenaBet[]; duel: ArenaDuel }) {
  if (!bets.length) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Apostas ({bets.length})
      </p>
      <div className="flex flex-col gap-2">
        {bets.map((bet) => {
          const sideName = SIDE_NAME(duel, bet.side);
          const sideLabel = bet.side === "A" ? "1" : bet.side === "draw" ? "X" : "2";
          const isWinner = duel.result === bet.side;
          const isLoser = duel.result && duel.result !== bet.side;

          return (
            <div
              key={bet.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                isWinner
                  ? "bg-[rgba(74,222,128,0.06)] border-[rgba(74,222,128,0.2)]"
                  : isLoser
                    ? "opacity-50 bg-[var(--bg-card)] border-[rgba(255,255,255,0.05)]"
                    : "bg-[var(--bg-card)] border-[rgba(255,255,255,0.05)]"
              }`}
            >
              <Avatar
                url={bet.profile?.avatar_url ?? null}
                name={bet.profile?.display_name ?? "?"}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {bet.profile?.display_name ?? "—"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {sideLabel} · {sideName} · {bet.amount} pts
                </p>
              </div>
              <div className="text-right shrink-0">
                {isWinner ? (
                  <span className="text-sm font-bold text-green-400">
                    +{bet.actual_payout ?? bet.potential_payout} pts
                  </span>
                ) : duel.status !== "resolved" ? (
                  <span className="text-xs text-[var(--text-muted)]">
                    → {bet.potential_payout} pts
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">-{bet.amount} pts</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ArenaDetailPage ─────────────────────────────────────────

export function ArenaDetailPage() {
  const { duelId } = useParams<{ duelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [duel, setDuel] = useState<ArenaDuel | null>(null);
  const [bets, setBets] = useState<ArenaBet[]>([]);
  const [wallet, setWallet] = useState<ArenaWallet | null>(null);
  const [loading, setLoading] = useState(true);

  // Bet form state
  const [selectedSide, setSelectedSide] = useState<BetSide | null>(null);
  const [betAmount, setBetAmount] = useState<string>("50");
  const [placingBet, setPlacingBet] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);

  // Creator actions
  const [closing, setClosing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Justification visible
  const [showJustification, setShowJustification] = useState(false);

  // Claim state
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  // Delete bet state
  const [deletingBet, setDeletingBet] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !duelId) return;
    const [d, b, w] = await Promise.all([
      fetchDuelById(duelId, user.id),
      fetchBetsForDuel(duelId),
      ensureWallet(user.id),
    ]);
    setDuel(d);
    setBets(b);
    setWallet(w);
    setLoading(false);
  }, [user, duelId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = subscribeArena(load);
    return () => { channel.unsubscribe(); };
  }, [load]);

  // ── Derived state ─────────────────────────────────────────

  const isCreator = user && duel?.created_by === user.id;
  const myBet = duel?.my_bet ?? null;
  const amount = Math.max(1, parseInt(betAmount) || 0);
  const potentialPayout = selectedSide
    ? Math.floor(amount * SIDE_ODDS(duel!, selectedSide))
    : 0;
  const balance = wallet?.balance ?? 0;
  const canBet = duel?.status === "open" && !myBet && amount >= 1 && amount <= balance && !!selectedSide;

  const claimableBet =
    duel?.status === "resolved" &&
    myBet &&
    (myBet.actual_payout ?? 0) > 0 &&
    !myBet.payout_claimed &&
    !claimed
      ? myBet
      : null;

  // ── Actions ───────────────────────────────────────────────

  const handlePlaceBet = async () => {
    if (!user || !duel || !selectedSide || !canBet) return;
    setPlacingBet(true);
    setBetError(null);
    const { error } = await placeBet(user.id, duel.id, selectedSide, amount, potentialPayout);
    setPlacingBet(false);
    if (error) { setBetError(error); return; }
    const [d, b, w] = await Promise.all([
      fetchDuelById(duel.id, user.id),
      fetchBetsForDuel(duel.id),
      fetchWallet(user.id),
    ]);
    setDuel(d);
    setBets(b);
    if (w) setWallet(w);
  };

  const handleDeleteBet = async () => {
    if (!user || !myBet) return;
    setDeletingBet(true);
    setDeleteError(null);
    const { error } = await deleteBet(user.id, myBet.id, myBet.amount);
    setDeletingBet(false);
    if (error) { setDeleteError(error); return; }
    const [d, b, w] = await Promise.all([
      fetchDuelById(duel!.id, user.id),
      fetchBetsForDuel(duel!.id),
      fetchWallet(user.id),
    ]);
    setDuel(d);
    setBets(b);
    if (w) setWallet(w);
  };

  const handleClose = async () => {
    if (!duel) return;
    setClosing(true);
    setActionError(null);
    const { error } = await closeDuel(duel.id);
    setClosing(false);
    if (error) { setActionError(error); return; }
    load();
  };

  const handleRequestVerdict = async () => {
    if (!duel) return;
    setResolving(true);
    setActionError(null);
    try {
      const { result, verdict } = await generateVerdict(
        duel.side_a,
        duel.side_b,
        duel.category,
        duel.creator_context ?? "",
      );
      const { error } = await resolveDuel(duel.id, result, verdict, duel);
      if (error) { setActionError(error); setResolving(false); return; }
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao conectar com a IA.");
    }
    setResolving(false);
  };

  const handleClaim = async () => {
    if (!user || !claimableBet) return;
    setClaiming(true);
    const payout = claimableBet.actual_payout!;
    const { error } = await claimPayout(user.id, claimableBet.id, payout);
    setClaiming(false);
    if (!error) {
      setClaimed(true);
      const w = await fetchWallet(user.id);
      if (w) setWallet(w);
      load();
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!duel) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex flex-col items-center justify-center gap-3">
        <p className="text-[var(--text-muted)]">Embate não encontrado.</p>
        <button onClick={() => navigate("/arena")} className="text-sm text-[var(--gold)] underline">
          Voltar
        </button>
      </div>
    );
  }

  const status = STATUS_LABELS[duel.status];
  const resultSideName = duel.result ? SIDE_NAME(duel, duel.result) : null;

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
    >
      {/* Resolving overlay */}
      {resolving && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="spinner" style={{ width: 36, height: 36 }} />
          <p className="text-base font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
            IA analisando o histórico…
          </p>
          <p className="text-sm text-[var(--text-muted)] text-center px-8">
            Pesquisando e gerando o veredito para "{duel.side_a} vs {duel.side_b}"
          </p>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/arena")}
          className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1
            className="text-base font-bold text-[var(--text-primary)] truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {duel.title}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-[rgba(201,165,90,0.08)] text-[var(--gold-dark)] border border-[rgba(201,165,90,0.15)] font-semibold uppercase tracking-wide">
              {duel.category}
            </span>
            <span className={`text-[0.6rem] px-2 py-0.5 rounded-full border font-semibold ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>
        {wallet && (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[rgba(201,165,90,0.08)] border border-[rgba(201,165,90,0.15)] shrink-0">
            <span className="text-xs font-bold text-[var(--gold)]">{balance.toLocaleString("pt-BR")} pts</span>
          </div>
        )}
      </div>

      <div className="px-4 flex flex-col gap-5">
        {/* Odds */}
        <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
          <OddsDisplay
            duel={duel}
            selected={myBet?.side ?? (duel.status === "open" && !myBet ? selectedSide : null)}
            onSelect={duel.status === "open" && !myBet ? setSelectedSide : undefined}
          />

          {/* AI Justification */}
          {duel.odds_justification && (
            <div>
              <button
                onClick={() => setShowJustification((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <span>🤖 Análise da IA</span>
                <span>{showJustification ? "▲" : "▼"}</span>
              </button>
              {showJustification && (
                <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                  {duel.odds_justification}
                </p>
              )}
            </div>
          )}

          {/* Creator context badge */}
          {duel.creator_context && (
            <div className="flex items-start gap-1.5 bg-[rgba(201,165,90,0.05)] border border-[rgba(201,165,90,0.1)] rounded-lg px-3 py-2">
              <span className="text-xs shrink-0">💬</span>
              <p className="text-xs text-[var(--text-muted)] italic leading-relaxed">
                "{duel.creator_context}"
              </p>
            </div>
          )}
        </div>

        {/* CLAIM PAYOUT — destaque máximo */}
        {claimableBet && (
          <div className="bg-gradient-to-r from-[rgba(74,222,128,0.12)] to-[rgba(74,222,128,0.04)] border border-[rgba(74,222,128,0.35)] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏆</span>
              <div>
                <p className="text-sm font-bold text-green-400">Você ganhou!</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Sua aposta em {SIDE_NAME(duel, claimableBet.side)} deu certo.
                </p>
              </div>
            </div>
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-3 rounded-xl font-bold text-sm bg-[rgba(74,222,128,0.15)] text-green-400 border border-[rgba(74,222,128,0.4)] hover:bg-[rgba(74,222,128,0.25)] disabled:opacity-50 transition-all"
            >
              {claiming ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Resgatando…
                </span>
              ) : (
                `🏆 Resgatar ${claimableBet.actual_payout} pts`
              )}
            </button>
          </div>
        )}

        {/* Claimed confirmation */}
        {claimed && (
          <div className="bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)] rounded-xl p-4 text-center">
            <p className="text-sm font-bold text-green-400">✅ Prêmio resgatado!</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Os pts foram adicionados à sua carteira.
            </p>
          </div>
        )}

        {/* My existing bet (open or closed, not resolved) */}
        {myBet && duel.status !== "resolved" && (
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">
              Sua aposta
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {myBet.side === "A" ? "1" : myBet.side === "draw" ? "X" : "2"} · {SIDE_NAME(duel, myBet.side)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {myBet.amount} pts apostados
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--gold)]">{myBet.potential_payout} pts</p>
                <p className="text-[0.65rem] text-[var(--text-muted)]">potencial</p>
              </div>
            </div>

            {duel.status === "open" && (
              <>
                {deleteError && (
                  <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
                    {deleteError}
                  </p>
                )}
                <button
                  onClick={handleDeleteBet}
                  disabled={deletingBet}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold border border-[rgba(196,64,64,0.25)] text-[var(--red)] bg-[rgba(196,64,64,0.06)] hover:bg-[rgba(196,64,64,0.12)] disabled:opacity-50 transition-all"
                >
                  {deletingBet ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner" style={{ width: 12, height: 12 }} /> Cancelando…
                    </span>
                  ) : (
                    `Cancelar aposta · +${myBet.amount} pts de volta`
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Bet form (open, no bet) */}
        {duel.status === "open" && !myBet && (
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-4">
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">
              Fazer Aposta
            </p>

            <p className="text-xs text-[var(--text-muted)] -mt-1">
              Selecione um lado nas odds acima ↑
            </p>

            {selectedSide && (
              <div className="flex items-center gap-2 p-2.5 bg-[rgba(201,165,90,0.06)] border border-[rgba(201,165,90,0.2)] rounded-xl">
                <span className="text-xs font-bold text-[var(--gold)]">
                  {selectedSide === "A" ? "1" : selectedSide === "draw" ? "X" : "2"} ·{" "}
                  {SIDE_NAME(duel, selectedSide)}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-auto">
                  {Number(SIDE_ODDS(duel, selectedSide)).toFixed(2)}x
                </span>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                Valor a apostar
              </label>
              {/* Preset buttons */}
              <div className="flex gap-1.5 mb-2">
                {[10, 50, 100, 200].map((v) => (
                  <button
                    key={v}
                    onClick={() => setBetAmount(String(Math.min(v, balance)))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      amount === v
                        ? "bg-[rgba(201,165,90,0.12)] border-[rgba(201,165,90,0.35)] text-[var(--gold)]"
                        : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.15)]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min={1}
                  max={balance}
                  className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                  pts
                </span>
              </div>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">
                Saldo disponível: {balance.toLocaleString("pt-BR")} pts
              </p>
            </div>

            {/* Payout preview */}
            {selectedSide && amount >= 1 && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(201,165,90,0.05)] border border-[rgba(201,165,90,0.1)] rounded-xl">
                <span className="text-xs text-[var(--text-muted)]">Ganho potencial</span>
                <span className="text-sm font-bold text-[var(--gold)]">
                  {potentialPayout.toLocaleString("pt-BR")} pts
                </span>
              </div>
            )}

            {betError && (
              <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
                {betError}
              </p>
            )}

            <button
              onClick={handlePlaceBet}
              disabled={!canBet || placingBet}
              className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {placingBet ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Apostando…
                </span>
              ) : !selectedSide ? (
                "Selecione um lado para apostar"
              ) : amount > balance ? (
                "Saldo insuficiente"
              ) : (
                `Apostar ${amount} pts`
              )}
            </button>
          </div>
        )}

        {/* Creator actions */}
        {isCreator && (
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">
              Ações do Criador
            </p>

            {duel.status === "open" && (
              <button
                onClick={handleClose}
                disabled={closing}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-[rgba(251,191,36,0.1)] text-amber-400 border border-[rgba(251,191,36,0.25)] hover:bg-[rgba(251,191,36,0.18)] disabled:opacity-50 transition-all"
              >
                {closing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="spinner" style={{ width: 14, height: 14 }} /> Fechando…
                  </span>
                ) : (
                  "🔒 Fechar Apostas"
                )}
              </button>
            )}

            {duel.status === "closed" && (
              <button
                onClick={handleRequestVerdict}
                disabled={resolving}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50 transition-all"
              >
                ⚖️ Pedir Veredito da IA
              </button>
            )}

            {actionError && (
              <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
                {actionError}
              </p>
            )}
          </div>
        )}

        {/* Verdict */}
        {duel.status === "resolved" && duel.verdict && (
          <div className="bg-[var(--bg-card)] border border-[rgba(201,165,90,0.15)] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚖️</span>
              <p className="text-sm font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
                Veredito da IA
              </p>
            </div>

            {resultSideName && (
              <div className="text-center py-3 bg-[rgba(201,165,90,0.08)] border border-[rgba(201,165,90,0.2)] rounded-xl">
                <p className="text-xs text-[var(--text-muted)] mb-1">Resultado</p>
                <p className="text-lg font-black text-[var(--gold)]">{resultSideName}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {duel.result === "A" ? "1" : duel.result === "draw" ? "X" : "2"} venceu
                </p>
              </div>
            )}

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {duel.verdict}
            </p>
          </div>
        )}

        {/* Bets list */}
        <BetsList bets={bets} duel={duel} />

        {/* Creator credit */}
        <div className="flex items-center gap-1.5 justify-center">
          <Avatar
            url={duel.creator_profile?.avatar_url ?? null}
            name={duel.creator_profile?.display_name ?? "?"}
            size="sm"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Criado por {duel.creator_profile?.display_name ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
