import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export function PasskeyPromptModal() {
  const {
    user,
    registerPasskey,
    showPasskeyPrompt,
    setShowPasskeyPrompt,
  } = useAuth();

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  if (!showPasskeyPrompt || !user || !registerPasskey) {
    return null;
  }

  const handleCreate = async () => {
    setCreating(true);
    setError("");

    const { error: createError } = await registerPasskey();

    if (createError) {
      setError(createError);
    } else {
      setShowPasskeyPrompt(false);
    }

    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-primary)] p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-(--text-primary)">
          Usar biometria nas próximas vezes?
        </h2>

        <p className="mt-2 text-sm text-(--text-muted)">
          Cadastre uma chave de acesso para entrar com impressão digital, rosto ou PIN.
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-[rgba(196,64,64,0.15)] bg-[rgba(196,64,64,0.08)] px-3 py-2 text-sm text-(--red)">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="w-full rounded-lg bg-[var(--gold)] py-3 font-semibold text-black transition-opacity disabled:opacity-50"
          >
            {creating ? "Criando chave..." : "Usar biometria"}
          </button>

          <button
            type="button"
            onClick={() => setShowPasskeyPrompt(false)}
            disabled={creating}
            className="w-full rounded-lg border border-[rgba(201,165,90,0.2)] py-3 font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-elevated) disabled:opacity-50"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}