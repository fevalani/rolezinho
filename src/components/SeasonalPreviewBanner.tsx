import { useNavigate } from "react-router-dom";
import { useSeasonalTheme } from "@/lib/seasonal/SeasonalThemeContext";

/** Faixa flutuante (só admin) enquanto um tema sazonal está em pré-visualização. */
export function SeasonalPreviewBanner() {
  const { previewId, themes, approvals, stopPreview, approve } = useSeasonalTheme();
  const navigate = useNavigate();
  const theme = themes.find((t) => t.id === previewId);
  if (!theme) return null;
  const approved = !!approvals[theme.id];

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 px-3 py-2 rounded-full text-xs shadow-[0_6px_24px_rgba(0,0,0,0.5)] max-w-[94vw]"
      style={{
        bottom: "calc(16px + var(--safe-bottom))",
        background: "var(--bg-elevated)",
        border: "1px solid rgba(201,165,90,0.35)",
        color: "var(--text-primary)",
      }}
    >
      <span className="whitespace-nowrap">
        {theme.emoji} Pré-visualizando <b>{theme.occasion}</b>
      </span>
      {!approved && !theme.occasionData && (
        <button
          onClick={() => approve(theme.id, true)}
          className="px-2.5 py-1 rounded-full font-bold bg-[rgba(52,211,153,0.15)] text-emerald-400 border border-[rgba(52,211,153,0.3)]"
        >
          Aprovar
        </button>
      )}
      {approved && <span className="text-emerald-400 font-bold">✓ aprovado</span>}
      <button
        onClick={() => {
          stopPreview();
          navigate("/admin/temas");
        }}
        className="px-2.5 py-1 rounded-full font-bold text-(--text-secondary) bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)]"
      >
        Sair
      </button>
    </div>
  );
}
