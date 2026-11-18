import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";
import { useFeatureFlags } from "@/lib/FeatureFlagsContext";
import { clearFeatureFlag, setFeatureFlag } from "@/lib/featureFlagsService";

/** Liga/desliga cada feature para todo mundo (desligada aparece como "Em breve"). Admin continua vendo. */
export function FeaturesSection() {
  const { user } = useAuth();
  const { flags, reload } = useFeatureFlags();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (id: string, name: string, action: () => Promise<{ error: string | null }>, okText: string) => {
    setBusy(id);
    const { error } = await action();
    setBusy(null);
    setMsg(error ? { ok: false, text: `Erro: ${error}` } : { ok: true, text: `${name}: ${okText}` });
    if (!error) await reload();
  };

  return (
    <div className="px-5 pt-6 pb-10 max-w-[540px] mx-auto w-full flex flex-col gap-4">
      <h1 className="text-xl text-(--gold) leading-none" style={{ fontFamily: "var(--font-display)" }}>
        Features
      </h1>
      <p className="text-sm text-(--text-muted)">
        Desligar esconde a feature para os outros (aparece “Em breve”); você continua usando, marcada como “Só admin”.
        É visibilidade, não bloqueia o acesso aos dados dela.
      </p>
      {msg && (
        <p role="status" className={`text-sm rounded-xl px-3 py-2 border ${msg.ok ? "text-emerald-400 border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)]" : "text-(--red) border-[rgba(196,64,64,0.25)] bg-[rgba(196,64,64,0.1)]"}`}>
          {msg.text}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {APP_FEATURES.map((f) => {
          const on = flags[f.id] ?? f.enabled;
          const changed = f.id in flags;
          return (
            <li key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-(--bg-card) border border-[rgba(255,255,255,0.06)]">
              <span className="text-2xl shrink-0">{f.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-(--text-primary)">{f.name}</span>
                <span className="block text-xs text-(--text-muted)">
                  {on ? "Ligada para todos" : "Desligada (Em breve)"}
                  {changed && ` · padrão do código: ${f.enabled ? "ligada" : "desligada"}`}
                </span>
              </span>
              {changed && (
                <button
                  disabled={busy === f.id}
                  onClick={() => run(f.id, f.name, () => clearFeatureFlag(f.id), "voltou ao padrão do código.")}
                  className="text-xs text-(--text-muted) underline disabled:opacity-40"
                >
                  Restaurar
                </button>
              )}
              <input
                type="checkbox"
                role="switch"
                aria-label={`${f.name} ligada para todos`}
                checked={on}
                disabled={busy === f.id}
                onChange={() => run(f.id, f.name, () => setFeatureFlag(f.id, !on, user!.id), on ? "desligada." : "ligada.")}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
