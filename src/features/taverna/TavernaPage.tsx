import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchRolls,
  performMultiRoll,
  subscribeToRolls,
  fetchProfiles,
  cleanupOldRolls,
} from "@/features/taverna/tavernaService";
import { isCriticalHit, isCriticalFail, formatRelativeTime } from "@/lib/utils";
import type { DiceType, DiceRoll, Profile } from "@/lib/types";
import { DICE_CONFIG, DICE_TYPES } from "@/lib/types";

const PAGE_SIZE = 10;
const MAX_ROLLS = 50;

export function TavernaPage() {
  const { user, profile } = useAuth();
  const [selectedDice, setSelectedDice] = useState<DiceType>("d20");
  const [quantity, setQuantity] = useState(1);
  const [lastResults, setLastResults] = useState<DiceRoll[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const skipRealtimeRef = useRef(new Set<string>());

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const [rollData, profileData] = await Promise.all([
        fetchRolls(MAX_ROLLS),
        fetchProfiles(),
      ]);
      setRolls(rollData);
      setProfiles(profileData);
      setLoading(false);
    };
    load();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const unsub = subscribeToRolls((newRoll) => {
      if (skipRealtimeRef.current.has(newRoll.id)) {
        skipRealtimeRef.current.delete(newRoll.id);
        return;
      }
      setRolls((prev) => {
        if (prev.some((r) => r.id === newRoll.id)) return prev;
        return [newRoll, ...prev].slice(0, MAX_ROLLS);
      });
    });
    return unsub;
  }, []);

  // Roll dice
  const handleRoll = useCallback(async () => {
    if (isRolling || !user) return;
    setIsRolling(true);
    setLastResults([]);

    await new Promise((r) => setTimeout(r, 500));

    const results = await performMultiRoll(user.id, selectedDice, quantity);

    if (results.length > 0) {
      // Attach profile if missing
      const withProfile = results.map((r) => ({
        ...r,
        profile: r.profile ?? profile ?? undefined,
      }));

      // Mark these IDs to skip in realtime
      withProfile.forEach((r) => skipRealtimeRef.current.add(r.id));

      setLastResults(withProfile);
      setRolls((prev) => {
        const ids = new Set(withProfile.map((r) => r.id));
        const filtered = prev.filter((r) => !ids.has(r.id));
        return [...withProfile.reverse(), ...filtered]
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          )
          .slice(0, MAX_ROLLS);
      });
    }

    setIsRolling(false);
  }, [isRolling, user, profile, selectedDice, quantity]);

  // Cleanup old rolls
  const handleCleanup = async () => {
    setCleaning(true);
    const deleted = await cleanupOldRolls();
    if (deleted > 0) {
      const freshRolls = await fetchRolls(MAX_ROLLS);
      setRolls(freshRolls);
    }
    setCleaning(false);
  };

  const showMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, MAX_ROLLS));
  };

  const visibleRolls = rolls.slice(0, visibleCount);
  const hasMore = visibleCount < rolls.length;
  const totalSum = lastResults.reduce((sum, r) => sum + r.result, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-[var(--text-muted)] italic">
        <div className="spinner" />
        <span>Carregando a taverna...</span>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-5 py-4 pb-10 gap-2 flex flex-col">
      {/* Adventurers */}
      <section className="mb-5">
        <h2
          className="text-xs text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 pb-2.5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Aventureiros
          <span
            className="text-[0.65rem] bg-[rgba(201,165,90,0.08)] text-(--gold-dark) px-2 py-0.5 rounded-md"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {profiles.length}
          </span>
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 pl-1 pr-3 py-1 bg-(--bg-card) border border-[rgba(201,165,90,0.06)] rounded-full shrink-0"
            >
              <Avatar url={p.avatar_url} name={p.display_name} size="sm" />
              <span className="text-sm font-semibold whitespace-nowrap text-(--text-primary)">
                {p.id === user?.id ? "Você" : p.display_name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,165,90,0.1)] to-transparent mb-4" />

      {/* Dice selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 scrollbar-none">
        {DICE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedDice(type)}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg min-w-[48px] shrink-0 transition-all border cursor-pointer
              ${
                selectedDice === type
                  ? "bg-[rgba(201,165,90,0.08)] border-[var(--gold)] shadow-[0_0_10px_rgba(201,165,90,0.08)]"
                  : "bg-[var(--bg-card)] border-[rgba(201,165,90,0.06)] hover:bg-[var(--bg-elevated)] hover:border-[rgba(201,165,90,0.15)]"
              }`}
          >
            <span className="text-base text-[var(--gold)]">
              {DICE_CONFIG[type].icon}
            </span>
            <span
              className={`text-[0.6rem] font-semibold ${selectedDice === type ? "text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {DICE_CONFIG[type].label}
            </span>
          </button>
        ))}
      </div>

      {/* Quantity selector */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="text-sm text-[var(--text-secondary)]">
          Quantidade:
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] text-[var(--gold)] font-bold text-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span
            className="w-10 text-center text-lg font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {quantity}
          </span>
          <button
            onClick={() => setQuantity((q) => Math.min(10, q + 1))}
            disabled={quantity >= 10}
            className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] text-[var(--gold)] font-bold text-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
        <span
          className="text-xs text-[var(--text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {quantity}
          {DICE_CONFIG[selectedDice].label}
        </span>
      </div>

      {/* Roll button */}
      <div className="flex flex-col items-center gap-3 py-3 mb-4">
        <button
          onClick={handleRoll}
          disabled={isRolling}
          className="flex flex-col items-center gap-2.5 bg-transparent border-none cursor-pointer p-3 active:scale-95 transition-transform disabled:cursor-default"
        >
          <div
            className={`
            w-28 h-28 flex items-center justify-center rounded-2xl
            bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)]
            border-2 transition-all relative overflow-hidden
            ${
              isRolling
                ? "border-[var(--gold)] shadow-[0_8px_40px_rgba(0,0,0,0.7),0_0_36px_rgba(201,165,90,0.18)]"
                : "border-[rgba(201,165,90,0.15)] shadow-[0_8px_40px_rgba(0,0,0,0.7)] hover:border-[var(--gold)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.7),0_0_24px_rgba(201,165,90,0.1)]"
            }
          `}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(201,165,90,0.05)_0%,transparent_60%)]" />
            {isRolling ? (
              <span
                className="text-5xl font-black text-[var(--text-primary)] relative z-10 anim-dice"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ?
              </span>
            ) : lastResults.length === 1 ? (
              <span
                className={`text-5xl font-black relative z-10 anim-bounce
                ${isCriticalHit(lastResults[0].dice_type, lastResults[0].result) ? "crit-hit" : ""}
                ${isCriticalFail(lastResults[0].dice_type, lastResults[0].result) ? "crit-fail" : ""}
              `}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {lastResults[0].result}
              </span>
            ) : lastResults.length > 1 ? (
              <div className="flex flex-col items-center relative z-10 anim-bounce">
                <span
                  className="text-3xl font-black text-[var(--gold)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {totalSum}
                </span>
                <span
                  className="text-[0.6rem] text-[var(--text-muted)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  total
                </span>
              </div>
            ) : (
              <span
                className="text-xl text-[var(--text-muted)] relative z-10"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {quantity > 1
                  ? `${quantity}${DICE_CONFIG[selectedDice].label}`
                  : DICE_CONFIG[selectedDice].label}
              </span>
            )}
          </div>
          {!isRolling && (
            <span className="text-xs text-[var(--text-muted)] italic">
              {lastResults.length > 0
                ? "Toque para rolar"
                : `Rolar ${quantity > 1 ? quantity : ""}${DICE_CONFIG[selectedDice].label}`}
            </span>
          )}
        </button>

        {/* Multi-dice results breakdown */}
        {lastResults.length > 1 && !isRolling && (
          <div className="flex flex-wrap justify-center gap-1.5 anim-fade">
            {lastResults.map((r, i) => (
              <span
                key={r.id}
                className={`
                  px-2.5 py-1 rounded-lg text-sm font-bold border
                  ${
                    isCriticalHit(r.dice_type, r.result)
                      ? "bg-[rgba(255,215,0,0.08)] border-[rgba(255,215,0,0.2)] crit-hit"
                      : isCriticalFail(r.dice_type, r.result)
                        ? "bg-[rgba(196,64,64,0.08)] border-[rgba(196,64,64,0.2)] crit-fail"
                        : "bg-[var(--bg-card)] border-[rgba(201,165,90,0.08)] text-[var(--text-primary)]"
                  }
                `}
                style={{
                  fontFamily: "var(--font-display)",
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                {r.result}
              </span>
            ))}
          </div>
        )}

        {/* Critical banners */}
        {lastResults.length === 1 &&
          !isRolling &&
          isCriticalHit(lastResults[0].dice_type, lastResults[0].result) && (
            <div
              className="text-base font-bold text-[var(--crit-gold)] anim-bounce"
              style={{
                fontFamily: "var(--font-display)",
                textShadow: "0 0 18px rgba(255,215,0,0.4)",
              }}
            >
              ⚔️ ACERTO CRÍTICO! ⚔️
            </div>
          )}
        {lastResults.length === 1 &&
          !isRolling &&
          isCriticalFail(lastResults[0].dice_type, lastResults[0].result) && (
            <div
              className="text-base font-bold text-[var(--crit-fail)] anim-shake"
              style={{
                fontFamily: "var(--font-display)",
                textShadow: "0 0 18px rgba(196,64,64,0.4)",
              }}
            >
              💀 FALHA CRÍTICA! 💀
            </div>
          )}
      </div>

      {/* Roll history */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-xs text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Últimas rolagens
          </h3>
          {rolls.length > 0 && (
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              className="text-[0.65rem] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors disabled:opacity-50"
            >
              {cleaning ? "Limpando..." : "🗑️ Limpar antigas"}
            </button>
          )}
        </div>

        {rolls.length === 0 ? (
          <p className="text-center text-[var(--text-muted)] italic py-5 text-sm">
            Nenhuma rolagem ainda. Seja o primeiro!
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              {visibleRolls.map((roll, i) => {
                const crit = isCriticalHit(roll.dice_type, roll.result);
                const fail = isCriticalFail(roll.dice_type, roll.result);
                const isOwn = roll.user_id === user?.id;
                const name = roll.profile?.display_name ?? "Anônimo";

                return (
                  <div
                    key={roll.id}
                    className={`
                      flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg border transition-colors
                      ${
                        crit
                          ? "border-[rgba(255,215,0,0.12)] bg-[rgba(255,215,0,0.02)]"
                          : fail
                            ? "border-[rgba(196,64,64,0.12)] bg-[rgba(196,64,64,0.02)]"
                            : isOwn
                              ? "border-transparent bg-[rgba(201,165,90,0.02)]"
                              : "border-transparent hover:bg-[var(--bg-card)]"
                      }
                      anim-fade
                    `}
                    style={{ animationDelay: `${Math.min(i, 4) * 0.05}s` }}
                  >
                    <Avatar
                      url={roll.profile?.avatar_url}
                      name={name}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                        {isOwn ? "Você" : name.split(" ")[0]}
                      </span>
                      <span className="block text-[0.68rem] text-[var(--text-muted)]">
                        {formatRelativeTime(roll.created_at)}
                      </span>
                    </div>
                    <span
                      className="text-[0.6rem] font-semibold text-[var(--text-muted)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {DICE_CONFIG[roll.dice_type].label}
                    </span>
                    <span
                      className={`
                      text-xl font-black min-w-[28px] text-right
                      ${crit ? "crit-hit" : fail ? "crit-fail" : "text-[var(--text-primary)]"}
                    `}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {roll.result}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Show more button */}
            {hasMore && (
              <button
                onClick={showMore}
                className="w-full mt-3 py-2.5 text-sm font-semibold text-[var(--gold-dark)] hover:text-[var(--gold)] bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] hover:border-[rgba(201,165,90,0.2)] rounded-lg transition-all"
              >
                Ver mais ({Math.min(rolls.length - visibleCount, PAGE_SIZE)}{" "}
                rolagens)
              </button>
            )}

            {/* Roll count info */}
            <p
              className="text-center text-[0.65rem] text-[var(--text-muted)] mt-2"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {visibleCount >= rolls.length
                ? `${rolls.length}`
                : `${visibleCount} de ${rolls.length}`}{" "}
              rolagens · máx {MAX_ROLLS}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
