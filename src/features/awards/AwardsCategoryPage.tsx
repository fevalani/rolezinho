import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useAdmin } from "@/lib/useAdmin";
import { AddCard, NomineeCard } from "./AwardsCards";
import { NominationSheet, type SheetValues } from "./NominationSheet";
import { canEditItem, canNominate, nomineeQuota } from "./awardsLogic";
import { addNominee, deleteCategory, deleteNominee, updateCategory, updateNominee } from "./awardsService";
import { MAX_NOMINEES_PER_USER_PER_CATEGORY, type AwardsNominee } from "./awardsTypes";
import { useAwardsData } from "./useAwardsData";

type SheetState = { type: "add" } | { type: "edit-nominee"; nominee: AwardsNominee } | { type: "edit-category" } | null;

/** Categoria: indicados em grade + "indicar mais um". Dono/admin edita e apaga. */
export function AwardsCategoryPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const data = useAwardsData();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const category = data.categories.find((c) => c.id === categoryId);
  const phase = data.edition?.phase ?? "hidden";
  const back = (
    <button onClick={() => navigate("/awards")} aria-label="Voltar" className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
      ‹
    </button>
  );

  if (data.loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        {back}
        <div className="grid grid-cols-2 gap-3 mt-3">
          {[0, 1].map((i) => (
            <div key={i} className="aspect-square rounded-2xl skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        {back}
        <p className="text-sm text-[var(--text-muted)] text-center py-12">Categoria não encontrada.</p>
      </div>
    );
  }

  const nominees = data.byCategory[category.id] ?? [];
  const quota = nomineeQuota(nominees, user?.id, isAdmin);
  const nominating = canNominate(phase, isAdmin);
  const canEditCategory = canEditItem(category, user?.id, isAdmin, phase);

  const run = async (p: Promise<{ error: string | null }>) => {
    const { error } = await p;
    setActionError(error);
    if (!error) await data.reload();
    return error;
  };

  const removeNominee = (n: AwardsNominee) => {
    if (window.confirm("Apagar este indicado?")) void run(deleteNominee(n.id));
  };

  const removeCategory = async () => {
    if (!window.confirm("Apagar a categoria e todos os indicados dela?")) return;
    const error = await run(deleteCategory(category.id));
    if (!error) navigate("/awards", { replace: true });
  };

  const submitSheet = (v: SheetValues) => {
    if (sheet?.type === "add") return run(addNominee(category.id, v.text || null, v.imageUrl));
    if (sheet?.type === "edit-nominee")
      return run(updateNominee(sheet.nominee.id, { label: v.text || null, imageUrl: v.imageUrl }));
    return run(updateCategory(category.id, { title: v.text, description: v.description || null, imageUrl: v.imageUrl }));
  };

  const btn = "text-[11px] px-2 py-1 rounded-md bg-black/60 text-white";

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="flex items-start gap-2 mb-4">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
            {category.title}
          </h1>
          {category.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{category.description}</p>}
        </div>
        {canEditCategory && (
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setSheet({ type: "edit-category" })} aria-label="Editar categoria" className="p-2 text-[var(--text-muted)]">
              ✏️
            </button>
            <button onClick={() => void removeCategory()} aria-label="Apagar categoria" className="p-2 text-[var(--text-muted)]">
              🗑️
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-red-400 mb-3">
          {actionError}
        </p>
      )}

      {nominating && (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Você pode indicar até {MAX_NOMINEES_PER_USER_PER_CATEGORY} nomes aqui
          {Number.isFinite(quota) ? ` (restam ${quota})` : ""}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {nominees.map((n) => (
          <NomineeCard
            key={n.id}
            nominee={n}
            actions={
              canEditItem(n, user?.id, isAdmin, phase) && (
                <>
                  <button className={btn} onClick={() => setSheet({ type: "edit-nominee", nominee: n })} aria-label={`Editar ${n.label ?? "indicado"}`}>
                    Editar
                  </button>
                  <button className={btn} onClick={() => removeNominee(n)} aria-label={`Apagar ${n.label ?? "indicado"}`}>
                    Apagar
                  </button>
                </>
              )
            }
          />
        ))}
        {nominating && (
          <AddCard
            aspect="aspect-square"
            label="Indicar mais um"
            hint={quota === 0 ? `Limite de ${MAX_NOMINEES_PER_USER_PER_CATEGORY} atingido` : undefined}
            disabled={quota === 0}
            onClick={() => setSheet({ type: "add" })}
          />
        )}
      </div>

      {!nominees.length && !nominating && (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">Nenhum indicado ainda.</p>
      )}

      {sheet && (
        <NominationSheet
          kind={sheet.type === "edit-category" ? "category" : "nominee"}
          title={sheet.type === "add" ? "Novo indicado" : sheet.type === "edit-nominee" ? "Editar indicado" : "Editar categoria"}
          initial={
            sheet.type === "edit-nominee"
              ? { text: sheet.nominee.label ?? "", imageUrl: sheet.nominee.imageUrl }
              : sheet.type === "edit-category"
                ? { text: category.title, description: category.description ?? "", imageUrl: category.imageUrl }
                : undefined
          }
          remaining={sheet.type === "add" ? quota : undefined}
          onClose={() => setSheet(null)}
          onSubmit={submitSheet}
        />
      )}
    </div>
  );
}
