import { useDevMode } from "@/lib/useDevMode";

/** Seção do Perfil: liga/desliga o modo desenvolvedor (recursos em teste). */
export function DevModeCard() {
  const [devMode, setDevMode] = useDevMode();
  return (
    <div className="flex flex-col gap-3">
      <h2
        className="text-xs text-(--text-muted) uppercase tracking-widest font-semibold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Modo desenvolvedor
      </h2>
      <p className="text-xs text-(--text-muted) -mt-1">
        Libera recursos em teste, como jogos novos que ainda não estão abertos
        para todo mundo. Pode ter bugs. Vale só neste aparelho.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={devMode}
        onClick={() => setDevMode(!devMode)}
        className={`flex items-center justify-between py-3 px-4 rounded-xl text-sm font-medium border transition-all ${
          devMode
            ? "bg-[rgba(201,165,90,0.12)] border-(--gold) text-(--gold)"
            : "bg-(--bg-card) border-[rgba(201,165,90,0.1)] text-(--text-primary)"
        }`}
      >
        <span>🧪 Recursos em teste</span>
        <span className="text-xs font-semibold">{devMode ? "Ligado" : "Desligado"}</span>
      </button>
    </div>
  );
}
