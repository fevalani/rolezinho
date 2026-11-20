import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { hapticTap } from "@/lib/haptics";
import type { Feature } from "@/lib/types";
import { useFeatures } from "@/lib/FeatureFlagsContext";
import { Avatar } from "@/components/Avatar";
import { useSeasonalTheme } from "@/lib/seasonal/SeasonalThemeContext";
import { formatMdLong, occasionMdFor } from "@/lib/seasonal/themes";
import { JumbledText } from "@/components/JumbledText";
import { fetchEdition } from "@/features/wrapped/wrappedService";
import type { WrappedEdition } from "@/features/wrapped/wrappedTypes";
import { useDevMode } from "@/lib/useDevMode";
import { RolezinhoOrbit } from "@/features/home/RolezinhoOrbit";
import { fetchHomeHighlights } from "@/features/home/homeService";
import { firstNames, formatConfirmed, formatCountdown } from "@/features/home/homeLogic";
import type { BirthdayPerson, NextAgendaEvent, NextBirthday } from "@/features/home/homeTypes";

// Agrupamento dos cards por categoria na grade da Home.
const FEATURE_CATEGORIES: { label: string; ids: string[] }[] = [
  {
    label: "🎲 Jogos & Apostas",
    ids: ["bolao", "dados", "briga-de-bar", "letreco", "ranking", "ficha"],
  },
  { label: "👥 Social", ids: ["aniversarios", "musicas", "agenda", "cultura"] },
  { label: "💰 Financeiro", ids: ["splitwise"] },
];

