import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { AddCard, CategoryCard } from "./AwardsCards";
import { AwardsResultsView } from "./AwardsResults";
import { NominationSheet, type SheetValues } from "./NominationSheet";
import {
  approvedCategories,
  ballotCategories,
  ballotProgress,
  canNominate,
  categoryQuota,
  PHASE_LABEL,
  sortCategories,
  visibleCategories,
} from "./awardsLogic";
import { createCategory, setCategoryApproval } from "./awardsService";
import { MAX_CATEGORIES_PER_USER, MAX_NOMINEES_PER_USER_PER_CATEGORY, type AwardsCategory } from "./awardsTypes";
import { useAwardsData } from "./useAwardsData";

type Tab = "all" | "approved" | "results";

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="aspect-[4/5] rounded-2xl skeleton" />
      ))}
    </div>
  );
}

/**
 * Entrada do Awards. Cada pessoa vê as próprias categorias (indicação) e o botão de votar (cédula).
 * Admins do awards veem todas, com as abas "Todas" / "Aprovadas" (e "Resultado" quando encerrado).
 */
export function AwardsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const data = useAwardsData();
  const { edition, categories, byCategory, isAdmin } = data;
  const [sheet, setSheet] = useState(false);
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      {edition && isAdmin && (
        <button onClick={() => navigate("/awards/gerenciar")} aria-label="Gerenciar awards" className="shrink-0 p-2 -mr-2">
          ⚙️
        </button>
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
  const visible = sortCategories(visibleCategories(categories, user?.id, isAdmin));
  const approved = sortCategories(approvedCategories(categories));
  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: `Todas (${visible.length})` },
    { id: "approved", label: `Aprovadas (${approved.length})` },
    ...(phase === "closed" ? [{ id: "results" as const, label: "Resultado" }] : []),
  ];
  const defaultTab: Tab = phase === "closed" ? "results" : "all";
  const tab: Tab = !isAdmin ? "all" : tabs.some((t) => t.id === chosenTab) ? chosenTab! : defaultTab;
  const shown = tab === "approved" ? approved : visible;

  const quota = categoryQuota(categories, user?.id, isAdmin);
  const nominating = canNominate(phase, isAdmin) && tab === "all";
  const ballotIds = ballotCategories(categories, byCategory).map((c) => c.id);
  const progress = ballotProgress(ballotIds, data.myVotes);

  const submitCategory = async (v: SheetValues) => {
    const { error } = await createCategory(edition.slug, v.text, v.description || null, v.imageUrl);
    if (!error) await data.reload();
    return error;
  };

  const toggleApproval = async (c: AwardsCategory) => {
    const { error } = await setCategoryApproval(c.id, !c.approved);
    setActionError(error);
    if (!error) await data.reload();
  };

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      {header}

      {(data.error || actionError) && (
        <p role="alert" className="text-sm text-red-400 mb-3">
          {data.error ?? actionError}
        </p>
      )}

      {phase === "hidden" && (
        <p className="text-xs text-[var(--text-muted)] mb-3">Prévia de admin: o grupo ainda não vê esta edição.</p>
      )}

      {phase === "nominations" && (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Indique categorias e nomes. Você pode indicar até {MAX_CATEGORIES_PER_USER} categorias
          {Number.isFinite(quota) ? ` (restam ${quota})` : ""} e {MAX_NOMINEES_PER_USER_PER_CATEGORY} nomes em cada
          categoria.{!isAdmin && " Só você e os admins veem o que você indicou."}
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

      {phase === "closed" && !isAdmin && (
        <p className="text-sm text-[var(--text-primary)] text-center bg-[var(--bg-card)] border border-[rgba(201,165,90,0.25)] rounded-xl p-4 mb-4">
          Votação encerrada. 🤫 O resultado vai aparecer no Wrapped quando for liberado.
        </p>
      )}

      {isAdmin && (
        <div role="tablist" aria-label="Listas de categorias" className="flex gap-1.5 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                tab === t.id
                  ? "bg-[var(--gold)] text-black border-[var(--gold)] font-semibold"
                  : "border-[rgba(255,255,255,0.12)] text-[var(--text-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "results" ? (
        <AwardsResultsView categories={approved} byCategory={byCategory} results={data.results} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <CategoryCard
                category={c}
                count={byCategory[c.id]?.length ?? 0}
                mine={c.createdBy === user?.id}
                approved={isAdmin && c.approved}
                onOpen={() => navigate(`/awards/c/${c.id}`)}
              />
              {isAdmin && (
                <button
                  onClick={() => void toggleApproval(c)}
                  aria-label={`${c.approved ? "Remover aprovação de" : "Aprovar"} ${c.title}`}
                  className={`text-xs py-1.5 rounded-lg border ${
                    c.approved
                      ? "border-[rgba(255,255,255,0.12)] text-[var(--text-muted)]"
                      : "border-[var(--gold)] text-[var(--gold)] font-semibold"
                  }`}
                >
                  {c.approved ? "Remover aprovação" : "✓ Aprovar"}
                </button>
              )}
            </div>
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

      {tab !== "results" && !shown.length && !nominating && (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">
          {tab === "approved"
            ? "Nenhuma categoria aprovada ainda."
            : isAdmin
              ? "Ainda não há categorias."
              : "Você não indicou nenhuma categoria."}
        </p>
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
