import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useBetaMode } from "@/lib/useBetaMode";
import { Avatar } from "@/components/Avatar";
import { hapticTap } from "@/lib/haptics";
import {
  fetchRankingDetail,
  submitWinner,
  undoComparison,
  resetComparisons,
  deleteRanking,
} from "./duelosService";
import type { DuelRankingDetail } from "./duelosTypes";
import { aggregateRanking, maxComparisons, nextPair } from "./pairwiseEngine";

const MEDALS = ["🥇", "🥈", "🥉"];

function ResultList({
  rows,
}: {
  rows: { id: string; name: string; hint?: string }[];
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl divide-y divide-[rgba(255,255,255,0.05)]">
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
          Ninguém concluiu ainda
        </p>
      )}
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
          <span className="w-7 text-center text-sm text-[var(--text-muted)]">
            {MEDALS[i] ?? i + 1}
          </span>
          <span className="flex-1 text-sm text-[var(--text-primary)]">
            {r.name}
          </span>
          {r.hint && (
            <span className="text-xs text-[var(--text-muted)]">{r.hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DuelosPlayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBeta = useBetaMode();
  const [detail, setDetail] = useState<DuelRankingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"final" | "people">("final");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setDetail(await fetchRankingDetail(id));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchRankingDetail(id).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [id]);

  const derived = useMemo(() => {
    if (!detail || !user) return null;
    const ids = detail.items.map((i) => i.id);
    const names = new Map(detail.items.map((i) => [i.id, i.name]));
    const myComps =
      detail.participants.find((p) => p.userId === user.id)?.comparisons ?? [];
    const pair = nextPair(
      ids,
      myComps.map((c) => ({ winner: c.winner_id, loser: c.loser_id })),
    );
    const finishedOrders = detail.participants
      .filter((p) => p.finished)
      .map((p) => p.order);
    return {
      pair,
      myComps,
      names,
      estimate: maxComparisons(ids.length),
      aggregate: aggregateRanking(ids, finishedOrders, names),
      finishedCount: finishedOrders.length,
    };
  }, [detail, user]);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    await load();
    setBusy(false);
  };

  const choose = (winner: string, loser: string) => {
    if (!detail || !user || busy) return;
    if (isBeta) hapticTap();
    run(() => submitWinner(detail.ranking.id, user!.id, winner, loser));
  };

  const undo = () => {
    const last = derived?.myComps[derived.myComps.length - 1];
    if (!last || busy) return;
    run(() => undoComparison(last.id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!detail || !derived || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-[var(--text-muted)]">Duelo não encontrado</p>
        <button
          onClick={() => navigate("/duelos")}
          className="text-xs text-[var(--gold)] underline underline-offset-2"
        >
          Voltar
        </button>
      </div>
    );
  }

  const { pair, myComps, names, estimate, aggregate, finishedCount } = derived;
  const done = myComps.length;
  const isOwner = detail.ranking.owner_id === user.id;
  const selected =
    detail.participants.find((p) => p.userId === selectedUser) ?? null;
  const pct = pair
    ? Math.min(95, Math.round((done / Math.max(estimate, 1)) * 100))
    : 100;

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/duelos")}
          className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1
            className="text-xl font-bold text-[var(--gold)] truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {detail.ranking.icon} {detail.ranking.title}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {done} duelo{done !== 1 ? "s" : ""} seus · {detail.items.length}{" "}
            itens
          </p>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div
            className="h-full bg-[var(--gold)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="mx-4 mb-3 text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {pair ? (
        <div className="px-4 flex flex-col gap-3">
          <p className="text-center text-xs text-[var(--text-muted)] mb-1">
            Qual você prefere?
          </p>
          <button
            disabled={busy}
            onClick={() => choose(pair[0], pair[1])}
            className="bg-[var(--bg-card)] border border-[rgba(201,165,90,0.2)] rounded-2xl py-10 px-4 text-lg font-semibold text-[var(--text-primary)] hover:bg-[rgba(201,165,90,0.1)] active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {names.get(pair[0])}
          </button>
          <p className="text-center text-xs text-[var(--text-muted)]">×</p>
          <button
            disabled={busy}
            onClick={() => choose(pair[1], pair[0])}
            className="bg-[var(--bg-card)] border border-[rgba(201,165,90,0.2)] rounded-2xl py-10 px-4 text-lg font-semibold text-[var(--text-primary)] hover:bg-[rgba(201,165,90,0.1)] active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {names.get(pair[1])}
          </button>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          <div className="flex gap-2">
            {(["final", "people"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  tab === t
                    ? "bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border-[rgba(201,165,90,0.3)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[rgba(255,255,255,0.07)]"
                }`}
              >
                {t === "final" ? "Ranking final" : "Por pessoa"}
              </button>
            ))}
          </div>

          {tab === "final" ? (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                {finishedCount} de {detail.participants.length} participante
                {detail.participants.length !== 1 ? "s" : ""} concluíram
              </p>
              <ResultList
                rows={aggregate.map((a) => ({
                  id: a.id,
                  name: names.get(a.id) ?? "?",
                  hint: `${Math.round(a.score * 100)}%`,
                }))}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {detail.participants.map((p) => (
                  <button
                    key={p.userId}
                    onClick={() => setSelectedUser(p.userId)}
                    className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs border transition-all ${
                      selectedUser === p.userId
                        ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)] text-[var(--gold)]"
                        : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-primary)]"
                    }`}
                  >
                    <Avatar url={p.avatarUrl} name={p.name} size="xs" />
                    {p.name}
                    {!p.finished && " …"}
                  </button>
                ))}
              </div>
              {!selected ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Escolha uma pessoa para ver o ranking dela.
                </p>
              ) : selected.finished ? (
                <ResultList
                  rows={selected.order.map((id) => ({
                    id,
                    name: names.get(id) ?? "?",
                  }))}
                />
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  {selected.name} ainda está duelando.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="px-4 mt-6 flex gap-2">
        <button
          onClick={undo}
          disabled={busy || done === 0}
          className="flex-1 py-3 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[rgba(255,255,255,0.08)] disabled:opacity-40"
        >
          ↶ Desfazer
        </button>
        {done > 0 && (
          <button
            onClick={() => {
              if (window.confirm("Refazer todos os duelos?"))
                run(() => resetComparisons(detail.ranking.id, user.id));
            }}
            disabled={busy}
            className="flex-1 py-3 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[rgba(255,255,255,0.08)] disabled:opacity-40"
          >
            Refazer
          </button>
        )}
        {isOwner && (
          <button
            onClick={async () => {
              if (!window.confirm("Apagar este duelo para todos?")) return;
              setBusy(true);
              const err = await deleteRanking(detail.ranking.id);
              if (err) {
                setError(err);
                setBusy(false);
              } else navigate("/duelos");
            }}
            disabled={busy}
            className="py-3 px-4 rounded-xl text-xs font-semibold text-[var(--red)] border border-[rgba(196,64,64,0.25)] disabled:opacity-40"
          >
            Apagar
          </button>
        )}
      </div>
    </div>
  );
}
