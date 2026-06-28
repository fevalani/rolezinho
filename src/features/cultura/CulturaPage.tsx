/* eslint-disable react-hooks/static-components */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  searchExternalItems,
  resolveSpotifyLink,
  type ExternalItem,
  type CulturaType,
} from "./culturaApi";
import {
  fetchAllPosts,
  createPost,
  deletePost,
  upsertItem,
  upsertInteraction,
  subscribeCultura,
  groupByWeek,
  currentWeekStr,
  TYPE_CONFIG,
  type CulturaPost,
  type WeekGroup,
} from "./culturaService";

// ══════════════════════════════════════════════════════════════
// Star Rating
// ══════════════════════════════════════════════════════════════

function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const stars = [1, 2, 3, 4, 5];
  const active = hover ?? value ?? 0;
  const sz = size === "sm" ? "text-sm" : "text-xl";

  return (
    <div className={`flex gap-0.5 ${readonly ? "" : "cursor-pointer"}`}>
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          disabled={readonly}
          className={`${sz} leading-none transition-all ${
            s <= active
              ? "text-(--gold) scale-110"
              : "text-[rgba(255,255,255,0.15)] hover:text-[rgba(201,165,90,0.5)]"
          } ${readonly ? "cursor-default scale-100" : ""}`}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(null)}
          onClick={() => {
            if (readonly || !onChange) return;
            onChange(value === s ? null : s);
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Type filter pills
// ══════════════════════════════════════════════════════════════

const ALL_TYPES: CulturaType[] = ["movie", "series", "book", "album"];

function TypeFilter({
  active,
  onChange,
}: {
  active: CulturaType | null;
  onChange: (t: CulturaType | null) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
      <button
        onClick={() => onChange(null)}
        className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0"
        style={
          active === null
            ? {
                background: "rgba(201,165,90,0.2)",
                color: "var(--gold)",
                border: "1px solid rgba(201,165,90,0.35)",
              }
            : {
                background: "var(--bg-card)",
                color: "var(--text-muted)",
                border: "1px solid rgba(255,255,255,0.05)",
              }
        }
      >
        Tudo
      </button>
      {ALL_TYPES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(active === t ? null : t)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0"
          style={
            active === t
              ? {
                  background: "rgba(201,165,90,0.2)",
                  color: "var(--gold)",
                  border: "1px solid rgba(201,165,90,0.35)",
                }
              : {
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }
          }
        >
          {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].plural}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// User filter carousel
// ══════════════════════════════════════════════════════════════

function UserFilter({
  users,
  selected,
  onToggle,
}: {
  users: { id: string; display_name: string; avatar_url: string | null }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!users.length) return null;
  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-none p-2">
      {users.map((u) => {
        const isActive = selected.has(u.id);
        return (
          <button
            key={u.id}
            onClick={() => onToggle(u.id)}
            className="flex flex-col items-center gap-1 shrink-0 transition-all"
          >
            <div
              className={`rounded-full transition-all ${
                isActive
                  ? "ring-2 ring-(--gold) ring-offset-2 ring-offset-[var(--bg-deep)]"
                  : "opacity-50 hover:opacity-80"
              }`}
            >
              <Avatar url={u.avatar_url} name={u.display_name} size="md" />
            </div>
            <span
              className={`text-[10px] font-medium max-w-[48px] truncate transition-colors ${isActive ? "text-(--gold)" : "text-(--text-muted)"}`}
            >
              {u.display_name.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Post Card
// ══════════════════════════════════════════════════════════════

function PostCard({
  post,
  currentUserId,
  onDelete,
  onRate,
  onWatched,
}: {
  post: CulturaPost;
  currentUserId?: string;
  onDelete: () => void;
  onRate: (rating: number | null) => void;
  onWatched: (watched: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const isMe = post.user_id === currentUserId;
  const cfg = TYPE_CONFIG[post.item.type];
  const watched = post.my_interaction?.watched ?? false;
  const myRating = post.my_interaction?.global_rating ?? null;

  return (
    <div
      className={`${isMe || watched ? "bg-[#1d1d44]" : "bg-[var(--bg-card)]"} rounded-2xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.09)] transition-all overflow-hidden`}
    >
      <div
        role="button"
        tabIndex={0}
        className="w-full text-left flex gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        {/* Cover */}
        <div className="shrink-0 w-14 h-20 rounded-xl overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center">
          {post.item.cover_url && !imgErr ? (
            <img
              src={post.item.cover_url}
              alt={post.item.title}
              className="w-full h-full object-cover"
              onError={() => setImgErr(true)}
            />
          ) : (
            <span className="text-2xl">{cfg.icon}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md mr-1.5"
                style={{
                  background: "rgba(201,165,90,0.1)",
                  color: "var(--gold-dark)",
                }}
              >
                {cfg.icon} {cfg.label}
              </span>
              <p className="font-semibold text-sm text-(--text-primary) leading-snug mt-0.5 line-clamp-1">
                {post.item.title}
              </p>
              {post.item.subtitle && (
                <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-1">
                  {post.item.subtitle}
                </p>
              )}
              {(post.item.year || post.item.runtime_info) && (
                <p className="text-[11px] text-(--text-muted) mt-0.5 opacity-60">
                  {[post.item.year, post.item.runtime_info]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Global rating */}
            {post.global_rating !== null && (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="text-base font-bold text-(--gold)">
                  ★ {post.global_rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Indicado por */}
          <div className="flex items-center gap-1.5 mt-2">
            <Avatar
              url={post.profile.avatar_url}
              name={post.profile.display_name}
              size="xs"
            />
            <span className="text-[11px] text-(--text-muted)">
              {isMe ? "Você indicou" : post.profile.display_name}
            </span>
            {post.personal_rating && (
              <>
                <span className="text-[11px] text-(--text-muted) opacity-40">
                  ·
                </span>
                <StarRating value={post.personal_rating} readonly size="sm" />
              </>
            )}
            <span
              className={`ml-auto text-xs transition-transform ${expanded ? "rotate-180" : ""} text-(--text-muted)`}
            >
              ▾
            </span>
          </div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.05)] pt-3">
          {post.comment && (
            <p className="text-sm text-(--text-secondary) italic leading-relaxed">
              "{post.comment}"
            </p>
          )}

          {/* All individual ratings */}
          {post.raters.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-(--text-muted) uppercase tracking-widest font-semibold">
                Votos ({post.raters.length})
              </p>
              <div className="flex flex-col gap-1">
                {post.raters.map((rater) => (
                  <div
                    key={rater.user_id}
                    className="flex items-center gap-2 py-1"
                  >
                    <Avatar
                      url={rater.avatar_url}
                      name={rater.display_name}
                      size="xs"
                    />
                    <span className="text-xs text-(--text-secondary) flex-1 min-w-0 truncate">
                      {rater.display_name}
                      {rater.is_author && (
                        <span className="text-(--text-muted) opacity-60 ml-1">
                          (indicou)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <StarRating value={rater.rating} readonly size="sm" />
                      <span className="text-xs text-(--gold) font-bold w-6 text-right">
                        {rater.rating}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {post.raters.length > 1 && (
                <div className="flex items-center justify-between pt-1 border-t border-[rgba(255,255,255,0.05)]">
                  <span className="text-xs text-(--text-muted)">Média</span>
                  <span className="text-sm font-bold text-(--gold)">
                    {post.global_rating?.toFixed(1)}{" "}
                    <span className="text-xs font-normal opacity-60">/ 5</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* My interactions */}
          {currentUserId && !isMe && (
            <div className="flex flex-col gap-2">
              {/* Watched toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onWatched(!watched)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border
                    ${
                      watched
                        ? "bg-[rgba(52,211,153,0.1)] border-[rgba(52,211,153,0.25)] text-emerald-400"
                        : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.07)] text-(--text-muted) hover:border-[rgba(255,255,255,0.12)]"
                    }`}
                >
                  {watched ? "✅ Já consumi" : "○ Marcar como visto"}
                </button>
              </div>

              {/* Rate (only if watched) */}
              {watched && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--text-muted)">
                    Minha nota:
                  </span>
                  <StarRating value={myRating} onChange={onRate} />
                  {myRating && (
                    <span className="text-xs text-(--gold)">{myRating}/5</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Delete */}
          {isMe && (
            <button
              onClick={onDelete}
              className="text-xs text-(--text-muted) hover:text-(--red) transition-colors self-start"
            >
              ✕ Remover indicação
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Add Post Modal
// ══════════════════════════════════════════════════════════════

function AddPostModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (post: CulturaPost) => void;
}) {
  const { user } = useAuth();
  const [type, setType] = useState<CulturaType>("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalItem[]>([]);
  const [selected, setSelected] = useState<ExternalItem | null>(null);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const isAlbum = type === "album";

  useEffect(() => {
    queryRef.current?.focus();
  }, []);

  // For albums: resolve Spotify link on paste/change (debounced)
  const handleAlbumUrlChange = (val: string) => {
    setQuery(val);
    setSelected(null);
    setError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const item = await resolveSpotifyLink(val.trim());
      setSearching(false);
      if (item) {
        setSelected(item);
      } else {
        setError(
          "Link não reconhecido. Cole um link de álbum, música ou playlist do Spotify.",
        );
      }
    }, 500);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelected(null);
    setResults([]);
    setError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || val.trim().length < 3) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const items = await searchExternalItems(val, type);
      setResults(items);
      setSearching(false);
    }, 800);
  };

  // Reset on type change
  useEffect(() => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setError("");
  }, [type]);

  const handleSave = async () => {
    if (!selected || !user) return;
    setSaving(true);
    setError("");

    // 1. Upsert the item
    const { data: item, error: itemErr } = await upsertItem(selected);
    if (itemErr || !item) {
      setError(itemErr ?? "Erro ao salvar item");
      setSaving(false);
      return;
    }

    // 2. Create the post
    const { data: post, error: postErr } = await createPost(
      user.id,
      item.id,
      comment.trim() || null,
      rating,
    );
    if (postErr || !post) {
      setError(postErr ?? "Erro ao criar indicação");
      setSaving(false);
      return;
    }

    onCreated(post);
  };

  const inputClass =
    "w-full py-2.5 px-3.5 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-[rgba(201,165,90,0.4)] transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-deep)] rounded-t-3xl sm:rounded-3xl border border-[rgba(255,255,255,0.07)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 shadow-[0_-8px_40px_rgba(0,0,0,0.7)] max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-base font-bold text-(--text-primary)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Indicar Arte
          </h2>
          <button
            onClick={onClose}
            className="text-(--text-muted) hover:text-(--text-primary) text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-4">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border
                ${
                  type === t
                    ? "bg-[rgba(201,165,90,0.15)] text-(--gold) border-[rgba(201,165,90,0.3)]"
                    : "bg-[rgba(255,255,255,0.03)] text-(--text-muted) border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                }`}
            >
              <div className="text-lg mb-0.5">{TYPE_CONFIG[t].icon}</div>
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>

        {/* Search — URL input for albums, text search for others */}
        <div className="relative mb-3">
          {isAlbum ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-(--text-muted)">
                Cole o link do Spotify (álbum, música ou playlist)
              </label>
              <div className="relative">
                <input
                  ref={queryRef}
                  value={query}
                  onChange={(e) => handleAlbumUrlChange(e.target.value)}
                  placeholder="https://open.spotify.com/album/..."
                  className={inputClass}
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[rgba(201,165,90,0.4)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={queryRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={`Buscar ${TYPE_CONFIG[type].plural.toLowerCase()}...`}
                className={inputClass}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[rgba(201,165,90,0.4)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results (text search only — not albums) */}
        {!selected && !isAlbum && results.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4 max-h-48 overflow-y-auto">
            {results.map((item) => (
              <button
                key={item.external_id}
                onClick={() => {
                  setSelected(item);
                  setResults([]);
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(201,165,90,0.3)] transition-all text-left"
              >
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-[var(--bg-card)] shrink-0 flex items-center justify-center">
                  {item.cover_url ? (
                    <img
                      src={item.cover_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">{TYPE_CONFIG[type].icon}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-(--text-primary) line-clamp-1">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-1">
                      {item.subtitle}
                    </p>
                  )}
                  <p className="text-[11px] text-(--text-muted) opacity-60 mt-0.5">
                    {[item.year, item.runtime_info].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected item preview */}
        {selected && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-[rgba(201,165,90,0.05)] border border-[rgba(201,165,90,0.15)]">
            <div className="w-12 h-16 rounded-lg overflow-hidden bg-[var(--bg-card)] shrink-0 flex items-center justify-center">
              {selected.cover_url ? (
                <img
                  src={selected.cover_url}
                  alt={selected.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl">{TYPE_CONFIG[type].icon}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-(--text-primary)">
                {selected.title}
              </p>
              {selected.subtitle && (
                <p className="text-xs text-(--text-muted)">
                  {selected.subtitle}
                </p>
              )}
              <p className="text-[11px] text-(--text-muted) opacity-60">
                {[selected.year, selected.runtime_info]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="text-(--text-muted) hover:text-(--text-primary) text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Comment + Rating (only when item selected) */}
        {selected && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-(--text-muted) mb-1.5 block">
                💬 Por que você recomenda?
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte o que te marcou nessa arte..."
                maxLength={500}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className="text-xs text-(--text-muted) mb-2 block">
                ⭐ Sua nota pessoal
              </label>
              <div className="flex items-center gap-3">
                <StarRating value={rating} onChange={setRating} />
                {rating && (
                  <span className="text-sm text-(--gold) font-bold">
                    {rating}/5
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-(--red) mt-2">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!selected || saving}
          className="mt-4 w-full py-3 rounded-xl font-bold text-sm text-(--bg-abyss) disabled:opacity-40 transition-all"
          style={{
            background:
              "linear-gradient(135deg, var(--gold-dark), var(--gold))",
          }}
        >
          {saving
            ? "Indicando..."
            : `Indicar ${selected ? selected.title : TYPE_CONFIG[type].label} ✨`}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════

export function CulturaPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CulturaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CulturaType | null>(null);
  const [userFilter, setUserFilter] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const currentWeek = currentWeekStr();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    const data = await fetchAllPosts(user?.id);
    setPosts(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    const ch = subscribeCultura(() => load());
    return () => {
      ch.unsubscribe();
    };
  }, [load]);

  // Derived state
  // allUsers from ALL posts (not filtered) so carousel is always visible
  const allUsers = [
    ...new Map(posts.map((p) => [p.user_id, p.profile])).values(),
  ];

  const filtered = posts.filter((p) => {
    // Type filter is exclusive (single selection)
    if (typeFilter && p.item.type !== typeFilter) return false;
    // User filter allows multiple selections (OR logic)
    if (userFilter.size > 0 && !userFilter.has(p.user_id)) return false;
    return true;
  });

  const weeks = groupByWeek(filtered);
  const thisWeek = weeks.find((w) => w.week === currentWeek);
  const pastWeeks = weeks.filter((w) => w.week !== currentWeek);

  const handleDelete = async (postId: string) => {
    await deletePost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast("Indicação removida.");
  };

  const handleRate = async (post: CulturaPost, rating: number | null) => {
    if (!user) return;
    // Optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              my_interaction: {
                ...p.my_interaction,
                global_rating: rating,
                watched: p.my_interaction?.watched ?? false,
              },
              global_rating: (() => {
                // Recalculate average optimistically
                const interactions = p.global_count;
                const prevRating = p.my_interaction?.global_rating ?? null;
                if (!prevRating && rating) {
                  return (
                    Math.round(
                      (((p.global_rating ?? 0) * interactions + rating) /
                        (interactions + 1)) *
                        10,
                    ) / 10
                  );
                }
                return p.global_rating;
              })(),
            }
          : p,
      ),
    );
    await upsertInteraction(user.id, post.item_id, { global_rating: rating });
  };

  const handleWatched = async (post: CulturaPost, watched: boolean) => {
    if (!user) return;
    // Optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              my_interaction: {
                global_rating: p.my_interaction?.global_rating ?? null,
                watched,
              },
            }
          : p,
      ),
    );
    await upsertInteraction(user.id, post.item_id, { watched });
    if (watched) showToast("Marcado como visto! Agora você pode avaliar ⭐");
  };

  const toggleUserFilter = (id: string) => {
    setUserFilter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  function WeekSection({
    group,
    isCurrent,
  }: {
    group: WeekGroup;
    isCurrent: boolean;
  }) {
    return (
      <div>
        {/* Week header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            {isCurrent && (
              <span className="w-2 h-2 rounded-full bg-(--gold) animate-pulse shrink-0" />
            )}
            <h2
              className={`text-sm font-bold tracking-wide ${isCurrent ? "text-(--gold)" : "text-(--text-muted)"}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {group.label}
            </h2>
          </div>
          <span className="text-xs text-(--text-muted) opacity-50">
            {group.posts.length} indicaç
            {group.posts.length !== 1 ? "ões" : "ão"}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-[rgba(201,165,90,0.1)] to-transparent" />
        </div>

        <div className="flex flex-col gap-2.5">
          {group.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onDelete={() => handleDelete(post.id)}
              onRate={(rating) => handleRate(post, rating)}
              onWatched={(w) => handleWatched(post, w)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-52px)]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1
              className="text-xl text-(--gold) leading-none"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Cultura
            </h1>
            <p className="text-sm text-(--text-muted) mt-1.5">
              Filmes · Séries · Livros · Álbuns
            </p>
          </div>
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
        </div>

        {/* User filter carousel */}
        {allUsers.length > 1 && (
          <div className="mb-4">
            <p className="text-[10px] text-(--text-muted) uppercase tracking-widest mb-2 font-semibold">
              Filtrar por pessoa
            </p>
            <UserFilter
              users={allUsers}
              selected={userFilter}
              onToggle={toggleUserFilter}
            />
          </div>
        )}

        {/* Type filter */}
        <TypeFilter active={typeFilter} onChange={setTypeFilter} />
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-8 max-w-[540px] mx-auto w-full flex flex-col gap-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl opacity-30">🎬</span>
            <p className="text-sm text-(--text-muted) text-center">
              {posts.length === 0
                ? "Nenhuma indicação ainda."
                : "Nenhum resultado para os filtros."}
            </p>
            {posts.length === 0 && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-1 px-4 py-2 rounded-xl text-sm font-bold text-(--gold) transition-all hover:-translate-y-0.5"
                style={{
                  background: "rgba(201,165,90,0.12)",
                  border: "1px solid rgba(201,165,90,0.2)",
                }}
              >
                Fazer primeira indicação ✨
              </button>
            )}
          </div>
        ) : (
          <>
            {thisWeek && <WeekSection group={thisWeek} isCurrent />}
            {pastWeeks.map((g) => (
              <WeekSection key={g.week} group={g} isCurrent={false} />
            ))}
          </>
        )}
      </div>

      {showAdd && (
        <AddPostModal
          onClose={() => setShowAdd(false)}
          onCreated={(post) => {
            setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
            setShowAdd(false);
            showToast(`"${post.item.title}" indicado! ✨`);
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium text-(--text-primary) shadow-[0_4px_20px_rgba(0,0,0,0.5)] pointer-events-none"
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
