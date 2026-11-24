import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { isPasskeySupported } from "@/lib/webauthn";
import { supabase } from "@/lib/supabase";
import { useDevMode } from "@/lib/useDevMode";

export function PasskeySettings() {
    const { user, registerPasskey, removePasskey } = useAuth();
    const [hasPasskey, setHasPasskey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [awaitingCode, setAwaitingCode] = useState(false);
    const [code, setCode] = useState("");
    const [sendingCode, setSendingCode] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [devMode] = useDevMode();

    const supportsPasskey = isPasskeySupported();

    useEffect(() => {
        const checkExistingPasskey = async () => {
            if (!user) {
                setHasPasskey(false);
                setLoading(false);
                return;
            }

            const { data, error: queryError } = await supabase
                .from("user_passkeys")
                .select("id")
                .eq("user_id", user.id);

            if (queryError) {
                console.error(queryError);
                setHasPasskey(false);
            } else {
                setHasPasskey((data ?? []).length > 0);
            }

            setLoading(false);
        };

        checkExistingPasskey();
    }, [user]);

    const handleRegisterPasskey = async () => {
        if (!registerPasskey) return;

        setStatus("");
        setError("");
        setSubmitting(true);

        const { error: err } = await registerPasskey();

        if (err) {
            setError(err);
        } else {
            setStatus("Chave de acesso criada com sucesso!");
            setHasPasskey(true);
        }

        setSubmitting(false);
    };

    const requestRemovalCode = async () => {
        if (!user?.email) return;

        setStatus("");
        setError("");
        setSendingCode(true);

        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: user.email,
            options: {
                shouldCreateUser: false,
            },
        });

        if (otpError) {
            setError("Não foi possível enviar o código por e-mail.");
        } else {
            setAwaitingCode(true);
            setStatus("Enviamos um código de confirmação para seu e-mail.");
        }

        setSendingCode(false);
    };

    const confirmRemoval = async () => {
        if (!user?.email) return;

        if (code.length !== 6) {
            setError("Digite o código de 6 dígitos enviado por e-mail.");
            return;
        }

        setStatus("");
        setError("");
        setRemoving(true);

        const { error: otpError } = await supabase.auth.verifyOtp({
            email: user.email,
            token: code,
            type: "email",
        });

        if (otpError) {
            setError("Código inválido ou expirado.");
            setRemoving(false);
            return;
        }

        const { error: removeError } = await removePasskey();

        if (removeError) {
            setError(removeError);
        } else {
            setHasPasskey(false);
            setAwaitingCode(false);
            setCode("");
            setStatus("Chave de acesso removida com sucesso.");
        }

        setRemoving(false);
    };

    if (!devMode) {
        return null;
    }

    if (!supportsPasskey || !registerPasskey || loading) {
        return null;
    }

    if (hasPasskey) {
        return (
            <div className="flex flex-col gap-3">
                <h2
                    className="text-xs text-(--text-muted) uppercase tracking-widest font-semibold"
                    style={{ fontFamily: "var(--font-display)" }}
                >
                    Chaves de acesso
                </h2>

                {status && (
                    <p className="text-sm text-center py-2 px-3 rounded-lg text-[var(--green)] bg-[rgba(58,186,122,0.08)] border border-[rgba(58,186,122,0.15)]">
                        {status}
                    </p>
                )}

                {error && (
                    <p className="text-sm text-center py-2 px-3 rounded-lg text-(--red) bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.15)]">
                        {error}
                    </p>
                )}

                {awaitingCode ? (
                    <>
                        <p className="text-xs text-(--text-muted)">
                            Digite o código enviado para{" "}
                            <strong>{user?.email}</strong>.
                        </p>

                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            value={code}
                            onChange={(event) => {
                                setCode(event.target.value.replace(/\D/g, "").slice(0, 8));
                                setError("");
                            }}
                            placeholder="000000"
                            className="w-full py-3 px-4 bg-[var(--bg-primary)] border border-[rgba(201,165,90,0.12)] rounded-lg text-(--text-primary) outline-none transition-all focus:border-(--gold) focus:shadow-[0_0_0_3px_rgba(201,165,90,0.08)] placeholder:text-(--text-muted) text-center tracking-[0.4em]"
                        />

                        <button
                            type="button"
                            onClick={confirmRemoval}
                            disabled={removing || !(code.length === 6 || code.length === 8)}
                            className="w-full py-3 px-6 rounded-lg font-semibold text-(--red) bg-transparent border border-[rgba(196,64,64,0.3)] hover:bg-[rgba(196,64,64,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {removing ? "Removendo..." : "Confirmar remoção"}
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-xs text-(--text-muted)">
                            Você possui uma chave de acesso cadastrada.
                        </p>

                        <button
                            type="button"
                            onClick={requestRemovalCode}
                            disabled={sendingCode}
                            className="w-full py-3 px-6 rounded-lg font-semibold text-(--red) bg-transparent border border-[rgba(196,64,64,0.3)] hover:bg-[rgba(196,64,64,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sendingCode
                                ? "Enviando código..."
                                : "Remover chave de acesso"}
                        </button>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <h2
                className="text-xs text-(--text-muted) uppercase tracking-widest font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
            >
                Chaves de acesso
            </h2>

            <p className="text-xs text-(--text-muted) -mt-1">
                Use sua impressão digital, rosto ou PIN para entrar sem senha.
            </p>

            {error && (
                <p className="text-sm text-center py-2 px-3 rounded-lg text-(--red) bg-[rgba(196,64,64,0.08)] border border-[rgba(196,64,64,0.15)]">
                    {error}
                </p>
            )}

            {status && (
                <p className="text-sm text-center py-2 px-3 rounded-lg text-[var(--green)] bg-[rgba(58,186,122,0.08)] border border-[rgba(58,186,122,0.15)]">
                    {status}
                </p>
            )}

            <button
                type="button"
                onClick={handleRegisterPasskey}
                disabled={submitting}
                className="w-full py-3 px-6 rounded-lg font-semibold text-(--text-primary) bg-transparent border border-[rgba(201,165,90,0.2)] hover:bg-(--bg-elevated) hover:border-(--gold-dark) transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {submitting ? "Criando chave..." : "🔐 Criar chave de acesso"}
            </button>
        </div>
    );
}