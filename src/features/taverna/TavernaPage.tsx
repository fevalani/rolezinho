import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import type { DiceType, DiceRoll, Profile, RollGroup } from "@/lib/types";
import { DICE_CONFIG, DICE_TYPES } from "@/lib/types";

const PAGE_SIZE = 10;
const MAX_ROLLS = 50;

/** Groups rolls by batch_id (multi-dice) or keeps singles as-is */
function groupRolls(rolls: DiceRoll[]): RollGroup[] {
  const groups: RollGroup[] = [];
  const batchMap = new Map<string, DiceRoll[]>();

  for (const roll of rolls) {
    if (roll.batch_id) {
      const existing = batchMap.get(roll.batch_id);
      if (existing) {
        existing.push(roll);
      } else {
        batchMap.set(roll.batch_id, [roll]);
      }
    } else {
      groups.push({
        key: roll.id,
        user_id: roll.user_id,
        dice_type: roll.dice_type,
        rolls: [roll],
        total: roll.result,
        created_at: roll.created_at,
        profile: roll.profile,
      });
    }
  }

  for (const [batchId, batchRolls] of batchMap) {
    const sorted = batchRolls.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    groups.push({
      key: batchId,
      user_id: sorted[0].user_id,
      dice_type: sorted[0].dice_type,
      rolls: sorted,
      total: sorted.reduce((s, r) => s + r.result, 0),
      created_at: sorted[0].created_at,
      profile: sorted[0].profile,
    });
  }

  return groups.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

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
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const skipRealtimeRef = useRef(new Set<string>());

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

  const handleRoll = useCallback(async () => {
    if (isRolling || !user) return;
    setIsRolling(true);
    setLastResults([]);

    await new Promise((r) => setTimeout(r, 500));

    const results = await performMultiRoll(user.id, selectedDice, quantity);

    if (results.length > 0) {
      const withProfile = results.map((r) => ({
        ...r,
        profile: r.profile ?? profile ?? undefined,
      }));

      withProfile.forEach((r) => skipRealtimeRef.current.add(r.id));

      setLastResults(withProfile);
      setRolls((prev) => {
        const ids = new Set(withProfile.map((r) => r.id));
        const filtered = prev.filter((r) => !ids.has(r.id));
        return [...withProfile, ...filtered]
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

  const handleCleanup = async () => {
    setCleaning(true);
    const deleted = await cleanupOldRolls();
    if (deleted > 0) {
      const freshRolls = await fetchRolls(MAX_ROLLS);
      setRolls(freshRolls);
    }
    setCleaning(false);
  };

  // Filter rolls by user
  const filteredRolls = useMemo(() => {
    if (!filterUserId) return rolls;
    return rolls.filter((r) => r.user_id === filterUserId);
  }, [rolls, filterUserId]);

  // Group filtered rolls
  const rollGroups = useMemo(() => groupRolls(filteredRolls), [filteredRolls]);

  const visibleGroups = rollGroups.slice(0, visibleCount);
  const hasMore = visibleCount < rollGroups.length;
  const totalSum = lastResults.reduce((sum, r) => sum + r.result, 0);

  const showMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, MAX_ROLLS));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-[var(--text-muted)] italic">
        <div className="spinner" />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-5 py-4 pb-10 flex flex-col gap-2">
      {/* Adventurers — clickable for filter */}
      <section className="mb-3">
        <h2
          className="text-xs text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 pb-2.5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Aventureiros
          <span
            className="text-[0.65rem] bg-[rgba(201,165,90,0.08)] text-[var(--gold-dark)] px-2 py-0.5 rounded-md"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {profiles.length}
          </span>
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {/* "Todos" chip */}
          <button
            onClick={() => {
              setFilterUserId(null);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 text-sm font-semibold transition-all border cursor-pointer
              ${
                !filterUserId
                  ? "bg-[rgba(201,165,90,0.12)] border-[var(--gold)] text-[var(--gold)]"
                  : "bg-[var(--bg-card)] border-[rgba(201,165,90,0.06)] text-[var(--text-secondary)] hover:border-[rgba(201,165,90,0.2)]"
              }`}
          >
            Todos
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setFilterUserId(filterUserId === p.id ? null : p.id);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full shrink-0 transition-all border cursor-pointer
                ${
                  filterUserId === p.id
                    ? "bg-[rgba(201,165,90,0.12)] border-[var(--gold)]"
                    : "bg-[var(--bg-card)] border-[rgba(201,165,90,0.06)] hover:border-[rgba(201,165,90,0.2)]"
                }`}
            >
              <Avatar url={p.avatar_url} name={p.display_name} size="sm" />
              <span
                className={`text-sm font-semibold whitespace-nowrap ${filterUserId === p.id ? "text-[var(--gold)]" : "text-[var(--text-primary)]"}`}
              >
                {p.id === user?.id ? "Você" : p.display_name.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,165,90,0.1)] to-transparent mb-2" />

      {/* Dice selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
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
      <div className="flex items-center justify-center gap-3 mb-3">
        <span className="text-sm text-[var(--text-secondary)]">Qtd:</span>
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
      <div className="flex flex-col items-center gap-3 py-2 mb-3">
        <button
          onClick={handleRoll}
          disabled={isRolling}
          className="flex flex-col items-center gap-2.5 bg-transparent border-none cursor-pointer p-3 active:scale-95 transition-transform disabled:cursor-default"
        >
          <div
            className={`w-28 h-28 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] border-2 transition-all relative overflow-hidden
            ${
              isRolling
                ? "border-[var(--gold)] shadow-[0_8px_40px_rgba(0,0,0,0.7),0_0_36px_rgba(201,165,90,0.18)]"
                : "border-[rgba(201,165,90,0.15)] shadow-[0_8px_40px_rgba(0,0,0,0.7)] hover:border-[var(--gold)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.7),0_0_24px_rgba(201,165,90,0.1)]"
            }`}
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
                ${isCriticalFail(lastResults[0].dice_type, lastResults[0].result) ? "crit-fail" : ""}`}
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

        {/* Multi-dice breakdown under the button */}
        {lastResults.length > 1 && !isRolling && (
          <div className="flex flex-wrap justify-center gap-1.5 anim-fade">
            {lastResults.map((r, i) => (
              <span
                key={r.id}
                className={`px-2.5 py-1 rounded-lg text-sm font-bold border
                  ${
                    isCriticalHit(r.dice_type, r.result)
                      ? "bg-[rgba(255,215,0,0.08)] border-[rgba(255,215,0,0.2)] crit-hit"
                      : isCriticalFail(r.dice_type, r.result)
                        ? "bg-[rgba(196,64,64,0.08)] border-[rgba(196,64,64,0.2)] crit-fail"
                        : "bg-[var(--bg-card)] border-[rgba(201,165,90,0.08)] text-[var(--text-primary)]"
                  }`}
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

        {/* Critical banners for single roll */}
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

      {/* ── Roll History (grouped) ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-xs text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Últimas rolagens
            {filterUserId && (
              <span className="normal-case tracking-normal ml-1 text-[var(--gold-dark)]">
                (filtrado)
              </span>
            )}
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

        {rollGroups.length === 0 ? (
          <p className="text-center text-[var(--text-muted)] italic py-5 text-sm">
            {filterUserId
              ? "Nenhuma rolagem deste jogador."
              : "Nenhuma rolagem ainda. Seja o primeiro!"}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              {visibleGroups.map((group, i) => {
                const isMulti = group.rolls.length > 1;
                const isOwn = group.user_id === user?.id;
                const name = group.profile?.display_name ?? "Anônimo";
                const hasCrit = group.rolls.some((r) =>
                  isCriticalHit(r.dice_type, r.result),
                );
                const hasFail = group.rolls.some((r) =>
                  isCriticalFail(r.dice_type, r.result),
                );

                return (
                  <div
                    key={group.key}
                    className={`flex items-center gap-2.5 py-2 px-2.5 rounded-lg border transition-colors anim-fade
                      ${
                        hasCrit
                          ? "border-[rgba(255,215,0,0.12)] bg-[rgba(255,215,0,0.02)]"
                          : hasFail
                            ? "border-[rgba(196,64,64,0.12)] bg-[rgba(196,64,64,0.02)]"
                            : isOwn
                              ? "border-transparent bg-[rgba(201,165,90,0.02)]"
                              : "border-transparent hover:bg-[var(--bg-card)]"
                      }`}
                    style={{ animationDelay: `${Math.min(i, 4) * 0.05}s` }}
                  >
                    <Avatar
                      url={group.profile?.avatar_url}
                      name={name}
                      size="sm"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {isOwn ? "Você" : name.split(" ")[0]}
                        </span>
                        <span
                          className="text-[0.6rem] font-semibold text-[var(--text-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {isMulti
                            ? `${group.rolls.length}${DICE_CONFIG[group.dice_type].label}`
                            : DICE_CONFIG[group.dice_type].label}
                        </span>
                      </div>

                      {/* Show individual results for multi-dice */}
                      {isMulti && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {group.rolls.map((r) => (
                            <span
                              key={r.id}
                              className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded
                                ${
                                  isCriticalHit(r.dice_type, r.result)
                                    ? "text-[var(--crit-gold)] bg-[rgba(255,215,0,0.08)]"
                                    : isCriticalFail(r.dice_type, r.result)
                                      ? "text-[var(--crit-fail)] bg-[rgba(196,64,64,0.08)]"
                                      : "text-[var(--text-muted)] bg-[var(--bg-card)]"
                                }`}
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {r.result}
                            </span>
                          ))}
                        </div>
                      )}

                      <span className="block text-[0.65rem] text-[var(--text-muted)] mt-0.5">
                        {formatRelativeTime(group.created_at)}
                      </span>
                    </div>

                    {/* Total / result */}
                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={`text-xl font-black min-w-[28px] text-right
                          ${hasCrit ? "crit-hit" : hasFail && !isMulti ? "crit-fail" : "text-[var(--text-primary)]"}`}
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {group.total}
                      </span>
                      {isMulti && (
                        <span
                          className="text-[0.55rem] text-[var(--text-muted)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          total
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <button
                onClick={showMore}
                className="w-full mt-3 py-2.5 text-sm font-semibold text-[var(--gold-dark)] hover:text-[var(--gold)] bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] hover:border-[rgba(201,165,90,0.2)] rounded-lg transition-all"
              >
                Ver mais (
                {Math.min(rollGroups.length - visibleCount, PAGE_SIZE)}{" "}
                rolagens)
              </button>
            )}

            <p
              className="text-center text-[0.65rem] text-[var(--text-muted)] mt-2"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {visibleCount >= rollGroups.length
                ? `${rollGroups.length}`
                : `${visibleCount} de ${rollGroups.length}`}{" "}
              rolagens
              {filterUserId ? " (filtrado)" : ""} · máx {MAX_ROLLS}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
