import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

/** Tela exibida ao abrir o link do e-mail "esqueci minha senha": define a senha nova. */
export function ResetPasswordPage() {
  const { changePassword, finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    setSubmitting(true);
    const { error: err } = await changePassword(password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    // Já está logado pelo link: encerrar a recuperação leva direto ao app.
    finishRecovery();
  };

  const inputClass =
    "w-full py-3 px-4 bg-[var(--bg-primary)] border border-[rgba(201,165,90,0.12)] rounded-lg text-(--text-primary) outline-none transition-all focus:border-(--gold) focus:shadow-[0_0_0_3px_rgba(201,165,90,0.08)] placeholder:text-(--text-muted)";

  return (
    <div className="page flex items-center justify-center min-h-dvh px-5 py-10">
      <div className="flex flex-col items-center gap-4 max-w-[380px] w-full">
        <h1
          className="text-2xl text-(--gold) tracking-wide text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Nova senha
        </h1>
        <p className="text-base text-(--text-secondary) text-center leading-relaxed mb-2">
          Escolha uma senha nova para a sua conta.
        </p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input
            className={inputClass}
            type="password"
            placeholder="Nova senha (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            autoComplete="new-password"
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Repita a nova senha"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError("");
            }}
            autoComplete="new-password"
          />

          {error && (
            <p className="text-sm text-center py-2 px-3 rounded-lg text-(--red) bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.15)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-lg font-semibold text-lg text-[var(--bg-abyss)] bg-gradient-to-br from-(--gold-dark) to-(--gold) shadow-[0_2px_8px_rgba(0,0,0,0.5),0_0_12px_rgba(201,165,90,0.1)] hover:from-(--gold) hover:to-[var(--gold-bright)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>

        <button
          type="button"
          className="text-sm text-(--gold-dark) hover:text-(--gold) transition-colors p-2"
          onClick={() => void signOut()}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
