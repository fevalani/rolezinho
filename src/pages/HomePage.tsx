import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";

interface TodayBirthday {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Retorna "MM-DD" para comparar com o sufixo do birthday "YYYY-MM-DD" */
function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function HomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const firstName = profile?.display_name?.split(" ")[0] ?? "Aventureiro";

  const [todayBirthdays, setTodayBirthdays] = useState<TodayBirthday[]>([]);

  useEffect(() => {
    const today = getTodayMMDD();
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, birthday")
      .like("birthday", `%-${today}`)
      .then(({ data }) => {
        if (data?.length) setTodayBirthdays(data as TodayBirthday[]);
      });
  }, []);

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

      <div className="max-w-[500px] mx-auto w-full px-5 pb-10 flex flex-col gap-2.5">
        {/* Banner de aniversariantes de hoje */}
        {todayBirthdays.length > 0 && (
          <button
            onClick={() => navigate("/aniversarios")}
            className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl text-left
              bg-gradient-to-r from-[rgba(201,165,90,0.12)] to-[rgba(201,165,90,0.05)]
              border border-[rgba(201,165,90,0.25)]
              hover:border-[rgba(201,165,90,0.4)] hover:-translate-y-0.5
              hover:shadow-[0_4px_16px_rgba(201,165,90,0.1)]
              transition-all anim-slideUp"
            style={{ animationDelay: "0.08s" }}
          >
            <span className="text-2xl shrink-0">🎂</span>
            <div className="flex-1 min-w-0">
              {todayBirthdays.length === 1 ? (
                <>
                  <p className="text-sm font-semibold text-[var(--gold)] leading-tight">
                    Hoje é aniversário de{" "}
                    <span>{todayBirthdays[0].display_name.split(" ")[0]}</span>!
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Mande uma mensagem para celebrar 🎉
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[var(--gold)] leading-tight">
                    {todayBirthdays.length} aniversariantes hoje!
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {todayBirthdays
                      .map((b) => b.display_name.split(" ")[0])
                      .join(", ")}
                  </p>
                </>
              )}
            </div>
            {/* Avatares empilhados */}
            <div className="flex -space-x-2 shrink-0">
              {todayBirthdays.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  className="ring-2 ring-[var(--bg-deep)] rounded-full"
                >
                  <Avatar url={b.avatar_url} name={b.display_name} size="sm" />
                </div>
              ))}
              {todayBirthdays.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] ring-2 ring-[var(--bg-deep)] flex items-center justify-center text-[0.6rem] font-bold text-[var(--text-muted)]">
                  +{todayBirthdays.length - 3}
                </div>
              )}
            </div>
          </button>
        )}

        {/* Feature cards */}
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
