/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchPicksByDate,
  fetchMyPickForDate,
  fetchAvailableDates,
  resolveMusicMeta,
  savePick,
  deletePick,
  toggleLike,
  subscribePicksByDate,
  subscribeLikesByDate,
  todayDateStr,
  type MusicPick,
  type MusicMeta,
} from "./musicService";

// ─── helpers ────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayDateStr();
  const yesterday = (() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  if (dateStr === today) return "Hoje";
  if (dateStr === yesterday) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const SOURCE_COLORS = {
  youtube: "#FF0000",
  spotify: "#1DB954",
};

const SOURCE_ICONS = {
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  spotify: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
};

const TYPE_LABEL: Record<string, string> = {
  track: "Música",
  album: "Álbum",
  playlist: "Playlist",
  video: "Vídeo",
};

// ─── PickCard ────────────────────────────────────────────────────
function PickCard({
  pick,
  isMe,
  canLike,
  onDelete,
  onLike,
}: {
  pick: MusicPick;
  isMe: boolean;
  canLike: boolean;
  onDelete: () => void;
  onLike: () => void;
}) {
  const { user } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);

  const handleLike = () => {
    if (!canLike && !pick.liked_by_me) return;
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 300);
    onLike();
  };

  return (
    <div className="relative flex gap-3 p-3 rounded-2xl bg-[var(--bg-card)] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] transition-all group">
      {/* Thumbnail */}
      <a
        href={pick.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center"
      >
        {pick.thumbnail && !imgError ? (
          <img
            src={pick.thumbnail}
            alt={pick.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-2xl opacity-40">🎵</span>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-lg">▶</span>
        </div>
      </a>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <p className="text-sm font-semibold text-(--text-primary) leading-tight line-clamp-1">
            {pick.title}
          </p>
          {pick.artist && (
            <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-1">
              {pick.artist}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: `${SOURCE_COLORS[pick.source]}18`,
              color: SOURCE_COLORS[pick.source],
            }}
          >
            {SOURCE_ICONS[pick.source]}
            {pick.source}
          </span>
          <span className="text-[10px] text-(--text-muted) px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.04)]">
            {TYPE_LABEL[pick.media_type]}
          </span>
          {pick.duration_ms && (
            <span className="text-[10px] text-(--text-muted)">
              {formatDuration(pick.duration_ms)}
            </span>
          )}
        </div>
      </div>

      {/* Right col: avatar + like + delete */}
      <div className="shrink-0 flex flex-col items-end justify-between py-0.5 gap-1">
        <div className="flex gap-1 justify-center items-center">
          <Avatar
            url={pick.profile?.avatar_url ?? null}
            name={pick.profile?.display_name ?? "?"}
            size="sm"
          />
          <span className={`text-xs`}>
            {pick.profile?.id !== user?.id &&
              pick.profile?.display_name?.split(" ")[0]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Like button */}
          <button
            onClick={handleLike}
            disabled={!canLike && !pick.liked_by_me}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all
              ${
                pick.liked_by_me
                  ? "text-[var(--gold)] bg-[rgba(201,165,90,0.15)] border border-[rgba(201,165,90,0.3)]"
                  : canLike
                    ? "text-(--text-muted) bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] hover:text-(--gold) hover:bg-[rgba(201,165,90,0.08)] hover:border-[rgba(201,165,90,0.2)]"
                    : "text-(--text-muted) opacity-40 cursor-default border border-transparent"
              } ${likeAnim ? "scale-110" : "scale-100"}`}
            style={{ transition: "all 0.15s ease" }}
            title={pick.liked_by_me ? "Remover like" : canLike ? "Curtir" : ""}
          >
            <span className="text-sm leading-none">
              {pick.liked_by_me ? "❤️" : "🖤"}
            </span>
            {pick.like_count > 0 && (
              <span className="text-sm">{pick.like_count}</span>
            )}
          </button>

          {isMe && (
            <button
              onClick={onDelete}
              className="text-(--text-muted) hover:text-(--red) text-xs transition-colors p-0.5"
              title="Remover indicação"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddPickModal ────────────────────────────────────────────────
function AddPickModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (meta: MusicMeta) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<MusicMeta | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setError("");
    setMeta(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setResolving(true);
      const result = await resolveMusicMeta(val.trim());
      setResolving(false);
      if (result) {
        setMeta(result);
      } else {
        setError("Link não reconhecido. Use YouTube ou Spotify.");
      }
    }, 600);
  };

  const handleSave = async () => {
    if (!meta) return;
    setSaving(true);
    await onSave(meta);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-deep)] rounded-t-3xl sm:rounded-3xl border border-[rgba(255,255,255,0.07)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-base font-bold text-(--text-primary)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Indicar Música
          </h2>
          <button
            onClick={onClose}
            className="text-(--text-muted) hover:text-(--text-primary) text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        <label className="text-xs text-(--text-muted) mb-1.5 block">
          Cole o link do YouTube ou Spotify
        </label>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://open.spotify.com/track/... ou youtu.be/..."
          className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3.5 py-3 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-[rgba(201,165,90,0.4)] transition-colors"
        />

        {/* Resolving */}
        {resolving && (
          <div className="flex items-center gap-2 mt-3 text-xs text-(--text-muted)">
            <div className="w-3.5 h-3.5 border border-(--text-muted) border-t-transparent rounded-full animate-spin" />
            Buscando informações...
          </div>
        )}

        {/* Error */}
        {error && !resolving && (
          <p className="mt-2 text-xs text-(--red)">{error}</p>
        )}

        {/* Preview */}
        {meta && !resolving && (
          <div className="mt-3 flex gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.06)]">
            {meta.thumbnail ? (
              <img
                src={meta.thumbnail}
                alt={meta.title}
                className="w-14 h-14 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-[var(--bg-card)] flex items-center justify-center text-2xl shrink-0">
                🎵
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-(--text-primary) line-clamp-2 leading-snug">
                {meta.title}
              </p>
              {meta.artist && (
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {meta.artist}
                </p>
              )}
              <div className="flex gap-1.5 mt-1.5">
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: `${SOURCE_COLORS[meta.source]}18`,
                    color: SOURCE_COLORS[meta.source],
                  }}
                >
                  {SOURCE_ICONS[meta.source]}
                  {meta.source}
                </span>
                <span className="text-[10px] text-(--text-muted) px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)]">
                  {TYPE_LABEL[meta.media_type]}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!meta || saving || resolving}
          className="mt-4 w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
          style={{
            background: meta
              ? "linear-gradient(135deg, rgba(201,165,90,0.25), rgba(201,165,90,0.12))"
              : undefined,
            border: "1px solid rgba(201,165,90,0.2)",
            color: "var(--gold)",
          }}
        >
          {saving ? "Salvando..." : "Indicar para hoje 🎵"}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────
function sortByLikes(picks: MusicPick[]): MusicPick[] {
  return [...picks].sort((a, b) => {
    if (b.like_count !== a.like_count) return b.like_count - a.like_count;
    return a.created_at.localeCompare(b.created_at);
  });
}

// ─── Main Page ────────────────────────────────────────────────────
export function MusicasPage() {
  const { user, profile } = useAuth();
  const today = todayDateStr();

  const [selectedDate, setSelectedDate] = useState(today);
  const [picks, setPicks] = useState<MusicPick[]>([]);
  const [myPick, setMyPick] = useState<MusicPick | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Load dates
  useEffect(() => {
    fetchAvailableDates().then((dates) => {
      const all = dates.includes(today) ? dates : [today, ...dates];
      setAvailableDates(all);
    });
  }, [today]);

  // Load picks for selected date
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPicksByDate(selectedDate, user?.id),
      user ? fetchMyPickForDate(user.id, selectedDate) : Promise.resolve(null),
    ]).then(([p, mine]) => {
      // sort by likes desc, ties broken by created_at asc
      setPicks(sortByLikes(p));
      setMyPick(mine);
      setLoading(false);
    });
  }, [selectedDate, user]);

  // Realtime picks
  useEffect(() => {
    if (selectedDate !== today) return;
    const ch = subscribePicksByDate(
      selectedDate,
      (pick) => {
        setPicks((prev) => {
          if (prev.some((p) => p.id === pick.id)) return prev;
          return sortByLikes([
            ...prev,
            { ...pick, like_count: 0, liked_by_me: false },
          ]);
        });
        if (pick.user_id === user?.id) setMyPick(pick);
      },
      (id) => {
        setPicks((prev) => prev.filter((p) => p.id !== id));
        setMyPick((prev) => (prev?.id === id ? null : prev));
      },
    );
    return () => {
      ch.unsubscribe();
    };
  }, [selectedDate, today, user?.id]);

  // Realtime likes — só aplica em picks conhecidos e ignora eventos próprios
  // (os próprios já foram tratados pelo optimistic update no handleLike)
  useEffect(() => {
    const ch = subscribeLikesByDate(
      selectedDate,
      (pickId, delta, fromUserId) => {
        // Ignora eventos do próprio usuário — já foram aplicados optimisticamente
        if (fromUserId === user?.id) return;
        setPicks((prev) => {
          // Só atualiza se o pick pertence à data selecionada (está na lista)
          if (!prev.some((p) => p.id === pickId)) return prev;
          return sortByLikes(
            prev.map((p) =>
              p.id === pickId
                ? { ...p, like_count: Math.max(0, p.like_count + delta) }
                : p,
            ),
          );
        });
      },
    );
    return () => {
      ch.unsubscribe();
    };
  }, [selectedDate, user?.id]);

  const handleLike = async (pick: MusicPick) => {
    if (!user) return;
    const wasLiked = pick.liked_by_me;
    // Optimistic update — não espera o realtime, que vai ser ignorado para o próprio user
    setPicks((prev) =>
      sortByLikes(
        prev.map((p) =>
          p.id === pick.id
            ? {
                ...p,
                liked_by_me: !wasLiked,
                like_count: Math.max(0, p.like_count + (wasLiked ? -1 : 1)),
              }
            : p,
        ),
      ),
    );
    const { liked, error } = await toggleLike(user.id, pick.id, wasLiked);
    if (error) {
      // Reverte em caso de erro
      setPicks((prev) =>
        sortByLikes(
          prev.map((p) =>
            p.id === pick.id
              ? {
                  ...p,
                  liked_by_me: wasLiked,
                  like_count: Math.max(0, p.like_count + (wasLiked ? 1 : -1)),
                }
              : p,
          ),
        ),
      );
      showToast("Erro ao registrar like.");
    }
    // Se o servidor retornou estado diferente do esperado (ex: race condition), sincroniza
    if (!error && liked !== !wasLiked) {
      setPicks((prev) =>
        sortByLikes(
          prev.map((p) =>
            p.id === pick.id ? { ...p, liked_by_me: liked } : p,
          ),
        ),
      );
    }
  };

  const handleSave = async (meta: MusicMeta) => {
    if (!user) return;
    const { data, error } = await savePick(user.id, meta);
    if (error) {
      showToast(error);
      return;
    }
    if (data) {
      setShowAdd(false);
      const enriched = {
        ...data,
        like_count: 0,
        liked_by_me: false,
        profile: {
          id: user.id,
          display_name: profile?.display_name ?? "",
          avatar_url: profile?.avatar_url ?? null,
        },
      };
      setMyPick(enriched);
      setPicks((prev) =>
        sortByLikes([...prev.filter((p) => p.user_id !== user.id), enriched]),
      );
      showToast("Indicação salva! 🎵");
    }
  };

  const handleDelete = async (pickId: string) => {
    await deletePick(pickId);
    setPicks((prev) => prev.filter((p) => p.id !== pickId));
    setMyPick(null);
    showToast("Indicação removida.");
  };

  const isToday = selectedDate === today;
  const canAdd = isToday && !myPick;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h1
              className="text-xl text-(--gold) leading-none"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Músicas de Hoje
            </h1>
            <p className="text-sm text-(--text-muted) mt-1.5">
              Uma indicação por pessoa por dia
            </p>
          </div>
          {canAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-(--gold) transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: "rgba(201,165,90,0.12)",
                border: "1px solid rgba(201,165,90,0.2)",
              }}
            >
              <span className="text-base leading-none">+</span> Indicar
            </button>
          )}
        </div>
      </div>

      {/* Date tabs */}
      <div className="px-5 mb-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max">
          {(availableDates.length ? availableDates : [today]).map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
              style={
                selectedDate === d
                  ? {
                      background: "rgba(201,165,90,0.18)",
                      color: "var(--gold)",
                      border: "1px solid rgba(201,165,90,0.3)",
                    }
                  : {
                      background: "var(--bg-card)",
                      color: "var(--text-muted)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }
              }
            >
              {formatDate(d)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-8 max-w-[500px] mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : picks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl opacity-30">🎵</span>
            <p className="text-sm text-(--text-muted) text-center">
              {isToday
                ? "Ninguém indicou nada ainda hoje."
                : "Nenhuma indicação neste dia."}
            </p>
            {canAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-1 px-4 py-2 rounded-xl text-sm font-bold text-(--gold) transition-all hover:-translate-y-0.5"
                style={{
                  background: "rgba(201,165,90,0.12)",
                  border: "1px solid rgba(201,165,90,0.2)",
                }}
              >
                Seja o primeiro! 🎵
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {picks.map((pick) => (
              <PickCard
                key={pick.id}
                pick={pick}
                isMe={pick.user_id === user?.id}
                canLike={!!user && pick.user_id !== user.id}
                onDelete={() => handleDelete(pick.id)}
                onLike={() => handleLike(pick)}
              />
            ))}

            {/* Minha vez */}
            {canAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-3 p-3 rounded-2xl border border-dashed border-[rgba(201,165,90,0.2)] text-(--text-muted) hover:text-(--gold) hover:border-[rgba(201,165,90,0.35)] transition-all group"
              >
                <div className="w-16 h-16 rounded-xl bg-[rgba(201,165,90,0.05)] flex items-center justify-center text-2xl group-hover:bg-[rgba(201,165,90,0.1)] transition-colors shrink-0">
                  +
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">
                    Adicionar minha indicação
                  </p>
                  <p className="text-xs opacity-60 mt-0.5">
                    YouTube ou Spotify
                  </p>
                </div>
              </button>
            )}

            {/* Já indiquei hoje */}
            {isToday && myPick && (
              <p className="text-center text-xs text-(--text-muted) pt-1">
                Você já indicou hoje ✓
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showAdd && (
        <AddPickModal onClose={() => setShowAdd(false)} onSave={handleSave} />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium text-(--text-primary) shadow-[0_4px_20px_rgba(0,0,0,0.5)] pointer-events-none animate-[fadeIn_0.2s_ease]"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
