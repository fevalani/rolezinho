import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";

export function HomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const firstName = profile?.display_name?.split(" ")[0] ?? "Aventureiro";

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Hero */}
      <div className="flex flex-col items-center px-5 pt-10 pb-8 gap-3">
        <div
          className="anim-bounce"
          style={{ filter: "drop-shadow(0 0 40px rgba(201,165,90,0.12))" }}
        >
          <img
            src="/images/rolezinho-roots.jpeg"
            alt="Rolezinho Roots"
            className="w-52 h-52 rounded-full object-cover border-2 border-[rgba(201,165,90,0.2)] shadow-[0_0_40px_rgba(201,165,90,0.12)]"
          />
        </div>

        <h1
          className="text-xl text-[var(--gold)] mt-2 anim-fade"
          style={{ fontFamily: "var(--font-display)", animationDelay: "0.1s" }}
        >
          Olá, {firstName}
        </h1>
        <p
          className="text-base text-[var(--text-secondary)] anim-fade"
          style={{ animationDelay: "0.15s" }}
        >
          O que vamos fazer hoje?
        </p>
      </div>

      {/* Feature cards */}
      <div className="max-w-[500px] mx-auto w-full px-5 pb-10 flex flex-col gap-2.5">
        {APP_FEATURES.map((feat, i) => (
          <button
            key={feat.id}
            onClick={() => feat.enabled && navigate(feat.path)}
            disabled={!feat.enabled}
            className={`
              flex items-center gap-3.5 py-4 px-4.5 rounded-xl text-left w-full transition-all
              bg-[var(--bg-card)] border border-[rgba(201,165,90,0.06)]
              ${
                feat.enabled
                  ? "cursor-pointer hover:bg-[var(--bg-elevated)] hover:border-[rgba(201,165,90,0.15)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:translate-y-0"
                  : "opacity-40 cursor-default"
              }
              anim-slideUp
            `}
            style={{ animationDelay: `${(i + 2) * 0.05}s` }}
          >
            <span className="text-2xl w-10 text-center shrink-0">
              {feat.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-[var(--text-primary)]">
                {feat.name}
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                {feat.description}
              </div>
            </div>
            {feat.enabled ? (
              <span className="text-[var(--gold-dark)] text-lg shrink-0 transition-transform group-hover:translate-x-1">
                →
              </span>
            ) : (
              <span className="text-[0.6rem] px-2 py-1 rounded-md bg-[rgba(201,165,90,0.08)] text-[var(--gold-dark)] font-semibold uppercase tracking-wide shrink-0">
                Em breve
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
