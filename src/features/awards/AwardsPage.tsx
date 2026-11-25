import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useAdmin } from "@/lib/useAdmin";
import { AddCard, CategoryCard } from "./AwardsCards";
import { AwardsResultsView } from "./AwardsResults";
import { NominationSheet, type SheetValues } from "./NominationSheet";
import { ballotCategories, ballotProgress, canNominate, categoryQuota, PHASE_LABEL, sortCategories } from "./awardsLogic";
import { createCategory } from "./awardsService";
import { MAX_CATEGORIES_PER_USER } from "./awardsTypes";
import { useAwardsData } from "./useAwardsData";

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="aspect-[4/5] rounded-2xl skeleton" />
      ))}
    </div>
  );
}

/** Entrada do Awards: grade de categorias (indicação), botão de votar (cédula) ou resultado, conforme a fase. */
export function AwardsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const data = useAwardsData();
  const { edition, categories, byCategory } = data;
  const [sheet, setSheet] = useState(false);

  const header = (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={() => navigate("/")} aria-label="Voltar" className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        ‹
      </button>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-[var(--gold)] truncate" style={{ fontFamily: "var(--font-display)" }}>
          {edition?.title ?? "Awards"}
        </h1>
        {edition?.subtitle && <p className="text-xs text-[var(--text-muted)]">{edition.subtitle}</p>}
      </div>
      {edition && (
        <span className="ml-auto shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-[rgba(201,165,90,0.12)] text-[var(--gold)]">
          {PHASE_LABEL[edition.phase]}
        </span>
      )}
    </div>
  );

  if (data.loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        {header}
        <Skeleton />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        {header}
        <p className="text-sm text-[var(--text-muted)] text-center py-12">Nenhum awards no ar por enquanto.</p>
      </div>
    );
  }

  const phase = edition.phase;
  const sorted = sortCategories(categories);
  const quota = categoryQuota(categories, user?.id, isAdmin);
  const nominating = canNominate(phase, isAdmin);
  const ballotIds = ballotCategories(categories, byCategory).map((c) => c.id);
  const progress = ballotProgress(ballotIds, data.myVotes);

  const submitCategory = async (v: SheetValues) => {
    const { error } = await createCategory(edition.slug, v.text, v.description || null, v.imageUrl);
    if (!error) await data.reload();
    return error;
  };

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      {header}

      {data.error && (
        <p role="alert" className="text-sm text-red-400 mb-3">
          {data.error}
        </p>
      )}

      {phase === "hidden" && (
        <p className="text-xs text-[var(--text-muted)] mb-3">Prévia de admin: o grupo ainda não vê esta edição.</p>
      )}

      {phase === "nominations" && (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Indique categorias e nomes. Você pode indicar até {MAX_CATEGORIES_PER_USER} categorias
          {Number.isFinite(quota) ? ` (restam ${quota})` : ""} e {5} nomes em cada categoria.
        </p>
      )}

      {phase === "voting" && (
        <button
          onClick={() => navigate("/awards/votar")}
          disabled={!ballotIds.length}
          className="w-full mb-4 py-3.5 rounded-xl font-semibold text-black bg-[var(--gold)] disabled:opacity-50"
        >
          🗳️ {progress.complete ? "Rever meus votos" : "Votar"}
          {ballotIds.length > 0 && ` · ${progress.voted}/${progress.total}`}
        </button>
      )}

      {phase === "closed" ? (
        <AwardsResultsView categories={categories} byCategory={byCategory} results={data.results} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {sorted.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              count={byCategory[c.id]?.length ?? 0}
              mine={c.createdBy === user?.id}
              onOpen={() => navigate(`/awards/c/${c.id}`)}
            />
          ))}
          {nominating && (
            <AddCard
              label="Indicar nova categoria"
              hint={quota === 0 ? `Limite de ${MAX_CATEGORIES_PER_USER} atingido` : undefined}
              disabled={quota === 0}
              onClick={() => setSheet(true)}
            />
          )}
        </div>
      )}

      {!sorted.length && phase !== "closed" && !nominating && (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Ainda não há categorias.</p>
      )}

      {sheet && (
        <NominationSheet
          kind="category"
          title="Nova categoria"
          remaining={quota}
          onClose={() => setSheet(false)}
          onSubmit={submitCategory}
        />
      )}
    </div>
  );
}
