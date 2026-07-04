import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useBetaMode } from "@/lib/useBetaMode";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { fetchAllTables, createTable } from "./rankingService";
import { DEFAULT_TABLE_ICON, RANKING_ICONS, type RankingTableSummary } from "./rankingTypes";

// ─── Table Card ─────────────────────────────────────────────

function TableCard({
  summary,
  onView,
}: {
  summary: RankingTableSummary;
  onView: () => void;
}) {
  return (
    <button
      onClick={onView}
      className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3 text-left w-full hover:border-[rgba(201,165,90,0.2)] transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[rgba(201,165,90,0.1)] flex items-center justify-center text-xl shrink-0">
          {summary.table.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--text-primary)] truncate text-sm">
            {summary.table.title}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {summary.entryCount} pessoa{summary.entryCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {summary.leaderName && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">🥇 {summary.leaderName}</span>
          <span className="font-semibold text-[var(--gold)]">
            {summary.leaderPoints} pts
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Skeleton (modo beta) ────────────────────────────────────

function TableCardSkeleton() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2 justify-center">
          <div className="h-3.5 w-2/3 rounded-md skeleton" />
          <div className="h-2.5 w-1/3 rounded-md skeleton" />
        </div>
      </div>
      <div className="h-2.5 w-1/2 rounded-md skeleton" />
    </div>
  );
}

// ─── Create Table Modal ─────────────────────────────────────

function CreateTableModal({
  isBeta,
  onClose,
  onCreated,
}: {
  isBeta: boolean;
  onClose: () => void;
  onCreated: (tableId: string) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(DEFAULT_TABLE_ICON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await createTable(user.id, title.trim(), icon);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (data) {
      if (isBeta) hapticSuccess();
      onCreated(data);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto ${
          isBeta ? "glass-panel" : "bg-[var(--bg-deep)]"
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Nova tabela
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Título da tabela
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Tênis"
              maxLength={50}
              autoFocus
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
              Emoji
            </label>
            <div className="flex flex-wrap gap-2">
              {RANKING_ICONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setIcon(e)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all ${
                    icon === e
                      ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)]"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Cria com as categorias padrão Vitória (3), Empate (1) e Derrota (0)
            — você pode editar tudo depois.
          </p>

          {error && (
            <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !title.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Criando…
              </span>
            ) : (
              "Criar tabela"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── RankingPage ────────────────────────────────────────────

export function RankingPage() {
  const navigate = useNavigate();
  const isBeta = useBetaMode();
  const [tables, setTables] = useState<RankingTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllTables();
    setTables(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { pullDistance, pulling, pullRefreshing, PULL_THRESHOLD } =
    usePullToRefresh(load, isBeta);

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      {/* Indicador de pull-to-refresh (modo beta) */}
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

      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ranking de Campeões 🏆
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Tabelas de classificação com pontuação personalizada
          </p>
        </div>
        <button
          onClick={() => {
            if (isBeta) hapticTap();
            setShowCreate(true);
          }}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
        >
          + Nova tabela
        </button>
      </div>

      {loading ? (
        isBeta ? (
          <div className="px-4 flex flex-col gap-3">
            <TableCardSkeleton />
            <TableCardSkeleton />
            <TableCardSkeleton />
          </div>
        ) : (
          <div className="flex items-center justify-center pt-16">
            <div className="spinner" />
          </div>
        )
      ) : tables.length === 0 ? (
        <div className="px-4">
          <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-8 text-center">
            <p className="text-2xl mb-2">🏆</p>
            <p className="text-sm text-[var(--text-muted)]">
              Nenhuma tabela criada ainda
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs text-[var(--gold)] underline underline-offset-2"
            >
              Criar a primeira
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {tables.map((summary) => (
            <TableCard
              key={summary.table.id}
              summary={summary}
              onView={() => {
                if (isBeta) hapticTap();
                navigate(`/ranking/${summary.table.id}`);
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTableModal
          isBeta={isBeta}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/ranking/${id}`);
          }}
        />
      )}
    </div>
  );
}
