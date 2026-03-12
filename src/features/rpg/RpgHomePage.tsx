/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchMyTables,
  createTable,
  joinTableByCode,
  fetchMySheets,
  createSheet,
  deleteSheet,
} from "./rpgService";
import type { RpgTable, RpgSheet } from "./rpgTypes";

export function RpgHomePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<RpgTable[]>([]);
  const [sheets, setSheets] = useState<RpgSheet[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showJoinTable, setShowJoinTable] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  // Form fields
  const [tableName, setTableName] = useState("");
  const [tableDesc, setTableDesc] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [t, s] = await Promise.all([
      fetchMyTables(user.id),
      fetchMySheets(user.id),
    ]);
    setTables(t);
    setSheets(s);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateTable = async () => {
    if (!user || !tableName.trim()) return;
    setFormLoading(true);
    setFormError("");
    const { data: t, error: tErr } = await createTable(
      tableName.trim(),
      tableDesc.trim(),
      user.id,
    );
    if (t) {
      setShowCreateTable(false);
      setTableName("");
      setTableDesc("");
      navigate(`/rpg/mesa/${t.id}`);
    } else {
      setFormError(tErr ?? "Erro ao criar mesa. Tente novamente.");
    }
    setFormLoading(false);
  };

  const handleJoinTable = async () => {
    if (!user || !inviteInput.trim()) return;
    setFormLoading(true);
    setFormError("");
    const { table, error } = await joinTableByCode(inviteInput.trim(), user.id);
    if (error && error !== "Você já está nessa Mesa!") {
      setFormError(error);
    } else if (table) {
      setShowJoinTable(false);
      setInviteInput("");
      navigate(`/rpg/mesa/${table.id}`);
    }
    setFormLoading(false);
  };

  const handleCreateSheet = async () => {
    if (!user || !sheetName.trim()) return;
    setFormLoading(true);
    setFormError("");
    const { data: s, error: sErr } = await createSheet(
      user.id,
      sheetName.trim(),
    );
    if (s) {
      setShowCreateSheet(false);
      setSheetName("");
      navigate(`/rpg/ficha/${s.id}`);
    } else {
      setFormError(sErr ?? "Erro ao criar ficha. Tente novamente.");
    }
    setFormLoading(false);
  };

  const handleDeleteSheet = async (sheetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Excluir esta ficha permanentemente?")) return;
    await deleteSheet(sheetId);
    setSheets((prev) => prev.filter((s) => s.id !== sheetId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60dvh]">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-0 pb-6"
      style={{ minHeight: "calc(100dvh - 56px)" }}
    >
      {/* Hero */}
      <div className="px-4 pt-5 pb-4 border-b border-[rgba(201,165,90,0.06)]">
        <h1
          className="text-xl font-bold text-(--gold)"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Mesas de RPG
        </h1>
        <p className="text-sm text-(--text-muted) mt-0.5">
          Bem-vindo, {profile?.display_name}
        </p>
      </div>

      {/* MESAS */}
      <section className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.7rem] font-bold text-(--text-muted) uppercase tracking-widest">
            Minhas Mesas
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowJoinTable(true);
                setFormError("");
              }}
              className="text-[0.75rem] px-3 py-1 rounded-lg border border-[rgba(201,165,90,0.2)] text-(--gold) hover:bg-[rgba(201,165,90,0.06)] transition-colors"
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setShowCreateTable(true);
                setFormError("");
              }}
              className="text-[0.75rem] px-3 py-1 rounded-lg bg-[rgba(201,165,90,0.12)] text-(--gold) hover:bg-[rgba(201,165,90,0.2)] transition-colors font-semibold"
            >
              + Nova Mesa
            </button>
          </div>
        </div>

        {tables.length === 0 ? (
          <EmptyCard
            icon="🏰"
            title="Nenhuma mesa ainda"
            sub="Crie uma nova mesa ou entre com um código de convite"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {tables.map((t) => (
              <TableCard
                key={t.id}
                table={t}
                isMaster={t.master_id === user?.id}
                onClick={() => navigate(`/rpg/mesa/${t.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="mx-4 my-5 h-px bg-gradient-to-r from-transparent via-[rgba(201,165,90,0.1)] to-transparent" />

      {/* FICHAS */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.7rem] font-bold text-(--text-muted) uppercase tracking-widest">
            Minhas Fichas
          </h2>
          <button
            onClick={() => setShowCreateSheet(true)}
            className="text-[0.75rem] px-3 py-1 rounded-lg bg-[rgba(201,165,90,0.12)] text-(--gold) hover:bg-[rgba(201,165,90,0.2)] transition-colors font-semibold"
          >
            + Nova Ficha
          </button>
        </div>

        {sheets.length === 0 ? (
          <EmptyCard
            icon="📜"
            title="Nenhuma ficha criada"
            sub="Crie sua primeira ficha de personagem D&D"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sheets.map((s) => (
              <SheetCard
                key={s.id}
                sheet={s}
                onClick={() => navigate(`/rpg/ficha/${s.id}`)}
                onDelete={(e) => handleDeleteSheet(s.id, e)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Modal Criar Mesa ── */}
      {showCreateTable && (
        <Modal title="Nova Mesa" onClose={() => setShowCreateTable(false)}>
          <label className="text-xs text-(--text-muted) mb-1 block">
            Nome da Mesa *
          </label>
          <input
            autoFocus
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="Ex: A Maldição de Strahd"
            className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) mb-3 focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            maxLength={60}
          />
          <label className="text-xs text-(--text-muted) mb-1 block">
            Descrição (opcional)
          </label>
          <textarea
            value={tableDesc}
            onChange={(e) => setTableDesc(e.target.value)}
            placeholder="Uma campanha épica..."
            rows={2}
            className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) mb-3 resize-none focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            maxLength={200}
          />
          {formError && (
            <p className="text-xs text-(--red) mb-2">{formError}</p>
          )}
          <button
            onClick={handleCreateTable}
            disabled={!tableName.trim() || formLoading}
            className="w-full py-2.5 rounded-lg bg-[rgba(201,165,90,0.15)] text-(--gold) font-bold text-sm disabled:opacity-40 hover:bg-[rgba(201,165,90,0.25)] transition-colors"
          >
            {formLoading ? "Criando..." : "Criar Mesa"}
          </button>
        </Modal>
      )}

      {/* ── Modal Entrar na Mesa ── */}
      {showJoinTable && (
        <Modal
          title="Entrar em uma Mesa"
          onClose={() => setShowJoinTable(false)}
        >
          <label className="text-xs text-(--text-muted) mb-1 block">
            Código de convite
          </label>
          <input
            autoFocus
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
            placeholder="Ex: ABC123"
            maxLength={6}
            className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) mb-3 focus:outline-none focus:border-[rgba(201,165,90,0.4)] font-mono tracking-widest text-center text-lg uppercase"
          />
          {formError && (
            <p className="text-xs text-(--red) mb-2">{formError}</p>
          )}
          <button
            onClick={handleJoinTable}
            disabled={inviteInput.length < 6 || formLoading}
            className="w-full py-2.5 rounded-lg bg-[rgba(201,165,90,0.15)] text-(--gold) font-bold text-sm disabled:opacity-40 hover:bg-[rgba(201,165,90,0.25)] transition-colors"
          >
            {formLoading ? "Entrando..." : "Entrar na Mesa"}
          </button>
        </Modal>
      )}

      {/* ── Modal Criar Ficha ── */}
      {showCreateSheet && (
        <Modal
          title="Nova Ficha de Personagem"
          onClose={() => {
            setShowCreateSheet(false);
            setFormError("");
            setSheetName("");
          }}
        >
          <label className="text-xs text-(--text-muted) mb-1 block">
            Nome do Personagem *
          </label>
          <input
            autoFocus
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateSheet()}
            placeholder="Ex: Thorin Escudobreaker"
            className="w-full bg-[var(--bg-elevated)] border border-[rgba(201,165,90,0.15)] rounded-lg px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) mb-3 focus:outline-none focus:border-[rgba(201,165,90,0.4)]"
            maxLength={50}
          />
          {formError && (
            <p className="text-xs text-(--red) mb-3">{formError}</p>
          )}
          <button
            onClick={handleCreateSheet}
            disabled={!sheetName.trim() || formLoading}
            className="w-full py-2.5 rounded-lg bg-[rgba(201,165,90,0.15)] text-(--gold) font-bold text-sm disabled:opacity-40 hover:bg-[rgba(201,165,90,0.25)] transition-colors"
          >
            {formLoading ? "Criando..." : "Criar Ficha"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function TableCard({
  table,
  isMaster,
  onClick,
}: {
  table: RpgTable;
  isMaster: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] hover:border-[rgba(201,165,90,0.18)] hover:bg-[var(--bg-elevated)] transition-all active:scale-[0.98]"
    >
      {/* Icon */}
      <div className="w-11 h-11 rounded-lg bg-[rgba(201,165,90,0.08)] flex items-center justify-center text-xl flex-shrink-0">
        {table.image_url ? (
          <img
            src={table.image_url}
            className="w-full h-full object-cover rounded-lg"
            alt=""
          />
        ) : (
          "🏰"
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-(--text-primary) truncate">
            {table.name}
          </span>
          {table.is_active && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-(--green) shadow-[0_0_6px_rgba(58,186,122,0.7)]" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isMaster ? (
            <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-[rgba(201,165,90,0.1)] text-(--gold) font-semibold">
              Mestre
            </span>
          ) : (
            <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-(--text-muted)">
              Jogador
            </span>
          )}
          <span className="text-xs text-(--text-muted)">
            {table.session_count} sessões
          </span>
        </div>
      </div>

      <span className="text-(--text-muted) text-lg">›</span>
    </button>
  );
}

function SheetCard({
  sheet,
  onClick,
  onDelete,
}: {
  sheet: RpgSheet;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const hpPct = Math.max(
    0,
    Math.min(100, (sheet.current_hp / Math.max(1, sheet.max_hp)) * 100),
  );
  const hpColor =
    hpPct > 60 ? "var(--green)" : hpPct > 30 ? "#e8a020" : "var(--red)";

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] hover:border-[rgba(201,165,90,0.18)] hover:bg-[var(--bg-elevated)] transition-all active:scale-[0.98]"
    >
      <div className="w-11 h-11 rounded-lg bg-[rgba(201,165,90,0.08)] flex items-center justify-center text-xl flex-shrink-0">
        ⚔️
      </div>

      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm text-(--text-primary) truncate block">
          {sheet.character_name}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-(--text-muted)">
            {sheet.race || "Sem raça"}{" "}
            {sheet.class_name && `· ${sheet.class_name}`}
          </span>
          <span className="text-xs text-(--text-muted)">
            Nível {sheet.level}
          </span>
        </div>
        {/* HP bar */}
        <div className="mt-1.5 h-1 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden w-24">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${hpPct}%`, background: hpColor }}
          />
        </div>
      </div>

      <button
        onClick={onDelete}
        className="p-2 text-(--text-muted) hover:text-(--red) transition-colors"
        aria-label="Excluir ficha"
      >
        🗑
      </button>
    </button>
  );
}

function EmptyCard({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[rgba(201,165,90,0.12)] p-6 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-semibold text-(--text-primary)">{title}</p>
      <p className="text-xs text-(--text-muted) mt-1">{sub}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[201] bg-[var(--bg-deep)] rounded-t-2xl border-t border-[rgba(201,165,90,0.1)] p-5"
        style={{ paddingBottom: "calc(20px + var(--safe-bottom))" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-base font-bold text-(--gold)"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <button onClick={onClose} className="text-(--text-muted) p-1">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
