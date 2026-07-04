import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  fetchTableDetail,
  fetchAllProfiles,
  updateTable,
  deleteTable,
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  addEntry,
  deleteEntry,
  submitValue,
  approvePendingEdit,
  rejectPendingEdit,
  subscribeRankingTable,
} from "./rankingService";
import { orderCategories, sortEntries, calculateTotal } from "./rankingLogic";
import type {
  RankingCategory,
  RankingEntry,
  RankingPendingEdit,
  RankingTableDetail,
} from "./rankingTypes";
import { RANKING_ICONS } from "./rankingTypes";

const MEDALS = ["🥇", "🥈", "🥉"];

function pendingKey(entryId: string, categoryId: string) {
  return `${entryId}:${categoryId}`;
}

// ─── Edit value bottom sheet ────────────────────────────────

function EditValueSheet({
  entry,
  category,
  isAdmin,
  onClose,
  onSaved,
}: {
  entry: RankingEntry;
  category: RankingCategory;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (status: "applied" | "pending") => void;
}) {
  const [value, setValue] = useState(String(entry.values[category.id] ?? 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      setError("Digite um número válido");
      return;
    }
    setLoading(true);
    setError(null);
    const { status, error: err } = await submitValue(entry.id, category.id, parsed);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (status) onSaved(status);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
            {category.name}
          </h2>
          <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            ✕
          </button>
        </div>

        <p className="text-sm text-[var(--text-muted)] mb-4">{entry.display_name}</p>

        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)] mb-3"
        />

        {!isAdmin && (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Você não é o admin desta tabela — a alteração fica pendente até
            outra pessoa aprovar.
          </p>
        )}

        {error && (
          <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)] hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50 transition-all"
        >
          {loading ? "Salvando…" : isAdmin ? "Salvar" : "Propor alteração"}
        </button>
      </div>
    </>
  );
}

// ─── Pending edit bottom sheet ──────────────────────────────

