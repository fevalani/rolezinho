/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchTableById,
  fetchTableMembers,
  fetchFeedPosts,
  createFeedPost,
  updateFeedPost,
  deleteFeedPost,
  uploadFeedImage,
  subscribeFeedPosts,
  rollTableDice,
  subscribeTableRolls,
  startSession,
  pauseSession,
  applyRest,
  transferMastery,
  fetchLibrary,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  fetchMyLinkForTable,
  fetchTableSheets,
  linkSheetToTable,
  fetchMySheets,
} from "./rpgService";
import type {
  RpgTable,
  RpgTableMember,
  RpgFeedPost,
  RpgTableRoll,
  RpgLibraryEntry,
  RpgSheet,
} from "./rpgTypes";
import { DICE_TYPES, DICE_CONFIG } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { RpgSheetView } from "./RpgSheetView";

type Tab = "feed" | "dado" | "aventura";
const ROLL_TTL_MS = 60_000;

export function RpgTablePage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [table, setTable] = useState<RpgTable | null>(null);
  const [members, setMembers] = useState<RpgTableMember[]>([]);
  const [feedPosts, setFeedPosts] = useState<RpgFeedPost[]>([]);
  const [liveRolls, setLiveRolls] = useState<RpgTableRoll[]>([]);
  const [library, setLibrary] = useState<RpgLibraryEntry[]>([]);
  const [tableSheets, setTableSheets] = useState<
    { sheet: RpgSheet; userId: string }[]
  >([]);
  const [myLink, setMyLink] = useState<{ sheet_id: string } | null>(null);
  const [mySheets, setMySheets] = useState<RpgSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const feedEndRef = useRef<HTMLDivElement>(null);

  const isMaster = table?.master_id === user?.id;

  // Load
  const load = useCallback(async () => {
    if (!tableId || !user) return;
    setLoading(true);

    // fetchTableById pode falhar logo após createTable (RLS ainda propagando)
    // tenta até 3x com delay de 500ms
    let t: RpgTable | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      t = await fetchTableById(tableId);
      if (t) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
    }

    const [m, f, lib, ts, link, ms] = await Promise.all([
      fetchTableMembers(tableId),
      fetchFeedPosts(tableId),
      fetchLibrary(tableId),
      fetchTableSheets(tableId),
      fetchMyLinkForTable(tableId, user.id),
      fetchMySheets(user.id),
    ]);
    setTable(t);
    setMembers(m);
    setFeedPosts(f);
    setLibrary(lib);
    setTableSheets(ts);
    setMyLink(link);
    setMySheets(ms);
    setLoading(false);
  }, [tableId, user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime feed
  useEffect(() => {
    if (!tableId) return;
    const ch = subscribeFeedPosts(
      tableId,
      (post) =>
        setFeedPosts((prev) => {
          if (prev.some((p) => p.id === post.id)) return prev;
          return [...prev, post];
        }),
      (id) => setFeedPosts((prev) => prev.filter((p) => p.id !== id)),
    );
    return () => {
      ch.unsubscribe();
    };
  }, [tableId]);

  // Realtime rolls (live, expire after 60s)
  useEffect(() => {
    if (!tableId) return;
    const ch = subscribeTableRolls(tableId, (roll) => {
      setLiveRolls((prev) => [roll, ...prev].slice(0, 20));
      setTimeout(() => {
        setLiveRolls((prev) => prev.filter((r) => r.id !== roll.id));
      }, ROLL_TTL_MS);
    });
    return () => {
      ch.unsubscribe();
    };
  }, [tableId]);

  // Scroll feed to bottom on new posts
  useEffect(() => {
    if (activeTab === "feed") {
      feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [feedPosts, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60dvh]">
        <div className="spinner" />
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-3 px-4">
        <p className="text-(--text-muted) text-sm">Mesa não encontrada.</p>
        <button
          onClick={() => navigate("/rpg")}
          className="text-(--gold) text-sm underline"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Table Header */}
      <TableHeader
        table={table}
        isMaster={isMaster}
        members={members}
        onBack={() => navigate("/rpg")}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "feed" && (
          <FeedTab
            posts={feedPosts}
            liveRolls={liveRolls}
            isMaster={isMaster}
            tableId={table.id}
            userId={user!.id}
            profile={profile}
            feedEndRef={feedEndRef}
            onPostCreated={(p) => setFeedPosts((prev) => [...prev, p])}
            onPostUpdated={(p) =>
              setFeedPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
            }
            onPostDeleted={(id) =>
              setFeedPosts((prev) => prev.filter((x) => x.id !== id))
            }
          />
        )}
        {activeTab === "dado" && (
          <DadoTab
            tableId={table.id}
            userId={user!.id}
            isMaster={isMaster}
            isActive={table.is_active}
          />
        )}
        {activeTab === "aventura" && (
          <AventuraTab
            table={table}
            members={members}
            tableSheets={tableSheets}
            library={library}
            myLink={myLink}
            mySheets={mySheets}
            isMaster={isMaster}
            onLibraryUpdate={setLibrary}
            onLinkSheet={async (sheetId) => {
              if (!user) return;
              await linkSheetToTable(sheetId, table.id, user.id);
              setMyLink({ sheet_id: sheetId });
              const ts = await fetchTableSheets(table.id);
              setTableSheets(ts);
            }}
            onTransferMastery={async (newMasterId) => {
              await transferMastery(table.id, newMasterId);
              const t = await fetchTableById(table.id);
              if (t) setTable(t);
            }}
          />
        )}
        {isMaster && activeTab === "feed" && (
          // Master controls overlay button
          <div className="absolute bottom-2 right-2">
            <MasterSessionButton
              isActive={table.is_active}
              onStart={async () => {
                await startSession(table.id);
                const t = await fetchTableById(table.id);
                if (t) setTable(t);
              }}
              onPause={async () => {
                await pauseSession(table.id);
                const t = await fetchTableById(table.id);
                if (t) setTable(t);
              }}
              onRest={async (type) => {
                await applyRest(table.id, type);
              }}
            />
          </div>
        )}
      </div>

      {/* Footer Nav */}
      <nav
        className="flex border-t border-[rgba(201,165,90,0.08)] bg-[var(--bg-deep)]"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {(["feed", "dado", "aventura"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "text-(--gold)"
                : "text-(--text-muted) hover:text-(--text-secondary)"
            }`}
          >
            <span className="text-lg leading-none">
              {tab === "feed" ? "📜" : tab === "dado" ? "🎲" : "⚔️"}
            </span>
            {tab === "feed" ? "Feed" : tab === "dado" ? "Dado" : "Aventura"}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Table Header ─────────────────────────────────────────────

function TableHeader({
  table,
  isMaster,
  members,
  onBack,
}: {
  table: RpgTable;
  isMaster: boolean;
  members: RpgTableMember[];
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-card)] border-b border-[rgba(201,165,90,0.08)]">
      <button onClick={onBack} className="text-(--text-muted) p-1 -ml-1">
        ‹
      </button>
      <div className="w-8 h-8 rounded-lg bg-[rgba(201,165,90,0.1)] flex items-center justify-center text-base flex-shrink-0">
        🏰
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-bold text-sm text-(--text-primary) truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {table.name}
          </span>
          {table.is_active && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-(--green) shadow-[0_0_6px_rgba(58,186,122,0.7)]" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMaster && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[rgba(201,165,90,0.1)] text-(--gold) font-semibold">
              Mestre
            </span>
          )}
          <span className="text-[0.7rem] text-(--text-muted)">
            {members.length} aventureiro{members.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <div className="text-[0.65rem] font-mono text-(--text-muted) bg-[rgba(201,165,90,0.06)] px-2 py-1 rounded">
        #{table.invite_code}
      </div>
    </div>
  );
}

// ── Feed Tab ──────────────────────────────────────────────────

function FeedTab({
  posts,
  liveRolls,
  isMaster,
  tableId,
  userId,
  profile,
  feedEndRef,
  onPostCreated,
  onPostUpdated,
  onPostDeleted,
}: {
  posts: RpgFeedPost[];
  liveRolls: RpgTableRoll[];
  isMaster: boolean;
  tableId: string;
  userId: string;
  profile: any;
  feedEndRef: React.RefObject<HTMLDivElement | null>;
  onPostCreated: (p: RpgFeedPost) => void;
  onPostUpdated: (p: RpgFeedPost) => void;
  onPostDeleted: (id: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [editPost, setEditPost] = useState<RpgFeedPost | null>(null);
  const [postContent, setPostContent] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImage(file);
    setPostImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!postContent.trim() && !postImage) return;
    setPosting(true);

    if (editPost) {
      let imgUrl = editPost.image_url;
      if (postImage) {
        imgUrl = await uploadFeedImage(postImage, tableId);
      }
      await updateFeedPost(editPost.id, postContent, imgUrl);
      onPostUpdated({
        ...editPost,
        content: postContent,
        image_url: imgUrl ?? null,
      });
      setEditPost(null);
    } else {
      let imgUrl: string | undefined;
      if (postImage) {
        imgUrl = (await uploadFeedImage(postImage, tableId)) ?? undefined;
      }
      const p = await createFeedPost(tableId, userId, postContent, imgUrl);
      if (p) onPostCreated(p);
    }

    setPostContent("");
    setPostImage(null);
    setPostImagePreview(null);
    setComposing(false);
    setPosting(false);
  };

  const startEdit = (post: RpgFeedPost) => {
    setEditPost(post);
    setPostContent(post.content);
    setPostImagePreview(post.image_url);
    setComposing(true);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Excluir esta publicação?")) return;
    await deleteFeedPost(postId);
    onPostDeleted(postId);
  };

  // Merge posts + live rolls in chronological order
  const feedItems: Array<
    { type: "post"; data: RpgFeedPost } | { type: "roll"; data: RpgTableRoll }
  > = [
    ...posts.map((p) => ({ type: "post" as const, data: p })),
    ...liveRolls.map((r) => ({ type: "roll" as const, data: r })),
  ].sort(
    (a, b) =>
      new Date(a.data.created_at).getTime() -
      new Date(b.data.created_at).getTime(),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable feed */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-3 flex flex-col gap-3">
        {feedItems.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="text-4xl mb-3">📜</div>
            <p className="text-sm text-(--text-muted)">
              O pergaminho está em branco...
            </p>
            {isMaster && (
              <p className="text-xs text-(--text-muted) mt-1">
                Crie a primeira publicação da aventura
              </p>
            )}
          </div>
        )}
        {feedItems.map((item) =>
          item.type === "post" ? (
            <FeedPostCard
              key={item.data.id}
              post={item.data as RpgFeedPost}
              isOwner={item.data.author_id === userId}
              onEdit={() => startEdit(item.data as RpgFeedPost)}
              onDelete={() => handleDelete(item.data.id)}
            />
          ) : (
            <LiveRollCard key={item.data.id} roll={item.data as RpgTableRoll} />
          ),
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Master compose area */}
      {isMaster && (
        <div className="border-t border-[rgba(201,165,90,0.08)] bg-[var(--bg-card)] px-4 py-3">
          {composing ? (
            <div className="flex flex-col gap-2">
              {postImagePreview && (
                <div className="relative">
                  <img
                    src={postImagePreview}
                    alt=""
                    className="w-full max-h-48 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => {
                      setPostImage(null);
                      setPostImagePreview(null);
                    }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              )}
              <textarea
                autoFocus
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Narre a aventura..."
                rows={3}
                className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) resize-none focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="p-2 rounded-lg text-(--text-muted) hover:text-(--gold) hover:bg-[rgba(201,165,90,0.06)] transition-colors"
                >
                  🖼
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setComposing(false);
                    setEditPost(null);
                    setPostContent("");
                    setPostImage(null);
                    setPostImagePreview(null);
                  }}
                  className="text-xs text-(--text-muted) px-3 py-1.5 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={(!postContent.trim() && !postImage) || posting}
                  className="text-xs font-bold px-4 py-1.5 rounded-lg bg-[rgba(201,165,90,0.15)] text-(--gold) disabled:opacity-40 hover:bg-[rgba(201,165,90,0.25)] transition-colors"
                >
                  {posting ? "..." : editPost ? "Salvar" : "Publicar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setComposing(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.1)] text-(--text-muted) text-sm hover:border-[rgba(201,165,90,0.25)] transition-colors"
            >
              <Avatar
                url={profile?.avatar_url}
                name={profile?.display_name ?? "M"}
                size="sm"
              />
              <span className="text-sm text-(--text-muted)">
                Adicionar ao Feed...
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedPostCard({
  post,
  isOwner,
  onEdit,
  onDelete,
}: {
  post: RpgFeedPost;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dt = new Date(post.created_at);
  const dateStr = dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const timeStr = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] overflow-hidden">
      {post.image_url && (
        <img
          src={post.image_url}
          alt=""
          className="w-full max-h-64 object-cover"
        />
      )}
      {post.content && (
        <p className="px-3 py-2.5 text-sm text-(--text-primary) leading-relaxed whitespace-pre-wrap">
          {post.content}
        </p>
      )}
      <div className="flex items-center px-3 pb-2.5 gap-2">
        <span className="text-[0.65rem] text-(--text-muted) flex-1">
          {dateStr} · {timeStr}
        </span>
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="text-[0.65rem] text-(--text-muted) hover:text-(--gold) transition-colors px-1.5 py-0.5"
            >
              Editar
            </button>
            <button
              onClick={onDelete}
              className="text-[0.65rem] text-(--text-muted) hover:text-(--red) transition-colors px-1.5 py-0.5"
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveRollCard({ roll }: { roll: RpgTableRoll }) {
  const name = roll.profile?.display_name ?? "Aventureiro";
  const isCrit = roll.dice_type === "d20" && roll.results[0] === 20;
  const isFail = roll.dice_type === "d20" && roll.results[0] === 1;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isCrit
          ? "border-[rgba(255,215,0,0.3)] bg-[rgba(255,215,0,0.06)]"
          : isFail
            ? "border-[rgba(196,64,64,0.3)] bg-[rgba(196,64,64,0.06)]"
            : "border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]"
      }`}
    >
      <Avatar url={roll.profile?.avatar_url} name={name} size="sm" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-(--text-secondary)">
          {name}
        </span>
        <span className="text-xs text-(--text-muted)">
          {" "}
          jogou {roll.dice_type}
        </span>
      </div>
      <span
        className={`text-base font-bold font-mono ${
          isCrit
            ? "text-(--crit-gold)"
            : isFail
              ? "text-(--crit-fail)"
              : "text-(--text-primary)"
        }`}
      >
        {roll.total}
      </span>
      {isCrit && <span className="text-xs">⚡</span>}
      {isFail && <span className="text-xs">💀</span>}
    </div>
  );
}

// ── Dado Tab ──────────────────────────────────────────────────

function DadoTab({
  tableId,
  userId,
  isMaster,
  isActive,
}: {
  tableId: string;
  userId: string;
  isMaster: boolean;
  isActive: boolean;
}) {
  const [selected, setSelected] = useState<string>("d20");
  const [quantity, setQuantity] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<{
    results: number[];
    total: number;
    dice: string;
  } | null>(null);

  const roll = async () => {
    setRolling(true);
    const r = await rollTableDice(
      tableId,
      userId,
      selected,
      quantity,
      isMaster,
    );
    if (r)
      setLastRoll({ results: r.results, total: r.total, dice: r.dice_type });
    setRolling(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-6">
      {!isActive && (
        <div className="text-center bg-[rgba(201,165,90,0.06)] border border-[rgba(201,165,90,0.12)] rounded-xl px-4 py-3 text-xs text-(--text-muted)">
          A sessão está pausada.{" "}
          {isMaster
            ? "Dê play para habilitar rolagens."
            : "Aguarde o Mestre iniciar a sessão."}
        </div>
      )}

      {/* Dice selection */}
      <div className="grid grid-cols-4 gap-2 w-full">
        {DICE_TYPES.map((d) => (
          <button
            key={d}
            onClick={() => setSelected(d)}
            className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all ${
              selected === d
                ? "border-[rgba(201,165,90,0.4)] bg-[rgba(201,165,90,0.1)] text-(--gold)"
                : "border-[rgba(201,165,90,0.08)] bg-[var(--bg-card)] text-(--text-secondary) hover:border-[rgba(201,165,90,0.2)]"
            }`}
          >
            <img
              src={DICE_CONFIG[d].icon}
              alt={d}
              className="w-7 h-7 object-contain"
            />
            <span className="text-xs font-bold">{DICE_CONFIG[d].label}</span>
          </button>
        ))}
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          className="w-9 h-9 rounded-full border border-[rgba(201,165,90,0.2)] text-(--gold) text-lg hover:bg-[rgba(201,165,90,0.1)] transition-colors"
        >
          −
        </button>
        <span className="text-2xl font-bold text-(--text-primary) w-8 text-center">
          {quantity}
        </span>
        <button
          onClick={() => setQuantity((q) => Math.min(10, q + 1))}
          className="w-9 h-9 rounded-full border border-[rgba(201,165,90,0.2)] text-(--gold) text-lg hover:bg-[rgba(201,165,90,0.1)] transition-colors"
        >
          +
        </button>
      </div>

      {/* Roll result */}
      {lastRoll && (
        <div className="text-center">
          <div className="flex gap-2 justify-center flex-wrap mb-1">
            {lastRoll.results.map((r, i) => (
              <span
                key={i}
                className="text-lg font-mono text-(--text-secondary)"
              >
                [{r}]
              </span>
            ))}
          </div>
          <span
            className="text-5xl font-bold text-(--gold)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {lastRoll.total}
          </span>
          <p className="text-xs text-(--text-muted) mt-1">
            {isMaster
              ? "Rolagem secreta (só você vê)"
              : `${quantity}${lastRoll.dice}`}
          </p>
        </div>
      )}

      {/* Roll button */}
      <button
        onClick={roll}
        disabled={rolling || !isActive}
        className="w-full max-w-xs py-4 rounded-2xl bg-[rgba(201,165,90,0.15)] border border-[rgba(201,165,90,0.25)] text-(--gold) font-bold text-lg disabled:opacity-40 hover:bg-[rgba(201,165,90,0.25)] active:scale-95 transition-all"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {rolling ? "🎲..." : `Rolar ${quantity}${selected}`}
      </button>
    </div>
  );
}

// ── Aventura Tab ──────────────────────────────────────────────

function AventuraTab({
  table,
  members,
  tableSheets,
  library,
  myLink,
  mySheets,
  isMaster,
  onLibraryUpdate,
  onLinkSheet,
  onTransferMastery,
}: {
  table: RpgTable;
  members: RpgTableMember[];
  tableSheets: { sheet: RpgSheet; userId: string }[];
  library: RpgLibraryEntry[];
  myLink: { sheet_id: string } | null;
  mySheets: RpgSheet[];
  isMaster: boolean;
  onLibraryUpdate: (lib: RpgLibraryEntry[]) => void;
  onLinkSheet: (sheetId: string) => void;
  onTransferMastery: (newMasterId: string) => void;
}) {
  const [section, setSection] = useState<
    "personagens" | "biblioteca" | "config"
  >("personagens");
  const navigate = useNavigate();

  // Library editing
  const [editEntry, setEditEntry] = useState<RpgLibraryEntry | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showNewEntry, setShowNewEntry] = useState(false);

  const handleCreateEntry = async () => {
    if (!newTitle.trim()) return;
    const e = await createLibraryEntry(table.id, newTitle, newContent);
    if (e) {
      onLibraryUpdate([...library, e]);
      setNewTitle("");
      setNewContent("");
      setShowNewEntry(false);
    }
  };

  const handleUpdateEntry = async () => {
    if (!editEntry) return;
    await updateLibraryEntry(editEntry.id, {
      title: newTitle,
      content: newContent,
    });
    onLibraryUpdate(
      library.map((l) =>
        l.id === editEntry.id
          ? { ...l, title: newTitle, content: newContent }
          : l,
      ),
    );
    setEditEntry(null);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Excluir este item da biblioteca?")) return;
    await deleteLibraryEntry(id);
    onLibraryUpdate(library.filter((l) => l.id !== id));
  };

  // Linked sheet view
  const mySheet = myLink
    ? tableSheets.find((ts) => ts.sheet.id === myLink.sheet_id)?.sheet
    : null;
  const [showSheetView, setShowSheetView] = useState(false);
  const [linkingSheet, setLinkingSheet] = useState(false);

  if (showSheetView && mySheet) {
    return (
      <RpgSheetView
        sheetId={mySheet.id}
        onBack={() => setShowSheetView(false)}
        readonly={false}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-nav */}
      <div className="flex border-b border-[rgba(201,165,90,0.08)] bg-[var(--bg-card)]">
        {(
          [
            "personagens",
            "biblioteca",
            ...(isMaster ? ["config"] : []),
          ] as const
        ).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s as any)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              section === s
                ? "text-(--gold) border-b-2 border-(--gold)"
                : "text-(--text-muted)"
            }`}
          >
            {s === "personagens"
              ? "Personagens"
              : s === "biblioteca"
                ? "Biblioteca"
                : "Mestre"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-4">
        {/* PERSONAGENS */}
        {section === "personagens" && (
          <div className="flex flex-col gap-3">
            {/* Minha ficha */}
            {!isMaster && (
              <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3">
                <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-2">
                  Minha Ficha
                </p>
                {mySheet ? (
                  <button
                    onClick={() => setShowSheetView(true)}
                    className="w-full text-left flex items-center gap-3 rounded-lg bg-[rgba(201,165,90,0.04)] hover:bg-[rgba(201,165,90,0.08)] p-2 transition-colors"
                  >
                    <span className="text-xl">⚔️</span>
                    <div>
                      <p className="text-sm font-semibold text-(--text-primary)">
                        {mySheet.character_name}
                      </p>
                      <p className="text-xs text-(--text-muted)">
                        Nível {mySheet.level} {mySheet.class_name}
                      </p>
                    </div>
                    <span className="ml-auto text-(--gold) text-sm">›</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    {linkingSheet ? (
                      <>
                        {mySheets.length === 0 ? (
                          <div className="text-center py-3">
                            <p className="text-xs text-(--text-muted) mb-2">
                              Você não tem fichas criadas.
                            </p>
                            <button
                              onClick={() => navigate("/rpg")}
                              className="text-xs text-(--gold) underline"
                            >
                              Criar uma ficha
                            </button>
                          </div>
                        ) : (
                          mySheets.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                onLinkSheet(s.id);
                                setLinkingSheet(false);
                              }}
                              className="text-left flex items-center gap-2 p-2 rounded-lg hover:bg-[rgba(201,165,90,0.08)] transition-colors"
                            >
                              <span>⚔️</span>
                              <span className="text-sm text-(--text-primary)">
                                {s.character_name}
                              </span>
                              <span className="text-xs text-(--text-muted) ml-auto">
                                Nível {s.level}
                              </span>
                            </button>
                          ))
                        )}
                        <button
                          onClick={() => setLinkingSheet(false)}
                          className="text-xs text-(--text-muted) text-center py-1"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLinkingSheet(true)}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg bg-[rgba(201,165,90,0.1)] text-(--gold) hover:bg-[rgba(201,165,90,0.18)] transition-colors"
                        >
                          Vincular Ficha
                        </button>
                        <button
                          onClick={() => navigate("/rpg")}
                          className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[rgba(201,165,90,0.15)] text-(--gold) hover:bg-[rgba(201,165,90,0.06)] transition-colors"
                        >
                          Criar Ficha
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Todos os personagens */}
            <div>
              <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-2">
                Aventureiros ({members.length})
              </p>
              {members.map((m) => {
                const linkedSheet = tableSheets.find(
                  (ts) => ts.userId === m.user_id,
                )?.sheet;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 py-2.5 border-b border-[rgba(255,255,255,0.04)] last:border-0"
                  >
                    <Avatar
                      url={m.profile?.avatar_url}
                      name={m.profile?.display_name ?? "?"}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-(--text-primary) truncate">
                        {m.profile?.display_name ?? "Desconhecido"}
                        {m.user_id === table.master_id && (
                          <span className="ml-2 text-[0.6rem] px-1 py-0.5 rounded bg-[rgba(201,165,90,0.1)] text-(--gold)">
                            Mestre
                          </span>
                        )}
                      </p>
                      {linkedSheet ? (
                        <p className="text-xs text-(--text-muted)">
                          {linkedSheet.character_name} · {linkedSheet.race}{" "}
                          {linkedSheet.class_name} Nv{linkedSheet.level}
                        </p>
                      ) : (
                        <p className="text-xs text-(--text-muted)">
                          Sem ficha vinculada
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-(--text-muted)">
                      <p>{m.total_sessions}s</p>
                      <p>{Math.round(m.total_minutes / 60)}h</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BIBLIOTECA */}
        {section === "biblioteca" && (
          <div className="flex flex-col gap-3">
            {isMaster &&
              (showNewEntry ? (
                <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 flex flex-col gap-2">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Título"
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Conteúdo..."
                    rows={4}
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) resize-none focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowNewEntry(false)}
                      className="flex-1 py-2 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateEntry}
                      className="flex-1 py-2 text-xs font-bold text-(--gold) rounded-lg bg-[rgba(201,165,90,0.12)] hover:bg-[rgba(201,165,90,0.2)]"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewEntry(true)}
                  className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-[rgba(201,165,90,0.2)] text-(--text-muted) hover:text-(--gold) transition-colors text-sm"
                >
                  <span className="text-lg">+</span> Novo item na biblioteca
                </button>
              ))}

            {library.length === 0 && !showNewEntry && (
              <div className="text-center py-10 text-(--text-muted) text-sm">
                Biblioteca vazia
              </div>
            )}

            {library.map((entry) =>
              editEntry?.id === entry.id ? (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 flex flex-col gap-2"
                >
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
                  />
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={4}
                    className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) resize-none focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditEntry(null)}
                      className="flex-1 py-2 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleUpdateEntry}
                      className="flex-1 py-2 text-xs font-bold text-(--gold) rounded-lg bg-[rgba(201,165,90,0.12)]"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-sm text-(--gold)">
                      {entry.title}
                    </h3>
                    {isMaster && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditEntry(entry);
                            setNewTitle(entry.title);
                            setNewContent(entry.content);
                          }}
                          className="text-xs text-(--text-muted) hover:text-(--gold) px-1"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-xs text-(--text-muted) hover:text-(--red) px-1"
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-(--text-secondary) leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>
                </div>
              ),
            )}
          </div>
        )}

        {/* CONFIG (mestre) */}
        {section === "config" && isMaster && (
          <div className="flex flex-col gap-4">
            {/* Session controls */}
            <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-4">
              <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-3">
                Sessão
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    if (table.is_active) await pauseSession(table.id);
                    else await startSession(table.id);
                  }}
                  className={`py-3 rounded-xl font-bold text-sm transition-colors ${
                    table.is_active
                      ? "bg-[rgba(196,64,64,0.12)] border border-[rgba(196,64,64,0.2)] text-(--red) hover:bg-[rgba(196,64,64,0.2)]"
                      : "bg-[rgba(58,186,122,0.12)] border border-[rgba(58,186,122,0.2)] text-(--green) hover:bg-[rgba(58,186,122,0.2)]"
                  }`}
                >
                  {table.is_active ? "⏸ Pausar Sessão" : "▶ Iniciar Sessão"}
                </button>

                {table.is_active && (
                  <>
                    <button
                      onClick={() => applyRest(table.id, "short")}
                      className="py-2.5 rounded-xl text-sm border border-[rgba(74,138,212,0.2)] text-(--blue) bg-[rgba(74,138,212,0.08)] hover:bg-[rgba(74,138,212,0.15)] transition-colors"
                    >
                      😴 Descanso Curto (todos)
                    </button>
                    <button
                      onClick={() => applyRest(table.id, "long")}
                      className="py-2.5 rounded-xl text-sm border border-[rgba(74,138,212,0.2)] text-(--blue) bg-[rgba(74,138,212,0.08)] hover:bg-[rgba(74,138,212,0.15)] transition-colors"
                    >
                      🌙 Descanso Longo (todos)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Transfer mastery */}
            <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-4">
              <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-3">
                Transferir Mestragem
              </p>
              {members
                .filter((m) => m.user_id !== table.master_id)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (
                        confirm(
                          `Transferir mestragem para ${m.profile?.display_name}?`,
                        )
                      ) {
                        onTransferMastery(m.user_id);
                      }
                    }}
                    className="flex items-center gap-3 w-full py-2 hover:bg-[rgba(201,165,90,0.04)] rounded-lg transition-colors"
                  >
                    <Avatar
                      url={m.profile?.avatar_url}
                      name={m.profile?.display_name ?? "?"}
                      size="sm"
                    />
                    <span className="text-sm text-(--text-primary)">
                      {m.profile?.display_name}
                    </span>
                    <span className="ml-auto text-xs text-(--text-muted) hover:text-(--gold)">
                      Transferir →
                    </span>
                  </button>
                ))}
              {members.filter((m) => m.user_id !== table.master_id).length ===
                0 && (
                <p className="text-xs text-(--text-muted)">
                  Sem outros membros na mesa.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Master session button (floating) ─────────────────────────

function MasterSessionButton({
  isActive,
  onStart,
  onPause,
  onRest,
}: {
  isActive: boolean;
  onStart: () => void;
  onPause: () => void;
  onRest: (type: "short" | "long") => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-12 right-0 flex flex-col gap-1 bg-[var(--bg-deep)] border border-[rgba(201,165,90,0.15)] rounded-xl p-2 shadow-lg min-w-[180px]">
          <button
            onClick={() => {
              isActive ? onPause() : onStart();
              setOpen(false);
            }}
            className={`text-xs font-bold py-2 px-3 rounded-lg transition-colors ${
              isActive
                ? "text-(--red) bg-[rgba(196,64,64,0.1)] hover:bg-[rgba(196,64,64,0.2)]"
                : "text-(--green) bg-[rgba(58,186,122,0.1)] hover:bg-[rgba(58,186,122,0.2)]"
            }`}
          >
            {isActive ? "⏸ Pausar Sessão" : "▶ Iniciar Sessão"}
          </button>
          {isActive && (
            <>
              <button
                onClick={() => {
                  onRest("short");
                  setOpen(false);
                }}
                className="text-xs py-2 px-3 rounded-lg text-(--blue) bg-[rgba(74,138,212,0.08)] hover:bg-[rgba(74,138,212,0.15)]"
              >
                😴 Descanso Curto
              </button>
              <button
                onClick={() => {
                  onRest("long");
                  setOpen(false);
                }}
                className="text-xs py-2 px-3 rounded-lg text-(--blue) bg-[rgba(74,138,212,0.08)] hover:bg-[rgba(74,138,212,0.15)]"
              >
                🌙 Descanso Longo
              </button>
            </>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-10 h-10 rounded-full shadow-lg border transition-all flex items-center justify-center text-base ${
          isActive
            ? "bg-[rgba(58,186,122,0.2)] border-[rgba(58,186,122,0.4)] text-(--green)"
            : "bg-[rgba(201,165,90,0.12)] border-[rgba(201,165,90,0.25)] text-(--gold)"
        }`}
      >
        ⚙️
      </button>
    </div>
  );
}
