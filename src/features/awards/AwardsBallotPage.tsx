import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hapticTap } from "@/lib/haptics";
import { NomineeCard } from "./AwardsCards";
import { ballotCategories, ballotProgress, clampStep, nextUnvoted, nomineeName } from "./awardsLogic";
import { castVote } from "./awardsService";
import type { MyVotes } from "./awardsTypes";
import { useAwardsData } from "./useAwardsData";

const ADVANCE_MS = 450;

/** Cédula: uma categoria por tela, voto salvo na hora (editável) e revisão no fim. Só na fase `voting`. */
export function AwardsBallotPage() {
  const navigate = useNavigate();
  const data = useAwardsData();
  const [step, setStep] = useState(0);
  const [local, setLocal] = useState<MyVotes>({});
  const [error, setError] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const cats = ballotCategories(data.categories, data.byCategory);
  const ids = cats.map((c) => c.id);
  const votes: MyVotes = { ...data.myVotes, ...local };
  const progress = ballotProgress(ids, votes);
  const review = step >= cats.length;
  const cat = cats[step];

  // Sem timers pendentes ao desmontar.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const back = (
    <button onClick={() => navigate("/awards")} aria-label="Voltar" className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
      ‹
    </button>
  );

  if (data.loading) {
    return <div className="p-4 max-w-lg mx-auto">{back}<div className="h-40 rounded-2xl skeleton mt-3" /></div>;
  }

  if (data.edition?.phase !== "voting" || !cats.length) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        {back}
        <p className="text-sm text-[var(--text-muted)] text-center py-12">
          {data.edition?.phase === "voting" ? "Ainda não há categorias com indicados suficientes para votar." : "A votação não está aberta."}
        </p>
      </div>
    );
  }

  const choose = async (categoryId: string, nomineeId: string) => {
    hapticTap();
    setError(null);
    const previous = votes[categoryId];
    setLocal((v) => ({ ...v, [categoryId]: nomineeId }));
    const { error: err } = await castVote(categoryId, nomineeId);
    if (err) {
      setError(err);
      setLocal((v) => {
        const next = { ...v };
        if (previous) next[categoryId] = previous;
        else delete next[categoryId];
        return next;
      });
      return;
    }
    if (autoAdvance && !review) {
      const target = nextUnvoted(ids, { ...votes, [categoryId]: nomineeId }, step);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStep(target === -1 ? cats.length : target), ADVANCE_MS);
    }
  };

  const go = (i: number) => setStep(clampStep(i, cats.length));

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-3">
        {back}
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Cédula · {progress.voted}/{progress.total}
        </p>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
          avançar sozinho
        </label>
      </div>

      <div className="flex gap-1.5 justify-center mb-4" role="tablist" aria-label="Categorias">
        {cats.map((c, i) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={i === step}
            aria-label={`Categoria ${i + 1}: ${c.title}${votes[c.id] ? " (votada)" : ""}`}
            onClick={() => go(i)}
            className={`h-2 rounded-full transition-all ${i === step ? "w-6" : "w-2"} ${
              votes[c.id] ? "bg-[var(--gold)]" : "bg-[rgba(255,255,255,0.2)]"
            }`}
          />
        ))}
        <button
          role="tab"
          aria-selected={review}
          aria-label="Revisar cédula"
          onClick={() => go(cats.length)}
          className={`h-2 rounded-full ${review ? "w-6" : "w-2"} bg-[rgba(255,255,255,0.35)]`}
        />
      </div>

      {error && <p role="alert" className="text-sm text-red-400 mb-3">{error}</p>}

      {!review && cat ? (
        <>
          <h1 className="text-xl font-bold text-[var(--gold)] text-center" style={{ fontFamily: "var(--font-display)" }}>
            {cat.title}
          </h1>
          {cat.description && <p className="text-xs text-[var(--text-muted)] text-center mt-1">{cat.description}</p>}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {(data.byCategory[cat.id] ?? []).map((n) => (
              <NomineeCard key={n.id} nominee={n} large selected={votes[cat.id] === n.id} onClick={() => void choose(cat.id, n.id)} />
            ))}
          </div>
        </>
      ) : (
        <section aria-label="Revisão">
          <h1 className="text-xl font-bold text-[var(--gold)] text-center mb-1" style={{ fontFamily: "var(--font-display)" }}>
            {progress.complete ? "Cédula completa 🎉" : "Revisar cédula"}
          </h1>
          {!progress.complete && (
            <p className="text-xs text-[var(--text-muted)] text-center mb-3">
              Faltam {progress.missing.length} categoria{progress.missing.length !== 1 ? "s" : ""} sem voto.
            </p>
          )}
          <ul className="flex flex-col gap-2 mt-3">
            {cats.map((c, i) => {
              const picked = (data.byCategory[c.id] ?? []).find((n) => n.id === votes[c.id]);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => go(i)}
                    className="w-full flex items-center gap-3 text-left bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-3"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-[var(--text-muted)] truncate">{c.title}</span>
                      <span className={`block text-sm font-semibold truncate ${picked ? "text-[var(--text-primary)]" : "text-red-400"}`}>
                        {picked ? nomineeName(picked) : "Sem voto"}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--gold)]">Trocar</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button onClick={() => navigate("/awards")} className="w-full mt-5 py-3 rounded-xl font-semibold text-black bg-[var(--gold)]">
            Concluir
          </button>
        </section>
      )}

      {!review && (
        <div className="fixed bottom-0 left-0 right-0 z-10 max-w-lg mx-auto p-4 pb-[calc(1rem+var(--safe-bottom))] flex gap-3 glass-panel">
          <button onClick={() => go(step - 1)} disabled={step === 0} className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.12)] text-[var(--text-primary)] disabled:opacity-40">
            Anterior
          </button>
          <button onClick={() => go(step + 1)} className="flex-1 py-3 rounded-xl font-semibold text-black bg-[var(--gold)]">
            {step === cats.length - 1 ? "Revisar" : "Próxima"}
          </button>
        </div>
      )}
    </div>
  );
}
