import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchAllPools,
  createPool,
  joinPool,
  type BolaoPool,
  type ChampionshipCode,
} from "./bolaoService";

// ─── Pool Card ────────────────────────────────────────────────

function PoolCard({
  pool,
  onJoin,
  onView,
}: {
  pool: BolaoPool;
  onJoin?: () => void;
  onView?: () => void;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[rgba(201,165,90,0.1)] flex items-center justify-center text-xl shrink-0">
          ⚽
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--text-primary)] truncate text-sm">
            {pool.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {pool.championship.name}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {pool.member_count} participante{pool.member_count !== 1 ? "s" : ""}
        </span>

        {pool.is_member ? (
          <button
            onClick={onView}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.2)] hover:bg-[rgba(201,165,90,0.2)] transition-colors"
          >
            Ver palpites
          </button>
        ) : (
          <button
            onClick={onJoin}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[rgba(201,165,90,0.08)] text-[var(--text-primary)] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(201,165,90,0.15)] transition-colors"
          >
            Entrar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Create Pool Modal ────────────────────────────────────────

function CreatePoolModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (poolId: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [selectedCode, setSelectedCode] = useState<ChampionshipCode>("BSA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const championships = [
    { code: "BSA" as ChampionshipCode, label: "🇧🇷 Brasileirão Série A 2026" },
    { code: "WC" as ChampionshipCode, label: "🌍 Copa do Mundo 2026" },
  ];

  const handleCreate = async () => {
    if (!user || !name.trim()) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await createPool(
      user.id,
      name.trim(),
      selectedCode,
    );
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (data) onCreated(data);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Criar Bolão
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
              Nome do bolão
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Bolão dos Amigos"
              maxLength={50}
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
              Campeonato
            </label>
            <div className="flex flex-col gap-2">
              {championships.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setSelectedCode(c.code)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                    selectedCode === c.code
                      ? "bg-[rgba(201,165,90,0.12)] border-[rgba(201,165,90,0.35)] text-[var(--gold)]"
                      : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-primary)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Buscando partidas…
              </span>
            ) : (
              "Criar bolão"
            )}
          </button>

          {loading && (
            <p className="text-xs text-[var(--text-muted)] text-center">
              Sincronizando todas as partidas do campeonato…
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── BolaoPage ────────────────────────────────────────────────

export function BolaoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pools, setPools] = useState<BolaoPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchAllPools(user.id);
    setPools(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (poolId: string) => {
    if (!user) return;
    setJoiningId(poolId);
    await joinPool(user.id, poolId);
    setJoiningId(null);
    load();
  };

  const myPools = pools.filter((p) => p.is_member);
  const otherPools = pools.filter((p) => !p.is_member);

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bolão ⚽
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Palpites e pontuação em tempo real
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
        >
          + Criar bolão
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center pt-16">
          <div className="spinner" />
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-6">
          {/* Meus bolões */}
          <section>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Meus bolões
            </p>
            {myPools.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-8 text-center">
                <p className="text-2xl mb-2">⚽</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Você ainda não está em nenhum bolão
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-3 text-xs text-[var(--gold)] underline underline-offset-2"
                >
                  Criar o primeiro
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {myPools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    onView={() => navigate(`/bolao/${pool.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Outros bolões */}
          {otherPools.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                Disponíveis para entrar
              </p>
              <div className="flex flex-col gap-3">
                {otherPools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    onJoin={() => handleJoin(pool.id)}
                    onView={() => navigate(`/bolao/${pool.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Regras de pontuação */}
      <div className="mx-4 mt-6 bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
        <p
          className="text-xs font-semibold text-[var(--gold)] mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pontuação
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            ["🎯", "15 pts", "Placar exato"],
            ["✅", "10 pts", "Gols do vencedor ou empate (gols diferentes)"],
            ["🔸", "5 pts", "Gols do perdedor"],
            ["📌", "3 pts", "Vencedor certo, sem gols"],
            ["❌", "0 pts", "Erro total"],
          ].map(([icon, pts, desc]) => (
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

      {showCreate && (
        <CreatePoolModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/bolao/${id}`);
          }}
        />
      )}

      {joiningId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
