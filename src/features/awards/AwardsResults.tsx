import { nomineeName, rankCategory, sortCategories } from "./awardsLogic";
import type { AwardsCategory, AwardsNominee, AwardsResults as Results } from "./awardsTypes";

/** Resultado por categoria: vencedor em destaque + ranking. Só na fase `closed`. */
export function AwardsResultsView({
  categories,
  byCategory,
  results,
}: {
  categories: AwardsCategory[];
  byCategory: Record<string, AwardsNominee[]>;
  results: Results;
}) {
  const list = sortCategories(categories).filter((c) => (byCategory[c.id]?.length ?? 0) > 0);
  if (!list.length) return <p className="text-sm text-[var(--text-muted)] text-center py-8">Nada para mostrar.</p>;
  return (
    <div className="flex flex-col gap-4">
      {list.map((c) => {
        const ranked = rankCategory(byCategory[c.id], results, c.id);
        const winners = ranked.filter((r) => r.isWinner);
        return (
          <section key={c.id} className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">{c.title}</h3>
            {winners.length > 0 && (
              <div className="rounded-xl p-3 mb-3 bg-[rgba(201,165,90,0.12)] border border-[rgba(201,165,90,0.35)]">
                <p className="text-[11px] uppercase tracking-wide text-[var(--gold)] mb-1">
                  {winners.length > 1 ? "🏆 Empate" : "🏆 Vencedor"}
                </p>
                <div className="flex gap-3 flex-wrap">
                  {winners.map((w) => (
                    <div key={w.nominee.id} className="flex items-center gap-2">
                      {w.nominee.imageUrl && (
                        <img src={w.nominee.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      )}
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{nomineeName(w.nominee)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ol className="flex flex-col gap-1.5">
              {ranked.map((r, i) => (
                <li key={r.nominee.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-[var(--text-muted)]">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-[var(--text-primary)]">{nomineeName(r.nominee)}</span>
                  <span className="text-[var(--text-muted)]">
                    {r.votes} voto{r.votes !== 1 ? "s" : ""} · {r.pct}%
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
