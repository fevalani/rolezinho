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

const OPTION_LABEL: Record<BetSide, string> = { A: "A", B: "B", C: "C" };

// ─── Duel Card ────────────────────────────────────────────────

function DuelCard({ duel, onClick }: { duel: ArenaDuel; onClick: () => void }) {
  const status = STATUS_LABELS[duel.status];
  const myBet = duel.my_bet;

  const resultOptionText = duel.result
    ? duel.result === "A"
      ? duel.option_a
      : duel.result === "B"
        ? duel.option_b
        : duel.option_c
    : null;

  const sides: { side: BetSide; text: string; odds: number }[] = [
    { side: "A", text: duel.option_a, odds: duel.odds_a },
    { side: "B", text: duel.option_b, odds: duel.odds_b },
    { side: "C", text: duel.option_c, odds: duel.odds_c },
  ];

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

      {/* Scenario */}
      <p className="text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-2">
        {duel.scenario}
      </p>

      {/* Options + Odds */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {sides.map(({ side, text, odds }) => {
          const isMyBet = myBet?.side === side;
          const isResult = duel.result === side;
          return (
            <div
              key={side}
              className={`rounded-lg py-1.5 px-1 border transition-all ${
                isResult
                  ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)]"
                  : isMyBet
                    ? "bg-[rgba(74,222,128,0.08)] border-[rgba(74,222,128,0.3)]"
                    : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.06)]"
              }`}
            >
              <p className="text-[0.6rem] text-[var(--text-muted)] font-semibold">{OPTION_LABEL[side]}</p>
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
              <p className="text-[0.55rem] text-[var(--text-muted)] leading-tight truncate px-0.5">
                {text}
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
            Sua aposta: {OPTION_LABEL[myBet.side]} · {myBet.amount} pts
          </span>
        )}
        {duel.status === "resolved" && resultOptionText && (
          <span className="text-xs text-[var(--gold)] font-bold truncate max-w-[55%]">🏆 {resultOptionText}</span>
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
  const [scenario, setScenario] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [context, setContext] = useState("");

  // Odds (sempre editáveis)
  const [oddsA, setOddsA] = useState("");
  const [oddsB, setOddsB] = useState("");
  const [oddsC, setOddsC] = useState("");
  const [oddsJustification, setOddsJustification] = useState("");
  const [generatingOdds, setGeneratingOdds] = useState(false);
  const [oddsError, setOddsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalCategory = isCustom ? customCategory.trim() : category;
  const canGenerateOdds = scenario.trim() && optionA.trim() && optionB.trim() && optionC.trim();
  const canSubmit =
    canGenerateOdds &&
    finalCategory &&
    parseFloat(oddsA) >= 1.01 &&
    parseFloat(oddsB) >= 1.01 &&
    parseFloat(oddsC) >= 1.01;

  const handleGenerateOdds = async () => {
    if (!canGenerateOdds) return;
    setGeneratingOdds(true);
    setOddsError(null);
    try {
      const result = await generateOdds(
        scenario.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        context.trim(),
      );
      setOddsA(String(result.odds_a));
      setOddsB(String(result.odds_b));
      setOddsC(String(result.odds_c));
      setOddsJustification(result.justification);
    } catch (err) {
      setOddsError(err instanceof Error ? err.message : "Erro ao gerar odds com a IA.");
    }
    setGeneratingOdds(false);
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const odds = {
      odds_a: parseFloat(oddsA),
      odds_b: parseFloat(oddsB),
      odds_c: parseFloat(oddsC),
      justification: oddsJustification,
    };

    const { data, error: err } = await createDuel(
      user.id,
      scenario.trim(),
      optionA.trim(),
      optionB.trim(),
      optionC.trim(),
      finalCategory,
      context.trim(),
      odds,
    );

    setSubmitting(false);

    if (err || !data) {
      setError(err ?? "Erro ao criar caso");
      return;
    }
    onCreated(data);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={!submitting && !generatingOdds ? onClose : undefined}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-5 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto max-h-[92dvh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold text-[var(--gold)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Criar Caso 🍺
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Cenário */}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              O caso / situação
            </label>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Ex: Quem vai ganhar o Oscar de Melhor Filme em 2026?"
              maxLength={200}
              rows={2}
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] resize-none"
            />
          </div>

          {/* 3 opções */}
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-[var(--text-muted)] font-medium">
              Possíveis ocorrências
            </label>
            {(
              [
                { label: "A", value: optionA, set: setOptionA, placeholder: "Ex: Emilia Pérez" },
                { label: "B", value: optionB, set: setOptionB, placeholder: "Ex: The Brutalist" },
                { label: "C", value: optionC, set: setOptionC, placeholder: "Ex: Anora" },
              ] as const
            ).map(({ label, value, set, placeholder }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[rgba(201,165,90,0.1)] text-[var(--gold)] text-xs font-bold shrink-0 border border-[rgba(201,165,90,0.2)]">
                  {label}
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  maxLength={80}
                  className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                />
              </div>
            ))}
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
                placeholder="Ex: Política, Tecnologia…"
                maxLength={40}
                autoFocus
                className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.4)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            )}
          </div>

          {/* Contexto opcional */}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Contexto adicional{" "}
              <span className="font-normal">(opcional)</span>
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ex: considere apenas filmes de língua inglesa, sem contar sequências…"
              maxLength={300}
              rows={2}
              className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] resize-none"
            />
          </div>

          {/* Odds */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text-muted)] font-medium">
                Odds (decimal europeu)
              </label>
              <button
                onClick={handleGenerateOdds}
                disabled={!canGenerateOdds || generatingOdds}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.08)] text-[var(--gold)] border border-[rgba(201,165,90,0.2)] hover:bg-[rgba(201,165,90,0.15)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {generatingOdds ? (
                  <>
                    <span className="spinner" style={{ width: 10, height: 10 }} />
                    Gerando…
                  </>
                ) : (
                  "🤖 Sugerir com IA"
                )}
              </button>
            </div>

            {oddsError && (
              <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
                {oddsError}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { label: "A", value: oddsA, set: setOddsA },
                  { label: "B", value: oddsB, set: setOddsB },
                  { label: "C", value: oddsC, set: setOddsC },
                ] as const
              ).map(({ label, value, set }) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[0.65rem] text-[var(--text-muted)] font-semibold text-center">
                    {label}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="1.80"
                    step="0.01"
                    min="1.01"
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-2 py-2.5 text-sm text-center text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                </div>
              ))}
            </div>

            {oddsJustification && (
              <p className="text-[0.65rem] text-[var(--text-muted)] italic leading-relaxed px-1">
                🤖 {oddsJustification}
              </p>
            )}

            <p className="text-[0.65rem] text-[var(--text-muted)] px-1">
              Menor odd = mais provável. Você pode editar livremente.
            </p>
          </div>

          {error && (
            <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" style={{ width: 14, height: 14 }} /> Publicando…
              </span>
            ) : (
              "Publicar Caso 🍺"
            )}
          </button>
        </div>
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
            Apostas hipotéticas com veredito do criador
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
            + Criar Caso
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
                <p className="text-2xl mb-2">🍺</p>
                <p className="text-sm text-[var(--text-muted)]">Nenhum caso em aberto</p>
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
