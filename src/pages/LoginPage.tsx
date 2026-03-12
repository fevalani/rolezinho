import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export function LoginPage() {
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const trimEmail = email.trim().toLowerCase();
    const trimName = name.trim();

    if (!trimEmail || !password) {
      setError("Preencha todos os campos");
      return;
    }
    if (mode === "signup" && !trimName) {
      setError("Insira seu nome");
      return;
    }
    if (mode === "signup" && trimName.length < 2) {
      setError("Nome deve ter pelo menos 2 caracteres");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    setSubmitting(true);

    if (mode === "login") {
      const { error: err } = await signIn(trimEmail, password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(trimEmail, password, trimName);
      if (err) {
        setError(err);
      } else {
        setSuccess(
          "Conta criada! Verifique seu email para confirmar e depois faça login.",
        );
        setMode("login");
        setPassword("");
        setName("");
      }
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="page flex items-center justify-center min-h-dvh">
        <div className="spinner" />
      </div>
    );
  }

  const inputClass =
    "w-full py-3 px-4 bg-[var(--bg-primary)] border border-[rgba(201,165,90,0.12)] rounded-lg text-(--text-primary) outline-none transition-all focus:border-(--gold) focus:shadow-[0_0_0_3px_rgba(201,165,90,0.08)] placeholder:text-(--text-muted)";

  return (
    <div className="page flex items-center justify-center min-h-dvh px-5 py-10">
      <div className="flex flex-col items-center gap-4 max-w-[380px] w-full">
        {/* Logo image */}
        <div className="anim-bounce mb-1">
          <img
            src="/images/rolezinho-roots.jpeg"
            alt="Rolezinho Roots"
            className="w-24 h-24 rounded-full object-cover border-2 border-[rgba(201,165,90,0.25)] shadow-[0_0_28px_rgba(201,165,90,0.18)]"
          />
        </div>

        <h1
          className="text-2xl text-(--gold) tracking-wide text-center anim-fade"
          style={{ fontFamily: "var(--font-display)", animationDelay: "0.05s" }}
        >
          Rolezinho Roots
        </h1>
        <p
          className="text-base text-(--text-secondary) text-center leading-relaxed mb-2 anim-fade"
          style={{ animationDelay: "0.1s" }}
        >
          {mode === "login"
            ? "Entre na sua conta para acessar o app"
            : "Crie sua conta"}
        </p>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-3 anim-slideUp"
          style={{ animationDelay: "0.15s" }}
        >
          {mode === "signup" && (
            <input
              className={inputClass}
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearMessages();
              }}
              autoComplete="name"
              maxLength={40}
            />
          )}
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearMessages();
            }}
            autoComplete="email"
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Senha (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearMessages();
            }}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />

          {error && (
            <p className="text-sm text-center py-2 px-3 rounded-lg text-(--red) bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.15)]">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-center py-2 px-3 rounded-lg text-[var(--green)] bg-[rgba(58,186,122,0.08)] border border-[rgba(58,186,122,0.15)] leading-snug">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-lg font-semibold text-lg text-[var(--bg-abyss)] bg-gradient-to-br from-(--gold-dark) to-(--gold) shadow-[0_2px_8px_rgba(0,0,0,0.5),0_0_12px_rgba(201,165,90,0.1)] hover:from-(--gold) hover:to-[var(--gold-bright)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {submitting
              ? "Carregando..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>

        {/* Toggle */}
        <button
          className="text-sm text-(--gold-dark) hover:text-(--gold) transition-colors p-2 anim-fade"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            clearMessages();
          }}
          style={{ animationDelay: "0.2s" }}
        >
          {mode === "login"
            ? "Não tem conta? Criar agora"
            : "Já tem conta? Fazer login"}
        </button>
      </div>
    </div>
  );
}