function PendingEditSheet({
  edit,
  categoryName,
  entryName,
  currentUserId,
  onClose,
  onResolved,
}: {
  edit: RankingPendingEdit;
  categoryName: string;
  entryName: string;
  currentUserId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isProposer = edit.proposed_by === currentUserId;

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    const { error: err } = await approvePendingEdit(edit.id);
    setLoading(null);
    if (err) return setError(err);
    onResolved();
  };

  const handleReject = async () => {
    setLoading("reject");
    setError(null);
    const { error: err } = await rejectPendingEdit(edit.id);
    setLoading(null);
    if (err) return setError(err);
    onResolved();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[100] animate-[fadeIn_0.2s_ease-out]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--bg-deep)] rounded-t-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] animate-[slideUp_0.3s_ease-out] max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--gold)]" style={{ fontFamily: "var(--font-display)" }}>
            🕓 Proposta pendente
          </h2>
          <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            ✕
          </button>
        </div>

        <p className="text-sm text-[var(--text-primary)] mb-1">
          {entryName} · {categoryName}
        </p>
        <p className="text-sm text-[var(--text-muted)] mb-1">
          {edit.previous_value} → <span className="text-[var(--gold)] font-semibold">{edit.new_value}</span>
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          Proposto por {edit.proposed_by_name}
        </p>

        {error && (
          <p className="text-xs text-[var(--red)] bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        {isProposer ? (
          <button
            onClick={handleReject}
            disabled={loading !== null}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[rgba(196,64,64,0.1)] text-[var(--red)] border border-[rgba(196,64,64,0.25)] hover:bg-[rgba(196,64,64,0.18)] disabled:opacity-50 transition-all"
          >
            {loading === "reject" ? "Cancelando…" : "Cancelar minha proposta"}
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={loading !== null}
              className="flex-1 py-3.5 rounded-xl font-semibold text-sm bg-[rgba(196,64,64,0.1)] text-[var(--red)] border border-[rgba(196,64,64,0.25)] hover:bg-[rgba(196,64,64,0.18)] disabled:opacity-50 transition-all"
            >
              {loading === "reject" ? "…" : "Rejeitar"}
            </button>
            <button
              onClick={handleApprove}
              disabled={loading !== null}
              className="flex-1 py-3.5 rounded-xl font-semibold text-sm bg-[rgba(90,180,120,0.12)] text-[var(--green,#5ab478)] border border-[rgba(90,180,120,0.3)] hover:bg-[rgba(90,180,120,0.2)] disabled:opacity-50 transition-all"
            >
              {loading === "approve" ? "…" : "Aprovar"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Add person (picker de usuários do app + nome livre) ────

function AddPersonSection({
  tableId,
  entries,
  onReload,
}: {
  tableId: string;
  entries: RankingEntry[];
  onReload: () => void;
}) {
  const [allProfiles, setAllProfiles] = useState<
    { id: string; display_name: string; avatar_url: string | null }[]
  >([]);
  const [manualName, setManualName] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    fetchAllProfiles().then(setAllProfiles);
  }, []);

  const linkedIds = useMemo(
    () => new Set(entries.filter((e) => e.profile_id).map((e) => e.profile_id)),
    [entries],
  );
  const available = allProfiles.filter((p) => !linkedIds.has(p.id));

  const handleAddProfile = async (profileId: string) => {
    setAdding(profileId);
    await addEntry(tableId, { profileId });
    setAdding(null);
    onReload();
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) return;
    setAdding("manual");
    await addEntry(tableId, { name: manualName.trim() });
    setManualName("");
    setAdding(null);
    onReload();
  };

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
        Adicionar pessoa
      </p>

      {available.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3 max-h-52 overflow-y-auto">
          {available.map((p) => (
            <button
              key={p.id}
              onClick={() => handleAddProfile(p.id)}
              disabled={adding !== null}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(201,165,90,0.3)] disabled:opacity-50 transition-colors text-left"
            >
              <Avatar url={p.avatar_url} name={p.display_name} size="xs" />
              <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                {p.display_name}
              </span>
              <span className="text-xs text-[var(--gold)]">
                {adding === p.id ? "…" : "+"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Ou digite o nome de alguém de fora do app"
          className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
        />
        <button
          onClick={handleAddManual}
          disabled={!manualName.trim() || adding !== null}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] disabled:opacity-50 transition-all shrink-0"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ─── Admin panel ────────────────────────────────────────────

function AdminPanel({
  table,
  categories,
  entries,
  onReload,
}: {
  table: RankingTableDetail["table"];
  categories: RankingCategory[];
  entries: RankingEntry[];
  onReload: () => void;
}) {
  const navigate = useNavigate();
  const ordered = useMemo(() => orderCategories(categories), [categories]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatPoints, setNewCatPoints] = useState("1");
  const [title, setTitle] = useState(table.title);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const points = Number(newCatPoints) || 0;
    await addCategory(table.id, newCatName.trim(), points);
    setNewCatName("");
    setNewCatPoints("1");
    onReload();
  };

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const newOrder = [...ordered];
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    await reorderCategories(newOrder.map((c) => c.id));
    onReload();
  };

  const handleSaveTitle = async () => {
    if (!title.trim() || title === table.title) return;
    await updateTable(table.id, { title: title.trim() });
    onReload();
  };

  const handleSelectIcon = async (icon: string) => {
    if (icon === table.icon) return;
    await updateTable(table.id, { icon });
    onReload();
  };

  const handleDeleteTable = async () => {
    if (!confirm(`Excluir a tabela "${table.title}"? Isso apaga todo o histórico.`)) return;
    await deleteTable(table.id);
    navigate("/ranking");
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(201,165,90,0.15)] rounded-xl p-4 flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
          Título da tabela
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
          Emoji
        </p>
        <div className="flex flex-wrap gap-2">
          {RANKING_ICONS.map((e) => (
            <button
              key={e}
              onClick={() => handleSelectIcon(e)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base border transition-all ${
                table.icon === e
                  ? "bg-[rgba(201,165,90,0.15)] border-[rgba(201,165,90,0.4)]"
                  : "bg-[var(--bg-elevated)] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <AddPersonSection tableId={table.id} entries={entries} onReload={onReload} />

      <div>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
          Categorias de pontuação
        </p>
        <div className="flex flex-col gap-2 mb-3">
          {ordered.map((cat, i) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              canMoveUp={i > 0}
              canMoveDown={i < ordered.length - 1}
              onMoveUp={() => handleMoveCategory(i, -1)}
              onMoveDown={() => handleMoveCategory(i, 1)}
              onSaved={onReload}
              onDeleted={onReload}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nova categoria (ex: Acertos)"
            className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
          />
          <input
            type="number"
            inputMode="decimal"
            value={newCatPoints}
            onChange={(e) => setNewCatPoints(e.target.value)}
            className="w-20 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCatName.trim()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] disabled:opacity-50 transition-all shrink-0"
          >
            + Nova
          </button>
        </div>
      </div>

      <button
        onClick={handleDeleteTable}
        className="text-xs text-[var(--red)] underline underline-offset-2 self-start"
      >
        Excluir tabela
      </button>
    </div>
  );
}

function CategoryRow({
  category,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onSaved,
  onDeleted,
}: {
  category: RankingCategory;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [points, setPoints] = useState(String(category.points_per_unit));

  const handleBlurName = async () => {
    if (!name.trim() || name === category.name) return;
    await updateCategory(category.id, { name: name.trim() });
    onSaved();
  };

  const handleBlurPoints = async () => {
    const parsed = Number(points);
    if (Number.isNaN(parsed) || parsed === category.points_per_unit) return;
    await updateCategory(category.id, { points_per_unit: parsed });
    onSaved();
  };

  const handleDelete = async () => {
    if (!confirm(`Remover a categoria "${category.name}"?`)) return;
    await deleteCategory(category.id);
    onDeleted();
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-col">
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="text-[var(--text-muted)] disabled:opacity-20 leading-none text-xs px-1"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="text-[var(--text-muted)] disabled:opacity-20 leading-none text-xs px-1"
        >
          ▼
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlurName}
        className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
      />
      <input
        type="number"
        inputMode="decimal"
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        onBlur={handleBlurPoints}
        className="w-16 bg-[var(--bg-elevated)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
      />
      <button onClick={handleDelete} className="p-2 text-[var(--red)] text-xs">
        ✕
      </button>
    </div>
  );
}

// ─── Standings table ────────────────────────────────────────

function StandingsTable({
  entries,
  categories,
  pendingByCell,
  isAdmin,
  onCellClick,
  onPendingClick,
  onDeleteEntry,
}: {
  entries: RankingEntry[];
  categories: RankingCategory[];
  pendingByCell: Map<string, RankingPendingEdit>;
  isAdmin: boolean;
  onCellClick: (entry: RankingEntry, category: RankingCategory) => void;
  onPendingClick: (edit: RankingPendingEdit, entry: RankingEntry, category: RankingCategory) => void;
  onDeleteEntry: (entry: RankingEntry) => void;
}) {
  const ordered = orderCategories(categories);
  const sorted = sortEntries(entries, categories);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        Nenhuma pessoa na tabela ainda
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[480px]">
        <thead>
          <tr className="text-[0.65rem] text-[var(--text-muted)] uppercase tracking-widest">
            <th className="text-left font-medium px-2 py-1 w-8">#</th>
            <th className="text-left font-medium px-2 py-1">Nome</th>
            {ordered.map((c) => (
              <th key={c.id} className="text-center font-medium px-2 py-1 whitespace-nowrap">
                {c.name}
              </th>
            ))}
            <th className="text-center font-medium px-2 py-1">Pontos</th>
            {isAdmin && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => {
            const total = calculateTotal(entry, ordered);
            return (
              <tr key={entry.id} className="bg-[var(--bg-card)]">
                <td className="px-2 py-2.5 rounded-l-xl text-center text-xs">
                  {i < 3 ? MEDALS[i] : i + 1}
                </td>
                <td className="px-2 py-2.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Avatar url={entry.avatar_url} name={entry.display_name} size="xs" />
                    {entry.display_name}
                  </div>
                </td>
                {ordered.map((c) => {
                  const pending = pendingByCell.get(pendingKey(entry.id, c.id));
                  return (
                    <td key={c.id} className="px-2 py-2.5 text-center">
                      <button
                        onClick={() =>
                          pending ? onPendingClick(pending, entry, c) : onCellClick(entry, c)
                        }
                        className={`min-w-[2.5rem] px-2 py-1 rounded-lg text-xs transition-colors ${
                          pending
                            ? "bg-[rgba(201,165,90,0.15)] text-[var(--gold)] border border-[rgba(201,165,90,0.3)]"
                            : "text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)]"
                        }`}
                        title={pending ? `Pendente: ${pending.previous_value} → ${pending.new_value}` : undefined}
                      >
                        {pending ? `🕓 ${pending.new_value}` : (entry.values[c.id] ?? 0)}
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-center font-bold text-[var(--gold)]">
                  {total}
                </td>
                {isAdmin && (
                  <td className="px-1 py-2.5 rounded-r-xl">
                    <button
                      onClick={() => onDeleteEntry(entry)}
                      className="text-[var(--red)] text-xs p-1"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RankingDetailPage ──────────────────────────────────────

export function RankingDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<RankingTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editingCell, setEditingCell] = useState<{ entry: RankingEntry; category: RankingCategory } | null>(null);
  const [pendingSheet, setPendingSheet] = useState<{
    edit: RankingPendingEdit;
    entry: RankingEntry;
    category: RankingCategory;
  } | null>(null);

  const load = useCallback(async () => {
    if (!tableId) return;
    const data = await fetchTableDetail(tableId);
    setDetail(data);
    setLoading(false);
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tableId) return;
    const channel = subscribeRankingTable(tableId, load);
    return () => {
      channel.unsubscribe();
    };
  }, [tableId, load]);

  const isAdmin = !!user && !!detail && user.id === detail.table.created_by;

  const pendingByCell = useMemo(() => {
    const map = new Map<string, RankingPendingEdit>();
    if (!detail) return map;
    for (const edit of detail.pendingEdits) {
      map.set(pendingKey(edit.entry_id, edit.category_id), edit);
    }
    return map;
  }, [detail]);

  const handleDeleteEntry = async (entry: RankingEntry) => {
    if (!confirm(`Remover "${entry.display_name}" da tabela?`)) return;
    await deleteEntry(entry.id);
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-[var(--bg-abyss)] flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-[var(--text-muted)]">Tabela não encontrada</p>
        <button onClick={() => navigate("/ranking")} className="text-xs text-[var(--gold)] underline">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg-abyss)]"
      style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
    >
      <div className="px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate("/ranking")} className="text-[var(--text-muted)] shrink-0">
            ←
          </button>
          <h1
            className="text-xl font-bold text-[var(--gold)] truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {detail.table.icon} {detail.table.title}
          </h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdmin((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(201,165,90,0.12)] text-[var(--gold)] border border-[rgba(201,165,90,0.25)] shrink-0 transition-all"
          >
            ⚙️ {showAdmin ? "Fechar" : "Administrar"}
          </button>
        )}
      </div>

      <div className="px-4 flex flex-col gap-4">
        {showAdmin && isAdmin && (
          <AdminPanel
            table={detail.table}
            categories={detail.categories}
            entries={detail.entries}
            onReload={load}
          />
        )}

        <StandingsTable
          entries={detail.entries}
          categories={detail.categories}
          pendingByCell={pendingByCell}
          isAdmin={isAdmin}
          onCellClick={(entry, category) => setEditingCell({ entry, category })}
          onPendingClick={(edit, entry, category) => setPendingSheet({ edit, entry, category })}
          onDeleteEntry={handleDeleteEntry}
        />
      </div>

      {editingCell && (
        <EditValueSheet
          entry={editingCell.entry}
          category={editingCell.category}
          isAdmin={isAdmin}
          onClose={() => setEditingCell(null)}
          onSaved={() => {
            setEditingCell(null);
            load();
          }}
        />
      )}

      {pendingSheet && user && (
        <PendingEditSheet
          edit={pendingSheet.edit}
          entryName={pendingSheet.entry.display_name}
          categoryName={pendingSheet.category.name}
          currentUserId={user.id}
          onClose={() => setPendingSheet(null)}
          onResolved={() => {
            setPendingSheet(null);
            load();
          }}
        />
      )}
    </div>
  );
}
