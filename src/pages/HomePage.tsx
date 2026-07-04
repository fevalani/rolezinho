import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { hapticTap } from "@/lib/haptics";
import { APP_FEATURES, type Feature } from "@/lib/types";
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

// Agrupamento dos cards por categoria — só usado na grade do modo beta.
const FEATURE_CATEGORIES: { label: string; ids: string[] }[] = [
  {
    label: "🎲 Jogos & Apostas",
    ids: ["bolao", "dados", "briga-de-bar", "letreco", "ranking", "ficha"],
  },
  { label: "👥 Social", ids: ["aniversarios", "musicas", "agenda", "cultura"] },
  { label: "💰 Financeiro", ids: ["splitwise"] },
];

function groupFeaturesByCategory(
  features: Feature[],
): { label: string; features: Feature[] }[] {
  const groups = FEATURE_CATEGORIES.map((cat) => ({
    label: cat.label,
    features: features.filter((f) => cat.ids.includes(f.id)),
  })).filter((g) => g.features.length > 0);

  const categorized = new Set(FEATURE_CATEGORIES.flatMap((c) => c.ids));
  const others = features.filter((f) => !categorized.has(f.id));
  if (others.length > 0) groups.push({ label: "✨ Outros", features: others });

  return groups;
}

export function HomePage() {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const firstName = profile?.display_name?.split(" ")[0] ?? "Aventureiro";

  const visibleFeatures = APP_FEATURES.filter(
    (f) => !(profile?.hidden_features ?? []).includes(f.id),
  );

  const isGrid = (profile?.home_layout ?? "list") === "grid";
  const handleToggleLayout = () => {
    updateProfile({ home_layout: isGrid ? "list" : "grid" });
  };

  const [todayBirthdays, setTodayBirthdays] = useState<TodayBirthday[]>([]);

  const loadBirthdays = useCallback(async () => {
    const today = getTodayMMDD();
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, birthday")
      .like("birthday", `%-${today}`);
    setTodayBirthdays((data as TodayBirthday[]) ?? []);
  }, []);

  useEffect(() => {
    loadBirthdays();
  }, [loadBirthdays]);

  // Pull-to-refresh (só no modo beta) — atualiza os aniversariantes de hoje.
  const { pullDistance, pulling, pullRefreshing, PULL_THRESHOLD } =
    usePullToRefresh(loadBirthdays, isGrid);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Indicador de pull-to-refresh (modo beta) */}
      {(pullDistance > 0 || pullRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none"
          style={{
            transform: `translateY(${pullRefreshing ? 12 : Math.max(0, pullDistance - 28)}px)`,
            opacity: pullRefreshing
              ? 1
              : Math.min(pullDistance / PULL_THRESHOLD, 1),
            transition: pulling ? "none" : "transform 0.25s, opacity 0.25s",
          }}
        >
          <div className="w-9 h-9 rounded-full bg-(--bg-elevated) border border-[rgba(255,255,255,0.08)] shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-center">
            {pullRefreshing || pullDistance >= PULL_THRESHOLD ? (
              <span className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              <span
                className="text-(--text-muted) text-sm leading-none"
                style={{ transform: `rotate(${pullDistance * 2.4}deg)` }}
              >
                ↓
              </span>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      {isGrid ? (
        <div className="relative w-full h-60 overflow-hidden">
          {/* Camada de fundo: a mesma imagem, ampliada e borrada, preenche
              a faixa toda — dá a sensação de continuidade em vez de barras
              pretas nas laterais da foto quadrada. */}
          <img
            src="/images/rolezinho-roots.jpeg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-md opacity-80"
          />
          {/* Camada nítida: a foto completa, sem cortar */}
          <img
            src="/images/rolezinho-roots.jpeg"
            alt=""
            className="absolute inset-0 w-full h-full object-contain anim-fade"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-(--bg-abyss) via-black/30 to-black/10" />
          <div className="relative h-full flex flex-col justify-end px-5 pb-6 gap-1">
            <h1
              className="text-2xl text-white anim-fade"
              style={{
                fontFamily: "var(--font-display)",
                animationDelay: "0.1s",
                textShadow: "0 2px 12px rgba(0,0,0,0.55)",
              }}
            >
              Olá, {firstName}
            </h1>
            <p
              className="text-base text-white/85 anim-fade"
              style={{
                animationDelay: "0.15s",
                textShadow: "0 1px 8px rgba(0,0,0,0.45)",
              }}
            >
              O que vamos fazer hoje?
            </p>
          </div>
        </div>
      ) : (
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
            className="text-xl text-(--gold) mt-2 anim-fade"
            style={{
              fontFamily: "var(--font-display)",
              animationDelay: "0.1s",
            }}
          >
            Olá, {firstName}
          </h1>
          <p
            className="text-base text-(--text-secondary) anim-fade"
            style={{ animationDelay: "0.15s" }}
          >
            O que vamos fazer hoje?
          </p>
        </div>
      )}

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
                  <p className="text-sm font-semibold text-(--gold) leading-tight">
                    Hoje é aniversário de{" "}
                    <span>{todayBirthdays[0].display_name.split(" ")[0]}</span>!
                  </p>
                  <p className="text-xs text-(--text-muted) mt-0.5">
                    Mande uma mensagem para celebrar 🎉
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-(--gold) leading-tight">
                    {todayBirthdays.length} aniversariantes hoje!
                  </p>
                  <p className="text-xs text-(--text-muted) mt-0.5">
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
                <div className="w-8 h-8 rounded-full bg-(--bg-elevated) ring-2 ring-[var(--bg-deep)] flex items-center justify-center text-[0.6rem] font-bold text-(--text-muted)">
                  +{todayBirthdays.length - 3}
                </div>
              )}
            </div>
          </button>
        )}

        {/* Toggle da versão beta (grade de 3 colunas) */}
        <div className="flex items-center justify-end gap-2 px-1 pb-0.5">
          <span className="text-xs text-(--text-muted)">🧪 Versão beta</span>
          <button
            onClick={handleToggleLayout}
            className={`shrink-0 w-10 h-5.5 rounded-full transition-all relative
              ${isGrid ? "bg-[rgba(201,165,90,0.3)]" : "bg-[rgba(255,255,255,0.08)]"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all
                ${
                  isGrid
                    ? "left-[calc(100%-1.125rem)] bg-(--gold)"
                    : "left-0.5 bg-[rgba(255,255,255,0.3)]"
                }`}
            />
          </button>
        </div>

        {/* Feature cards */}
        {isGrid ? (
          <div className="flex flex-col gap-4">
            {groupFeaturesByCategory(visibleFeatures).map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest px-1">
                  {group.label}
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {group.features.map((feat, i) => (
                    <button
                      key={feat.id}
                      onClick={() => {
                        if (!feat.enabled) return;
                        hapticTap();
                        navigate(feat.path);
                      }}
                      disabled={!feat.enabled}
                      className={`
                        flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-xl text-center transition-all
                        bg-(--bg-card) border border-[rgba(201,165,90,0.06)]
                        ${
                          feat.enabled
                            ? "cursor-pointer hover:bg-(--bg-elevated) hover:border-[rgba(201,165,90,0.15)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:translate-y-0"
                            : "opacity-40 cursor-default"
                        }
                        anim-slideUp
                      `}
                      style={{ animationDelay: `${(i + 2) * 0.05}s` }}
                    >
                      <span className="text-2xl">{feat.icon}</span>
                      <span className="text-xs font-semibold text-(--text-primary) leading-tight">
                        {feat.name}
                      </span>
                      {!feat.enabled && (
                        <span className="text-[0.55rem] px-1.5 py-0.5 rounded-md bg-[rgba(201,165,90,0.08)] text-(--gold-dark) font-semibold uppercase tracking-wide">
                          Em breve
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          visibleFeatures.map((feat, i) => (
            <button
              key={feat.id}
              onClick={() => feat.enabled && navigate(feat.path)}
              disabled={!feat.enabled}
              className={`
                flex items-center gap-3.5 py-4 px-4.5 rounded-xl text-left w-full transition-all
                bg-(--bg-card) border border-[rgba(201,165,90,0.06)]
                ${
                  feat.enabled
                    ? "cursor-pointer hover:bg-(--bg-elevated) hover:border-[rgba(201,165,90,0.15)] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:translate-y-0"
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
                <div className="text-base font-semibold text-(--text-primary)">
                  {feat.name}
                </div>
                <div className="text-sm text-(--text-muted)">
                  {feat.description}
                </div>
              </div>
              {feat.enabled ? (
                <span className="text-(--gold-dark) text-lg shrink-0 transition-transform group-hover:translate-x-1">
                  →
                </span>
              ) : (
                <span className="text-[0.6rem] px-2 py-1 rounded-md bg-[rgba(201,165,90,0.08)] text-(--gold-dark) font-semibold uppercase tracking-wide shrink-0">
                  Em breve
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