function groupFeaturesByCategory<T extends Feature>(
  features: T[],
): { label: string; features: T[] }[] {
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
  const { profile } = useAuth();
  const { active: seasonTheme } = useSeasonalTheme();
  const [devMode] = useDevMode();
  const navigate = useNavigate();
  const firstName = profile?.display_name?.split(" ")[0] ?? "Aventureiro";

  const features = useFeatures();
  const visibleFeatures = features.filter(
    (f) => !(profile?.hidden_features ?? []).includes(f.id),
  );

  const [todayBirthdays, setTodayBirthdays] = useState<BirthdayPerson[]>([]);
  const [nextBirthday, setNextBirthday] = useState<NextBirthday | null>(null);
  const [nextEvent, setNextEvent] = useState<NextAgendaEvent | null>(null);

  const [wrapped, setWrapped] = useState<WrappedEdition | null>(null);
  useEffect(() => {
    let alive = true;
    fetchEdition().then((e) => alive && setWrapped(e));
    return () => {
      alive = false;
    };
  }, []);

  const loadBirthdays = useCallback(async () => {
    const h = await fetchHomeHighlights(devMode);
    setTodayBirthdays(h.todayBirthdays);
    setNextBirthday(h.nextBirthday);
    setNextEvent(h.nextEvent);
  }, [devMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial: loadBirthdays() é assíncrono
    loadBirthdays();
  }, [loadBirthdays]);

  // Pull-to-refresh — atualiza os aniversariantes de hoje.
  const { pullDistance, pulling, pullRefreshing, PULL_THRESHOLD } =
    usePullToRefresh(loadBirthdays, true);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Indicador de pull-to-refresh */}
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
      <div data-decor="lights" className="relative w-full h-96 overflow-hidden">
        {/* Camada de fundo: a mesma imagem, ampliada e borrada, preenche
            a faixa toda — dá a sensação de continuidade em vez de barras
            pretas nas laterais da foto quadrada. */}
        <img
          src="/images/roots/bg.jpg"
          alt=""
          aria-hidden="true"
          className="sticky top-0 inset-0 w-full h-full object-cover blur-md opacity-80"
        />
        {/* Camada nítida: foto completa, com os rostos girando em volta da caneca */}
        <div className="absolute inset-0">
          <RolezinhoOrbit />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-(--bg-abyss) via-black/30 to-black/10" />
        {seasonTheme && (
          <div
            className="absolute left-4 top-10 z-[3] flex items-center gap-2 px-3 py-1.5 rounded-full anim-fade max-w-[calc(100%-2rem)]"
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <span className="text-lg leading-none shrink-0">
              {seasonTheme.emoji}
            </span>
            <span className="flex flex-col min-w-0 leading-tight">
              <span className="text-[0.8rem] font-semibold text-white truncate">
                {seasonTheme.jumble ? (
                  <JumbledText text={seasonTheme.occasion} />
                ) : (
                  seasonTheme.occasion
                )}
              </span>
              <span className="text-[0.68rem] text-white/75">
                {formatMdLong(occasionMdFor(seasonTheme))}
              </span>
            </span>
          </div>
        )}
        <div className="absolute inset-0 z-[3] flex flex-col justify-end px-4 pb-4 gap-3">
          <div className="flex flex-col gap-1 px-1">
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

          {/* Destaques próximos: agenda + próximo aniversário */}
          {devMode && (() => {
            const showNextBirthday =
              todayBirthdays.length === 0 && nextBirthday !== null;
            if (!nextEvent && !showNextBirthday) return null;

            const bothVisible = Boolean(nextEvent && showNextBirthday);

            return (
              <div className="flex items-stretch gap-2.5">
                {nextEvent && (
                  <button
                    onClick={() => {
                      hapticTap();
                      navigate(`/agenda?evento=${nextEvent.id}`);
                    }}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-left anim-fade transition-all cursor-pointer bg-[rgba(0,0,0,0.45)] border border-[rgba(255,255,255,0.18)] hover:bg-[rgba(0,0,0,0.6)] hover:border-[rgba(255,255,255,0.32)] active:scale-[0.98] min-w-0 ${
                      bothVisible ? "flex-1" : "max-w-full"
                    }`}
                    style={{
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      animationDelay: "0.18s",
                    }}
                  >
                    <span className="text-xl leading-none shrink-0">📅</span>
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-[0.65rem] font-semibold tracking-wide text-white/70 truncate">
                        {formatCountdown(nextEvent.daysUntil)}
                      </span>
                      <span className="text-xs font-semibold text-white leading-snug line-clamp-2">
                        {nextEvent.title}
                      </span>
                      {formatConfirmed(nextEvent.confirmedCount) && (
                        <span className="text-[0.68rem] text-white/75 truncate">
                          {formatConfirmed(nextEvent.confirmedCount)}
                        </span>
                      )}
                    </span>
                  </button>
                )}

                {showNextBirthday && nextBirthday && (
                  <button
                    onClick={() => {
                      hapticTap();
                      navigate("/aniversarios");
                    }}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-left anim-fade transition-all cursor-pointer bg-[rgba(0,0,0,0.45)] border border-[rgba(255,255,255,0.18)] hover:bg-[rgba(0,0,0,0.6)] hover:border-[rgba(255,255,255,0.32)] active:scale-[0.98] min-w-0 ${
                      bothVisible ? "flex-1" : "max-w-full"
                    }`}
                    style={{
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      animationDelay: "0.22s",
                    }}
                  >
                    <span className="text-xl leading-none shrink-0">🎂</span>
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-[0.65rem] font-semibold tracking-wide text-white/70 truncate">
                        {formatCountdown(nextBirthday.daysUntil)}
                      </span>
                      <span className="text-xs font-semibold text-white leading-snug line-clamp-2">
                        {firstNames(nextBirthday.people)}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            );
          })()}
        </div>
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

        {/* Wrapped: retrospectiva ativa */}
        {wrapped && (
          <button
            onClick={() => navigate(`/wrapped/${wrapped.slug}`)}
            className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl text-left text-white
              bg-gradient-to-r from-[#7c5cff] to-[#e8c86e] hover:-translate-y-0.5 transition-all anim-slideUp"
          >
            <span className="text-2xl shrink-0">🎁</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold leading-tight">
                {wrapped.pageTitle}
              </span>
              <span className="block text-xs opacity-90 mt-0.5">
                {wrapped.subtitle ?? "Veja a sua retrospectiva"}
              </span>
            </span>
          </button>
        )}

        {/* Feature cards */}
        <div className="flex flex-col gap-4">
          {groupFeaturesByCategory(visibleFeatures).map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <p
                data-decor="stocking"
                className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest px-1"
              >
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
                    {feat.enabled && feat.offForOthers && (
                      <span className="text-[0.55rem] px-1.5 py-0.5 rounded-md bg-[rgba(196,64,64,0.12)] text-(--red) font-semibold uppercase tracking-wide">
                        Só admin
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
