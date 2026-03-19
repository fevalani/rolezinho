import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchDuels,
  ensureWallet,
  createDuel,
  generateOdds,
  type ArenaDuel,
  type ArenaWallet,
  type BetSide,
} from "./arenaService";

// ─── Constantes ───────────────────────────────────────────────

const FIXED_CATEGORIES = [
  { emoji: "⚽", label: "Futebol" },
  { emoji: "🎵", label: "Música" },
  { emoji: "🎬", label: "Cinema" },
  { emoji: "🍕", label: "Comida" },
  { emoji: "🏀", label: "Esportes" },
  { emoji: "🎮", label: "Games" },
  { emoji: "📚", label: "Literatura" },
  { emoji: "🌍", label: "História" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "text-green-400 bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.25)]" },
  closed: { label: "Fechado", color: "text-amber-400 bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.25)]" },
  resolved: { label: "Resolvido", color: "text-[var(--gold)] bg-[rgba(201,165,90,0.1)] border-[rgba(201,165,90,0.25)]" },
};

const SIDE_LABELS: Record<BetSide, string> = { A: "Lado A", draw: "Empate", B: "Lado B" };

// ─── Duel Card ────────────────────────────────────────────────

function DuelCard({ duel, onClick }: { duel: ArenaDuel; onClick: () => void }) {
  const status = STATUS_LABELS[duel.status];
  const myBet = duel.my_bet;

  const resultSide = duel.result
    ? duel.result === "A"
      ? duel.side_a
      : duel.result === "B"
        ? duel.side_b
        : "Empate"
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex flex-col gap-3 hover:border-[rgba(201,165,90,0.15)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-all active:translate-y-0"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full bg-[rgba(201,165,90,0.08)] text-[var(--gold-dark)] border border-[rgba(201,165,90,0.15)] uppercase tracking-wide shrink-0">
          {duel.category}
        </span>
        <span className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Versus */}
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-bold text-[var(--text-primary)] text-right leading-tight truncate">
          {duel.side_a}
        </span>
        <span className="text-[var(--text-muted)] text-xs font-bold shrink-0">⚔️</span>
        <span className="flex-1 text-sm font-bold text-[var(--text-primary)] text-left leading-tight truncate">
          {duel.side_b}
        </span>
      </div>

      {/* Odds mini */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {(["A", "draw", "B"] as BetSide[]).map((s) => {
          const odds = s === "A" ? duel.odds_a : s === "draw" ? duel.odds_draw : duel.odds_b;
          const label = s === "A" ? "1" : s === "draw" ? "X" : "2";
          const isMyBet = myBet?.side === s;
          const isResult = duel.result === s;
          return (
            <div
              key={s}
              className={`rounded-lg py-1.5 px-1 border transition-all ${
                isResult
                  ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)]"
                  : isMyBet
                    ? "bg-[rgba(74,222,128,0.08)] border-[rgba(74,222,128,0.3)]"
                    : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.06)]"
              }`}
            >
              <p className="text-[0.6rem] text-[var(--text-muted)] font-semibold">{label}</p>
              <p
                className={`text-sm font-bold ${
                  isResult
                    ? "text-[var(--gold)]"
                    : isMyBet
                      ? "text-green-400"
                      : "text-[var(--text-primary)]"
                }`}
              >
                {Number(odds).toFixed(2)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {duel.bet_count ?? 0} aposta{(duel.bet_count ?? 0) !== 1 ? "s" : ""}
        </span>
        {myBet && duel.status !== "resolved" && (
          <span className="text-xs text-green-400 font-semibold">
            Sua aposta: {SIDE_LABELS[myBet.side]} · {myBet.amount} pts
          </span>
        )}
        {duel.status === "resolved" && resultSide && (
          <span className="text-xs text-[var(--gold)] font-bold">🏆 {resultSide}</span>
        )}
      </div>
    </button>
  );
}

// ─── Create Modal ─────────────────────────────────────────────

function CreateDuelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [context, setContext] = useState("");
  const [step, setStep] = useState<"form" | "generating">("form");
  const [error, setError] = useState<string | null>(null);

  const finalCategory = isCustom ? customCategory.trim() : category;
  const canSubmit = sideA.trim() && sideB.trim() && finalCategory;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setStep("generating");
    setError(null);

    try {
      const odds = await generateOdds(sideA.trim(), sideB.trim(), finalCategory, context.trim());
      const { data, error: err } = await createDuel(
        user.id,
        sideA.trim(),
        sideB.trim(),
        finalCategory,
        context.trim(),
        odds,
      );
      if (err || !data) {
        setError(err ?? "Erro ao criar embate");
        setStep("form");
        return;
      }
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar com a IA. Verifique a chave VITE_GEMINI_KEY.");
      setStep("form");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={step === "form" ? onClose : undefined}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[92dvh] overflow-y-auto">

        {step === "generating" ? (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p className="text-sm font-semibold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
              IA calculando as odds…
            </p>
            <p className="text-xs text-[var(--text-muted)] text-center">
              Analisando o histórico de "{sideA.trim()}" vs "{sideB.trim()}"
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-lg font-bold text-[var(--gold)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Criar Embate ⚔️
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Versus inputs */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                    Lado A
                  </label>
                  <input
                    type="text"
                    value={sideA}
                    onChange={(e) => setSideA(e.target.value)}
                    placeholder="Ex: Pelé"
                    maxLength={60}
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                </div>
                <span className="text-[var(--text-muted)] font-bold mt-5 shrink-0">⚔️</span>
                <div className="flex-1">
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                    Lado B
                  </label>
                  <input
                    type="text"
                    value={sideB}
                    onChange={(e) => setSideB(e.target.value)}
                    placeholder="Ex: Mbappe"
                    maxLength={60}
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                  Categoria
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {FIXED_CATEGORIES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => { setCategory(c.label); setIsCustom(false); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        !isCustom && category === c.label
                          ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)] text-[var(--gold)]"
                          : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.15)]"
                      }`}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                  <button
                    onClick={() => { setIsCustom(true); setCategory(""); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isCustom
                        ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)] text-[var(--gold)]"
                        : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.15)]"
                    }`}
                  >
                    ✏️ Outra
                  </button>
                </div>
                {isCustom && (
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Ex: Culinária italiana, Anos 90…"
                    maxLength={40}
                    autoFocus
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.4)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                )}
              </div>

              {/* Contexto para IA */}
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                  Contexto para a IA{" "}
                  <span className="text-[var(--text-muted)] font-normal">(opcional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Ex: quero focar nos anos 90, somente em termos de gols marcados, considerar o prime de cada um…"
                  maxLength={300}
                  rows={3}
                  className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] resize-none"
                />
                <p className="text-[0.65rem] text-[var(--text-muted)] mt-1">
                  Guia a IA para gerar odds e veredito alinhados com sua intenção.
                </p>
              </div>

              {error && (
                <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Criar Embate ⚔️
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── ArenaPage ────────────────────────────────────────────────

export function ArenaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [duels, setDuels] = useState<ArenaDuel[]>([]);
  const [wallet, setWallet] = useState<ArenaWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [w, d] = await Promise.all([
      ensureWallet(user.id),
      fetchDuels(user.id),
    ]);
    setWallet(w);
    setDuels(d);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openDuels = duels.filter((d) => d.status === "open");
  const closedDuels = duels.filter((d) => d.status === "closed");
  const resolvedDuels = duels.filter((d) => d.status === "resolved");

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-start justify-between">
        <div>
          <h1
            className="text-xl font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Briga de Bar 🍺
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Apostas hipotéticas com veredito da IA
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {wallet && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[rgba(201,165,90,0.08)] border border-[rgba(201,165,90,0.15)]">
              <span className="text-xs font-bold text-[var(--gold)]">
                {wallet.balance.toLocaleString("pt-BR")} pts
              </span>
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.2)] transition-all"
          >
            + Criar Embate
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center pt-16">
          <div className="spinner" />
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-6">
          {/* Em aberto */}
          <section>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Em aberto
            </p>
            {openDuels.length === 0 ? (
              <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-8 text-center">
                <p className="text-2xl mb-2">⚔️</p>
                <p className="text-sm text-[var(--text-muted)]">Nenhum embate em aberto</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-3 text-xs text-[var(--gold)] underline underline-offset-2"
                >
                  Criar o primeiro
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {openDuels.map((d) => (
                  <DuelCard
                    key={d.id}
                    duel={d}
                    onClick={() => navigate(`/arena/${d.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Aguardando veredito */}
          {closedDuels.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                Aguardando veredito
              </p>
              <div className="flex flex-col gap-3">
                {closedDuels.map((d) => (
                  <DuelCard
                    key={d.id}
                    duel={d}
                    onClick={() => navigate(`/arena/${d.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Resolvidos */}
          {resolvedDuels.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                Resolvidos
              </p>
              <div className="flex flex-col gap-3">
                {resolvedDuels.map((d) => (
                  <DuelCard
                    key={d.id}
                    duel={d}
                    onClick={() => navigate(`/arena/${d.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showCreate && (
        <CreateDuelModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/arena/${id}`);
          }}
        />
      )}
    </div>
  );
}
