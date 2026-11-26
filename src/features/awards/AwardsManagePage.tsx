import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/lib/useAdmin";
import { AwardsEditionPanel } from "./AwardsEditionPanel";
import { useAwardsData } from "./useAwardsData";

/** /awards/gerenciar: configuração da edição atual para os admins do awards (que não acessam o /admin). */
export function AwardsManagePage() {
  const navigate = useNavigate();
  const { isAdmin: isAppAdmin } = useAdmin();
  const { loading, edition, isAdmin, reload } = useAwardsData();

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/awards")} aria-label="Voltar" className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ‹
        </button>
        <h1 className="text-xl font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
          Gerenciar awards
        </h1>
      </div>
      {loading ? (
        <div className="h-40 rounded-2xl skeleton" />
      ) : !edition || !isAdmin ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-12">Acesso restrito aos admins do awards.</p>
      ) : (
        <AwardsEditionPanel edition={edition} onChanged={() => void reload()} isAppAdmin={isAppAdmin} />
      )}
    </div>
  );
}
