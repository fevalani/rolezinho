import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchRolls,
  performRoll,
  subscribeToRolls,
  fetchProfiles,
} from "./tavernaService";
import {
  isCriticalHit,
  isCriticalFail,
  formatRelativeTime,
  getInitials,
} from "@/lib/utils";
import type { DiceType, DiceRoll, Profile } from "@/lib/types";
import { DICE_CONFIG, DICE_TYPES } from "@/lib/types";
import styles from "./TavernaPage.module.css";

const AVATAR_COLORS = [
  "#c9a55a",
  "#8b5cf6",
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
];

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function TavernaPage() {
  const { user, profile } = useAuth();
  const [selectedDice, setSelectedDice] = useState<DiceType>("d20");
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const rollSoundRef = useRef<boolean>(false);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const [rollData, profileData] = await Promise.all([
        fetchRolls(50),
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
      // Avoid duplicating our own rolls (already added optimistically)
      if (rollSoundRef.current && newRoll.user_id === user?.id) {
        rollSoundRef.current = false;
        return;
      }
      setRolls((prev) => {
        // Deduplicate
        if (prev.some((r) => r.id === newRoll.id)) return prev;
        return [newRoll, ...prev].slice(0, 50);
      });
    });
    return unsub;
  }, [user?.id]);

  const handleRoll = useCallback(async () => {
    if (isRolling || !user) return;
    setIsRolling(true);

    // Animation delay
    await new Promise((r) => setTimeout(r, 550));

    rollSoundRef.current = true;
    const roll = await performRoll(user.id, selectedDice);

    if (roll) {
      // Add profile info if missing
      if (!roll.profile && profile) {
        roll.profile = profile;
      }
      setLastRoll(roll);
      setRolls((prev) =>
        [roll, ...prev.filter((r) => r.id !== roll.id)].slice(0, 50),
      );
    }

    setIsRolling(false);
  }, [isRolling, user, profile, selectedDice]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <span>Carregando a taverna...</span>
      </div>
    );
  }

  return (
    <div className={`container ${styles.page}`}>
      {/* Adventurers */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Aventureiros
          <span className={styles.count}>{profiles.length}</span>
        </h2>
        <div className={styles.userScroll}>
          {profiles.map((p) => (
            <div key={p.id} className={styles.userChip}>
              {p.avatar_url ? (
                <div className="avatar avatar-sm">
                  <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <div
                  className="avatar avatar-sm avatar-initials"
                  style={{ background: userColor(p.id) }}
                >
                  {getInitials(p.display_name)}
                </div>
              )}
              <span className={styles.userChipName}>
                {p.id === user?.id ? "Você" : p.display_name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="divider" />

      {/* Dice selector */}
      <div className={styles.diceBar}>
        {DICE_TYPES.map((type) => (
          <button
            key={type}
            className={`${styles.diceBtn} ${selectedDice === type ? styles.diceBtnActive : ""}`}
            onClick={() => setSelectedDice(type)}
            data-testid={`dice-select-${type}`}
          >
            <span className={styles.diceIcon}>{DICE_CONFIG[type].icon}</span>
            <span className={styles.diceLabel}>{DICE_CONFIG[type].label}</span>
          </button>
        ))}
      </div>

      {/* Roll area */}
      <div className={styles.rollArea}>
        <button
          className={`${styles.rollBtn} ${isRolling ? styles.rolling : ""}`}
          onClick={handleRoll}
          disabled={isRolling}
          data-testid="roll-button"
        >
          <div className={styles.diceShape}>
            {isRolling ? (
              <span className={`${styles.rollVal} anim-dice`}>?</span>
            ) : lastRoll ? (
              <span
                className={`${styles.rollVal} dice-result anim-bounce ${
                  isCriticalHit(lastRoll.dice_type, lastRoll.result)
                    ? "crit-hit"
                    : ""
                } ${isCriticalFail(lastRoll.dice_type, lastRoll.result) ? "crit-fail" : ""}`}
              >
                {lastRoll.result}
              </span>
            ) : (
              <span className={styles.rollPlaceholder}>
                {DICE_CONFIG[selectedDice].label}
              </span>
            )}
          </div>
          {!isRolling && (
            <span className={styles.rollHint}>
              {lastRoll
                ? "Toque para rolar"
                : `Rolar ${DICE_CONFIG[selectedDice].label}`}
            </span>
          )}
        </button>

        {lastRoll &&
          !isRolling &&
          isCriticalHit(lastRoll.dice_type, lastRoll.result) && (
            <div className={`${styles.critBanner} anim-bounce`}>
              ⚔️ ACERTO CRÍTICO! ⚔️
            </div>
          )}
        {lastRoll &&
          !isRolling &&
          isCriticalFail(lastRoll.dice_type, lastRoll.result) && (
            <div className={`${styles.failBanner} anim-shake`}>
              💀 FALHA CRÍTICA! 💀
            </div>
          )}
      </div>

      {/* Roll history */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Últimas rolagens</h3>
        {rolls.length === 0 ? (
          <p className={styles.emptyMsg}>
            Nenhuma rolagem ainda. Seja o primeiro!
          </p>
        ) : (
          <div className={styles.rollList}>
            {rolls.map((roll, i) => {
              const crit = isCriticalHit(roll.dice_type, roll.result);
              const fail = isCriticalFail(roll.dice_type, roll.result);
              const isOwn = roll.user_id === user?.id;
              const displayName = roll.profile?.display_name ?? "Anônimo";
              const avatarUrl = roll.profile?.avatar_url;

              return (
                <div
                  key={roll.id}
                  className={`${styles.rollItem} ${crit ? styles.rollCrit : ""} ${fail ? styles.rollFail : ""} ${isOwn ? styles.rollOwn : ""} anim-fade d${Math.min(i + 1, 5)}`}
                  data-testid={`roll-${roll.id}`}
                >
                  {avatarUrl ? (
                    <div className="avatar avatar-sm">
                      <img
                        src={avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div
                      className="avatar avatar-sm avatar-initials"
                      style={{ background: userColor(roll.user_id) }}
                    >
                      {getInitials(displayName)}
                    </div>
                  )}
                  <div className={styles.rollInfo}>
                    <span className={styles.rollName}>
                      {isOwn ? "Você" : displayName.split(" ")[0]}
                    </span>
                    <span className={styles.rollTime}>
                      {formatRelativeTime(roll.created_at)}
                    </span>
                  </div>
                  <div className={styles.rollResult}>
                    <span className={styles.rollType}>
                      {DICE_CONFIG[roll.dice_type].label}
                    </span>
                    <span
                      className={`${styles.rollValue} dice-result ${crit ? "crit-hit" : ""} ${fail ? "crit-fail" : ""}`}
                    >
                      {roll.result}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
