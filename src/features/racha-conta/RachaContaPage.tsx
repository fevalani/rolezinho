import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import type {
  Group,
  GroupMember,
  Expense,
  Payment,
  DebtTransaction,
  GlobalDebtTransaction,
  SplitType,
  ExpenseCategory,
  SplitsMap,
} from "@/lib/types";
import {
  fetchGroups,
  fetchAllProfiles,
  createGroup,
  updateGroup,
  createExpense,
  updateExpense,
  deleteExpense,
  createPayment,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "@/features/racha-conta/rachaContaService";
import { getInitials } from "@/lib/utils";

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIES: ExpenseCategory[] = [
  "alimentação",
  "bebidas",
  "hospedagem",
  "transporte",
  "lazer",
  "moradia",
  "compras",
  "outros",
];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  alimentação: "#f59e0b",
  bebidas: "#8b5cf6",
  hospedagem: "#06b6d4",
  transporte: "#10b981",
  lazer: "#f43f5e",
  moradia: "#3b82f6",
  compras: "#ec4899",
  outros: "#6b7280",
};

const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  alimentação: "🍽️",
  bebidas: "🍺",
  hospedagem: "🏨",
  transporte: "🚗",
  lazer: "🎮",
  moradia: "🏠",
  compras: "🛍️",
  outros: "💳",
};

const EMOJIS = [
  "🎉",
  "🏖️",
  "🏠",
  "🚗",
  "🍕",
  "✈️",
  "🎮",
  "💼",
  "🎂",
  "⚽",
  "🏕️",
  "🎵",
];

// ─── Algoritmo de mínimo de transações ───────────────────────────────────────

function computeDebts(
  members: GroupMember[],
  expenses: Expense[],
  payments: Payment[],
): DebtTransaction[] {
  const balance: Record<string, number> = {};
  members.forEach((m) => (balance[m.id] = 0));

  expenses.forEach((exp) => {
    const parts = exp.participant_ids;
    const shares: Record<string, number> = {};
    if (exp.split_type === "equal") {
      const share = exp.amount / parts.length;
      parts.forEach((p) => (shares[p] = share));
    } else if (exp.split_type === "custom") {
      Object.assign(shares, exp.splits);
    } else {
      parts.forEach(
        (p) => (shares[p] = ((exp.splits[p] ?? 0) / 100) * exp.amount),
      );
    }
    parts.forEach((p) => {
      if (p !== exp.paid_by) {
        balance[exp.paid_by] = (balance[exp.paid_by] ?? 0) + (shares[p] ?? 0);
        balance[p] = (balance[p] ?? 0) - (shares[p] ?? 0);
      }
    });
  });

  payments.forEach((pay) => {
    balance[pay.from_member_id] =
      (balance[pay.from_member_id] ?? 0) + pay.amount;
    balance[pay.to_member_id] = (balance[pay.to_member_id] ?? 0) - pay.amount;
  });

  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];
  Object.entries(balance).forEach(([id, val]) => {
    if (val > 0.005) creditors.push({ id, amount: val });
    if (val < -0.005) debtors.push({ id, amount: -val });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const txs: DebtTransaction[] = [];
  let ci = 0,
    di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.amount, d.amount);
    txs.push({ from: d.id, to: c.id, amount: parseFloat(amount.toFixed(2)) });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount < 0.005) ci++;
    if (d.amount < 0.005) di++;
  }
  return txs;
}

function getMember(
  members: GroupMember[],
  id: string,
): GroupMember | undefined {
  return members.find((m) => m.id === id);
}

// ─── Componentes UI ───────────────────────────────────────────────────────────

function RcAvatar({
  member,
  letter,
  size = 36,
  color = "#7c3aed",
}: {
  member?: GroupMember;
  letter?: string;
  size?: number;
  color?: string;
}) {
  const bg = (member?.is_app_user ?? true) ? color : "#6b7280";
  const ltr = letter ?? member?.avatar_letter ?? "?";
  if (member?.avatar_url && member.avatar_url.startsWith("http")) {
    return (
      <img
        src={member.avatar_url}
        alt={member.display_name}
        referrerPolicy="no-referrer"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: `2px solid ${bg}55`,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        border: `2px solid ${bg}55`,
      }}
    >
      {ltr}
    </div>
  );
}

function Tag({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function MoneyBadge({
  amount,
  positive,
}: {
  amount: number;
  positive: boolean;
}) {
  const color = positive ? "#10b981" : "#f43f5e";
  return (
    <span
      style={{
        background: color + "18",
        color,
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: "3px 10px",
        fontWeight: 700,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      {positive ? "+" : "-"}R$ {Math.abs(amount).toFixed(2)}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "1px solid #2d2d4e",
          borderRadius: 16,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#e2e8f0",
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "#94a3b8",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputSt: React.CSSProperties = {
  width: "100%",
  background: "#0f0f23",
  border: "1px solid #2d2d4e",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#e2e8f0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function RcInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  step,
}: {
  label?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        step={step}
        style={inputSt}
      />
    </div>
  );
}

function RcSelect({
  label,
  value,
  onChange,
  children,
}: {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </label>
      )}
      <select value={value} onChange={onChange} style={{ ...inputSt }}>
        {children}
      </select>
    </div>
  );
}

function Btn({
  onClick,
  children,
  variant = "primary",
  small = false,
  danger = false,
  disabled = false,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost";
  small?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const bg = disabled
    ? "#2d2d4e"
    : danger
      ? "#f43f5e"
      : variant === "primary"
        ? "#7c3aed"
        : variant === "outline"
          ? "transparent"
          : "#1e1e3f";
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: bg,
        border: variant === "outline" ? "1px solid #4a4a6e" : "none",
        borderRadius: 8,
        color: disabled ? "#64748b" : "#fff",
        padding: small ? "6px 12px" : "10px 18px",
        fontWeight: 600,
        fontSize: small ? 12 : 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "opacity .15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Modal: Grupo ─────────────────────────────────────────────────────────────

function GroupModal({
  group,
  myProfileId,
  onSaved,
  onClose,
}: {
  group: Group | null;
  myProfileId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const editing = !!group;
  const [name, setName] = useState(group?.name ?? "");
  const [emoji, setEmoji] = useState(group?.emoji ?? "🎉");
  const [allProfiles, setAllProfiles] = useState<
    { id: string; display_name: string; avatar_url: string | null }[]
  >([]);
  // Em modo edição, os member.id são split_group_members.id (UUIDs do banco),
  // mas para criar/adicionar membros precisamos do profile_id real.
  // O GroupModal usa allProfiles para mapear — mantemos profile ids aqui.
  // Na edição apenas adicionamos novos; remoção fica para uma próxima iteração.
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [extName, setExtName] = useState("");
  const [externalNames, setExternalNames] = useState<string[]>(
    group?.members.filter((m) => !m.is_app_user).map((m) => m.display_name) ??
      [],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAllProfiles().then(setAllProfiles);
  }, []);

  const toggleProfile = (id: string) =>
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const addExternal = () => {
    if (!extName.trim()) return;
    setExternalNames((prev) => [...prev, extName.trim()]);
    setExtName("");
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    if (editing && group) {
      const existingExtNames = group.members
        .filter((m) => !m.is_app_user)
        .map((m) => m.display_name);
      const newExtNames = externalNames.filter(
        (n) => !existingExtNames.includes(n),
      );
      await updateGroup(
        {
          groupId: group.id,
          name: name.trim(),
          emoji,
          addAppMemberProfileIds: selectedProfileIds,
          addExternalNames: newExtNames,
        },
        myProfileId,
      );
    } else {
      await createGroup({
        name: name.trim(),
        emoji,
        myProfileId,
        appMemberProfileIds: selectedProfileIds,
        externalMemberNames: externalNames,
      });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  const otherProfiles = allProfiles.filter((p) => p.id !== myProfileId);

  return (
    <Modal title={editing ? "Editar Grupo" : "Novo Grupo"} onClose={onClose}>
      <RcInput
        label="Nome do grupo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Viagem Rio"
      />
      <Field label="Emoji">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              style={{
                background: emoji === e ? "#7c3aed33" : "#0f0f23",
                border: emoji === e ? "1px solid #7c3aed" : "1px solid #2d2d4e",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Usuários do App">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {otherProfiles.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Nenhum outro usuário cadastrado.
            </div>
          )}
          {otherProfiles.map((p) => {
            const selected = selectedProfileIds.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => toggleProfile(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: selected ? "#7c3aed22" : "#0f0f23",
                  border: `1px solid ${selected ? "#7c3aed" : "#2d2d4e"}`,
                }}
              >
                <RcAvatar letter={getInitials(p.display_name)} size={30} />
                <span style={{ color: "#e2e8f0", flex: 1 }}>
                  {p.display_name}
                </span>
                {selected && <span style={{ color: "#7c3aed" }}>✓</span>}
              </div>
            );
          })}
        </div>
      </Field>
      <Field label="Adicionar Externo">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            placeholder="Nome da pessoa"
            onKeyDown={(e) => e.key === "Enter" && addExternal()}
            style={{ ...inputSt, flex: 1 }}
          />
          <Btn onClick={addExternal} small>
            + Add
          </Btn>
        </div>
        {externalNames.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {externalNames.map((n, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  background: "#6b728022",
                  borderRadius: 8,
                  border: "1px solid #6b728044",
                }}
              >
                <RcAvatar letter={getInitials(n)} size={26} color="#6b7280" />
                <span style={{ flex: 1, color: "#94a3b8", fontSize: 13 }}>
                  {n}
                </span>
                <button
                  onClick={() =>
                    setExternalNames((prev) => prev.filter((_, j) => j !== i))
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#f43f5e",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} variant="outline">
          Cancelar
        </Btn>
        <Btn onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Salvando…" : "Salvar"}
        </Btn>
      </div>
    </Modal>
  );
}

// ─── Modal: Gasto ─────────────────────────────────────────────────────────────

function ExpenseModal({
  expense,
  group,
  myProfileId,
  onSaved,
  onClose,
}: {
  expense: Expense | null;
  group: Group;
  myProfileId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const editing = !!expense;
  const [name, setName] = useState(expense?.name ?? "");
  const [amount, setAmount] = useState(expense?.amount.toString() ?? "");
  const [paidByMemberId, setPaid] = useState(
    expense?.paid_by ??
      group.members.find((m) => m.is_me)?.id ??
      group.members[0]?.id ??
      "",
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? "outros",
  );
  const [splitType, setSplitType] = useState<SplitType>(
    expense?.split_type ?? "equal",
  );
  const [participantIds, setParts] = useState<string[]>(
    expense?.participant_ids ?? group.members.map((m) => m.id),
  );
  const [splits, setSplits] = useState<SplitsMap>(expense?.splits ?? {});
  const [date, setDate] = useState(
    expense?.date ?? new Date().toISOString().split("T")[0],
  );
  const [saving, setSaving] = useState(false);

  const toggleParticipant = (id: string) =>
    setParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const numAmount = parseFloat(amount) || 0;
  const totalCustom = participantIds.reduce((s, p) => s + (splits[p] ?? 0), 0);
  const totalPercent = participantIds.reduce((s, p) => s + (splits[p] ?? 0), 0);
  const equalShare =
    participantIds.length > 0 ? numAmount / participantIds.length : 0;

  const isValid =
    name.trim() &&
    numAmount > 0 &&
    participantIds.length > 0 &&
    (splitType !== "custom" || Math.abs(totalCustom - numAmount) <= 0.01) &&
    (splitType !== "percent" || Math.abs(totalPercent - 100) <= 0.1);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    const base: CreateExpenseInput = {
      groupId: group.id,
      name: name.trim(),
      amount: numAmount,
      paidByMemberId,
      splitType,
      participantMemberIds: participantIds,
      splits: splitType === "equal" ? {} : splits,
      category,
      date,
      myProfileId,
    };
    const result =
      editing && expense
        ? await updateExpense({
            ...base,
            expenseId: expense.id,
          } satisfies UpdateExpenseInput)
        : await createExpense(base);
    setSaving(false);
    if (result) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      title={editing ? "Editar Gasto" : "Novo Gasto"}
      onClose={onClose}
      width={560}
    >
      <RcInput
        label="Descrição"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Pizza da sexta"
      />
      <RcInput
        label="Valor (R$)"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0,00"
        min="0.01"
        step="0.01"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <RcSelect
          label="Pago por"
          value={paidByMemberId}
          onChange={(e) => setPaid(e.target.value)}
        >
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </RcSelect>
        <RcSelect
          label="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </RcSelect>
      </div>
      <RcInput
        label="Data"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <Field label="Tipo de divisão">
        <div style={{ display: "flex", gap: 8 }}>
          {(["equal", "custom", "percent"] as SplitType[]).map((v) => (
            <button
              key={v}
              onClick={() => setSplitType(v)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: splitType === v ? "#7c3aed" : "#0f0f23",
                border: `1px solid ${splitType === v ? "#7c3aed" : "#2d2d4e"}`,
                color: splitType === v ? "#fff" : "#94a3b8",
              }}
            >
              {v === "equal"
                ? "Igualitária"
                : v === "custom"
                  ? "Personalizada"
                  : "Porcentagem"}
            </button>
          ))}
        </div>
      </Field>
      <Field
        label={`Participantes${splitType !== "equal" ? (splitType === "custom" ? ` — R$ ${totalCustom.toFixed(2)} / R$ ${numAmount.toFixed(2)}` : ` — ${totalPercent.toFixed(1)}%`) : ""}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {group.members.map((m) => {
            const isIn = participantIds.includes(m.id);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: isIn ? "#7c3aed11" : "#0f0f23",
                  border: `1px solid ${isIn ? "#7c3aed44" : "#1a1a3e"}`,
                }}
              >
                <div
                  onClick={() => toggleParticipant(m.id)}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${isIn ? "#7c3aed" : "#4a4a6e"}`,
                      background: isIn ? "#7c3aed" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isIn && (
                      <span style={{ color: "#fff", fontSize: 11 }}>✓</span>
                    )}
                  </div>
                  <RcAvatar member={m} size={26} />
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>
                    {m.display_name}
                  </span>
                </div>
                {isIn && splitType === "equal" && (
                  <span
                    style={{ color: "#7c3aed", fontSize: 13, fontWeight: 600 }}
                  >
                    R$ {equalShare.toFixed(2)}
                  </span>
                )}
                {isIn && splitType === "custom" && (
                  <input
                    type="number"
                    value={splits[m.id] ?? ""}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    onChange={(e) =>
                      setSplits({
                        ...splits,
                        [m.id]: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{
                      width: 90,
                      background: "#0f0f23",
                      border: "1px solid #2d2d4e",
                      borderRadius: 6,
                      padding: "4px 8px",
                      color: "#e2e8f0",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                )}
                {isIn && splitType === "percent" && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <input
                      type="number"
                      value={splits[m.id] ?? ""}
                      placeholder="0"
                      min="0"
                      max="100"
                      onChange={(e) =>
                        setSplits({
                          ...splits,
                          [m.id]: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: 70,
                        background: "#0f0f23",
                        border: "1px solid #2d2d4e",
                        borderRadius: 6,
                        padding: "4px 8px",
                        color: "#e2e8f0",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                    <span style={{ color: "#94a3b8" }}>%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {splitType === "custom" && Math.abs(totalCustom - numAmount) > 0.01 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#f43f5e" }}>
            ⚠ A soma dos valores deve ser igual ao total
          </div>
        )}
        {splitType === "percent" && Math.abs(totalPercent - 100) > 0.1 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#f43f5e" }}>
            ⚠ Soma deve ser 100% (atual: {totalPercent.toFixed(1)}%)
          </div>
        )}
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} variant="outline">
          Cancelar
        </Btn>
        <Btn onClick={handleSave} disabled={!isValid || saving}>
          {saving ? "Salvando…" : "Salvar Gasto"}
        </Btn>
      </div>
    </Modal>
  );
}

// ─── Tela: Home ───────────────────────────────────────────────────────────────

function HomeScreen({
  groups,
  myMemberId,
  onGroupClick,
}: {
  groups: Group[];
  myMemberId: (groupId: string) => string;
  onGroupClick: (id: string) => void;
}) {
  const allTxs: GlobalDebtTransaction[] = [];
  const allMembers: Record<string, GroupMember> = {};
  groups.forEach((g) => {
    g.members.forEach((m) => {
      allMembers[m.id] = m;
    });
    computeDebts(g.members, g.expenses, g.payments).forEach((tx) =>
      allTxs.push({ ...tx, group_id: g.id, group_name: g.name }),
    );
  });

  const theyOweList = allTxs.filter((t) => allMembers[t.to]?.is_me);
  const iOweList = allTxs.filter((t) => allMembers[t.from]?.is_me);
  const totalExpenses = groups.reduce(
    (s, g) => s + g.expenses.reduce((ss, e) => ss + e.amount, 0),
    0,
  );
  const totalReceive = theyOweList.reduce((s, t) => s + t.amount, 0);
  const totalOwe = iOweList.reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {(
          [
            {
              label: "Total de Gastos",
              value: totalExpenses,
              icon: "💳",
              color: "#7c3aed",
            },
            {
              label: "A receber",
              value: totalReceive,
              icon: "📥",
              color: "#10b981",
            },
            { label: "A pagar", value: totalOwe, icon: "📤", color: "#f43f5e" },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            style={{
              background: card.color + "15",
              border: `1px solid ${card.color}33`,
              borderRadius: 14,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>{card.icon}</div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              {card.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>
              R$ {card.value.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {theyOweList.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#10b981",
              textTransform: "uppercase",
              letterSpacing: 1,
              margin: "0 0 12px",
            }}
          >
            📥 Quem te deve
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {theyOweList.map((t, i) => (
              <div
                key={i}
                onClick={() => onGroupClick(t.group_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#10b98110",
                  border: "1px solid #10b98130",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.transform = "translateX(4px)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.transform = "translateX(0)")
                }
              >
                <RcAvatar
                  member={allMembers[t.from]}
                  size={36}
                  color="#10b981"
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}
                  >
                    {allMembers[t.from]?.display_name}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {t.group_name}
                  </div>
                </div>
                <MoneyBadge amount={t.amount} positive />
              </div>
            ))}
          </div>
        </div>
      )}

      {iOweList.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#f43f5e",
              textTransform: "uppercase",
              letterSpacing: 1,
              margin: "0 0 12px",
            }}
          >
            📤 Você deve
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {iOweList.map((t, i) => (
              <div
                key={i}
                onClick={() => onGroupClick(t.group_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#f43f5e10",
                  border: "1px solid #f43f5e30",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.transform = "translateX(4px)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.transform = "translateX(0)")
                }
              >
                <RcAvatar member={allMembers[t.to]} size={36} color="#f43f5e" />
                <div style={{ flex: 1 }}>
                  <div
                    style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}
                  >
                    {allMembers[t.to]?.display_name}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {t.group_name}
                  </div>
                </div>
                <MoneyBadge amount={t.amount} positive={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      {theyOweList.length === 0 && iOweList.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "32px 20px",
            color: "#4a4a6e",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: "#7c3aed",
              marginBottom: 4,
            }}
          >
            Tudo quitado!
          </div>
          <div style={{ fontSize: 13 }}>Nenhuma dívida pendente</div>
        </div>
      )}

      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "24px 0 12px",
        }}
      >
        Seus Grupos
      </h3>
      {groups.length === 0 && (
        <div
          style={{ textAlign: "center", padding: "32px 0", color: "#4a4a6e" }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>💸</div>
          <div>Crie seu primeiro grupo para começar</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g) => {
          const myMid = myMemberId(g.id);
          const txs = computeDebts(g.members, g.expenses, g.payments);
          const recv = txs
            .filter((t) => t.to === myMid)
            .reduce((s, t) => s + t.amount, 0);
          const owe = txs
            .filter((t) => t.from === myMid)
            .reduce((s, t) => s + t.amount, 0);
          const balance = recv - owe;
          const total = g.expenses.reduce((s, e) => s + e.amount, 0);
          return (
            <div
              key={g.id}
              onClick={() => onGroupClick(g.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                background: "#0f0f23",
                border: "1px solid #1e1e3f",
                borderRadius: 12,
                cursor: "pointer",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#7c3aed66";
                e.currentTarget.style.background = "#7c3aed08";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "#1e1e3f";
                e.currentTarget.style.background = "#0f0f23";
              }}
            >
              <div style={{ fontSize: 28 }}>{g.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
                  {g.name}
                </div>
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  {g.members.length} pessoas · R$ {total.toFixed(2)} total
                </div>
              </div>
              {balance !== 0 ? (
                <MoneyBadge amount={balance} positive={balance > 0} />
              ) : (
                <span style={{ color: "#10b981", fontSize: 12 }}>
                  ✓ quitado
                </span>
              )}
              <span style={{ color: "#4a4a6e" }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tela: Detalhe do Grupo ───────────────────────────────────────────────────

type Tab = "debts" | "expenses" | "history" | "members";

function GroupDetail({
  group,
  myProfileId,
  onGroupUpdated,
}: {
  group: Group;
  myProfileId: string;
  onGroupUpdated: () => void;
}) {
  const myMemberId = group.members.find((m) => m.is_me)?.id ?? "";
  const [tab, setTab] = useState<Tab>("debts");
  const [showExpenseModal, setShowExpense] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const transactions = computeDebts(
    group.members,
    group.expenses,
    group.payments,
  );
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const myReceive = transactions
    .filter((t) => t.to === myMemberId)
    .reduce((s, t) => s + t.amount, 0);
  const myOwe = transactions
    .filter((t) => t.from === myMemberId)
    .reduce((s, t) => s + t.amount, 0);

  const handleDeleteExpense = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    await deleteExpense(confirmDelete, myProfileId);
    setDeleting(false);
    setConfirmDelete(null);
    onGroupUpdated();
  };

  const handleMarkPaid = async (tx: DebtTransaction) => {
    await createPayment({
      groupId: group.id,
      fromMemberId: tx.from,
      toMemberId: tx.to,
      amount: tx.amount,
      myProfileId,
    });
    onGroupUpdated();
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "debts", label: "Dívidas" },
    { id: "expenses", label: "Gastos" },
    { id: "history", label: "Histórico" },
    { id: "members", label: "Membros" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 36 }}>{group.emoji}</div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#e2e8f0",
              }}
            >
              {group.name}
            </h2>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {group.members.length} membros · criado em{" "}
              {group.created_at.split("T")[0]}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
          }}
        >
          {(
            [
              { label: "Total gasto", value: total, color: "#7c3aed" },
              { label: "Você recebe", value: myReceive, color: "#10b981" },
              { label: "Você deve", value: myOwe, color: "#f43f5e" },
            ] as const
          ).map((c) => (
            <div
              key={c.label}
              style={{
                background: c.color + "15",
                border: `1px solid ${c.color}33`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                {c.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>
                R$ {c.value.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          background: "#0f0f23",
          borderRadius: 10,
          padding: 4,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: tab === t.id ? "#7c3aed" : "transparent",
              color: tab === t.id ? "#fff" : "#64748b",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "debts" && (
        <div>
          {transactions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#4a4a6e",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
              <div style={{ color: "#10b981", fontWeight: 600 }}>
                Tudo quitado!
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                {transactions.length} transaç
                {transactions.length !== 1 ? "ões" : "ão"} necessária
                {transactions.length !== 1 ? "s" : ""} (otimizado)
              </div>
              {transactions.map((t, i) => {
                const fromM = getMember(group.members, t.from);
                const toM = getMember(group.members, t.to);
                const isMeFrom = t.from === myMemberId;
                const isMeTo = t.to === myMemberId;
                const color = isMeFrom
                  ? "#f43f5e"
                  : isMeTo
                    ? "#10b981"
                    : "#94a3b8";
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      background: color + "10",
                      border: `1px solid ${color}33`,
                      borderRadius: 12,
                    }}
                  >
                    <RcAvatar member={fromM} size={36} color={color} />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          color: "#e2e8f0",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {fromM?.display_name}
                        <span style={{ color: "#64748b", fontWeight: 400 }}>
                          {" "}
                          →{" "}
                        </span>
                        {toM?.display_name}
                      </div>
                      {isMeFrom && (
                        <div style={{ color: "#f43f5e", fontSize: 12 }}>
                          Você precisa pagar
                        </div>
                      )}
                      {isMeTo && (
                        <div style={{ color: "#10b981", fontSize: 12 }}>
                          Você vai receber
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      <MoneyBadge amount={t.amount} positive={isMeTo} />
                      <button
                        onClick={() => handleMarkPaid(t)}
                        style={{
                          background: "#10b98122",
                          border: "1px solid #10b98144",
                          color: "#10b981",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Marcar pago ✓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "expenses" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <span style={{ color: "#94a3b8", fontSize: 13 }}>
              {group.expenses.length} gasto
              {group.expenses.length !== 1 ? "s" : ""}
            </span>
            <Btn
              onClick={() => {
                setEditExpense(null);
                setShowExpense(true);
              }}
              small
            >
              + Novo gasto
            </Btn>
          </div>
          {group.expenses.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#4a4a6e",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
              <div>Nenhum gasto ainda</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...group.expenses].reverse().map((exp) => {
                const catColor = CATEGORY_COLORS[exp.category] ?? "#6b7280";
                const paidByMember = getMember(group.members, exp.paid_by);
                const splitLabels: Record<SplitType, string> = {
                  equal: "Igualitário",
                  custom: "Personalizado",
                  percent: "Porcentagem",
                };
                let myShare = 0;
                if (exp.participant_ids.includes(myMemberId)) {
                  if (exp.split_type === "equal")
                    myShare = exp.amount / exp.participant_ids.length;
                  else if (exp.split_type === "custom")
                    myShare = exp.splits[myMemberId] ?? 0;
                  else if (exp.split_type === "percent")
                    myShare =
                      ((exp.splits[myMemberId] ?? 0) / 100) * exp.amount;
                }
                return (
                  <div
                    key={exp.id}
                    style={{
                      background: "#0f0f23",
                      border: "1px solid #1e1e3f",
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: catColor + "22",
                          border: `1px solid ${catColor}44`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                        }}
                      >
                        {CATEGORY_ICONS[exp.category]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: "#e2e8f0",
                                fontWeight: 600,
                                fontSize: 15,
                              }}
                            >
                              {exp.name}
                            </div>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              Pago por{" "}
                              <strong style={{ color: "#94a3b8" }}>
                                {paidByMember?.display_name}
                              </strong>{" "}
                              · {exp.date}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                color: "#e2e8f0",
                                fontWeight: 700,
                                fontSize: 16,
                              }}
                            >
                              R$ {exp.amount.toFixed(2)}
                            </div>
                            {exp.participant_ids.includes(myMemberId) && (
                              <div style={{ color: "#7c3aed", fontSize: 12 }}>
                                Sua parte: R$ {myShare.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <Tag color={catColor} label={exp.category} />
                          <Tag
                            color="#7c3aed"
                            label={splitLabels[exp.split_type]}
                          />
                          <Tag
                            color="#64748b"
                            label={`${exp.participant_ids.length} pessoas`}
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      <Btn
                        onClick={() => {
                          setEditExpense(exp);
                          setShowExpense(true);
                        }}
                        small
                        variant="outline"
                      >
                        ✏️ Editar
                      </Btn>
                      <Btn
                        onClick={() => setConfirmDelete(exp.id)}
                        small
                        danger
                      >
                        🗑 Excluir
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          {group.payments.length === 0 && group.expenses.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#4a4a6e",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div>Nenhum histórico ainda</div>
            </div>
          ) : (
            <div>
              {group.payments.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4
                    style={{
                      fontSize: 12,
                      color: "#10b981",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      margin: "0 0 10px",
                    }}
                  >
                    Pagamentos realizados
                  </h4>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {[...group.payments].reverse().map((p) => {
                      const from = getMember(group.members, p.from_member_id);
                      const to = getMember(group.members, p.to_member_id);
                      return (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            background: "#10b98110",
                            border: "1px solid #10b98130",
                            borderRadius: 10,
                          }}
                        >
                          <span style={{ fontSize: 18 }}>✅</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#e2e8f0", fontSize: 13 }}>
                              <strong>{from?.display_name}</strong> pagou{" "}
                              <strong>{to?.display_name}</strong>
                            </div>
                            <div style={{ color: "#64748b", fontSize: 11 }}>
                              {p.date}
                            </div>
                          </div>
                          <span style={{ color: "#10b981", fontWeight: 700 }}>
                            R$ {p.amount.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {group.expenses.length > 0 && (
                <div>
                  <h4
                    style={{
                      fontSize: 12,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      margin: "0 0 10px",
                    }}
                  >
                    Histórico de gastos
                  </h4>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {[...group.expenses].reverse().map((exp) => {
                      const catColor =
                        CATEGORY_COLORS[exp.category] ?? "#6b7280";
                      const paidBy = getMember(group.members, exp.paid_by);
                      return (
                        <div
                          key={exp.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            background: "#0f0f23",
                            border: "1px solid #1e1e3f",
                            borderRadius: 10,
                          }}
                        >
                          <Tag color={catColor} label={exp.category} />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                color: "#e2e8f0",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {exp.name}
                            </div>
                            <div style={{ color: "#64748b", fontSize: 11 }}>
                              por {paidBy?.display_name} · {exp.date}
                            </div>
                          </div>
                          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>
                            R$ {exp.amount.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {group.members.map((m) => {
            const txs = computeDebts(
              group.members,
              group.expenses,
              group.payments,
            );
            const receives = txs
              .filter((t) => t.to === m.id)
              .reduce((s, t) => s + t.amount, 0);
            const owes = txs
              .filter((t) => t.from === m.id)
              .reduce((s, t) => s + t.amount, 0);
            const balance = receives - owes;
            const totalPaid = group.expenses
              .filter((e) => e.paid_by === m.id)
              .reduce((s, e) => s + e.amount, 0);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#0f0f23",
                  border: "1px solid #1e1e3f",
                  borderRadius: 12,
                }}
              >
                <RcAvatar
                  member={m}
                  size={40}
                  color={m.is_me ? "#7c3aed" : "#4a4a6e"}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
                    {m.display_name}
                    {m.is_me && (
                      <span style={{ color: "#7c3aed", fontSize: 12 }}>
                        {" "}
                        (você)
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {m.is_app_user ? "🟢 no app" : "⚫ externo"} · pagou R${" "}
                    {totalPaid.toFixed(2)}
                  </div>
                </div>
                {balance !== 0 ? (
                  <MoneyBadge
                    amount={Math.abs(balance)}
                    positive={balance > 0}
                  />
                ) : (
                  <span style={{ color: "#10b981", fontSize: 12 }}>
                    ✓ quitado
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showExpenseModal && (
        <ExpenseModal
          expense={editExpense}
          group={group}
          myProfileId={myProfileId}
          onSaved={onGroupUpdated}
          onClose={() => {
            setShowExpense(false);
            setEditExpense(null);
          }}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Confirmar exclusão"
          onClose={() => setConfirmDelete(null)}
          width={380}
        >
          <p style={{ color: "#94a3b8", marginTop: 0 }}>
            Tem certeza que deseja excluir esse gasto? As dívidas serão
            recalculadas.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setConfirmDelete(null)} variant="outline">
              Cancelar
            </Btn>
            <Btn onClick={handleDeleteExpense} danger disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export function RachaContaPage() {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? "";

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<"home" | string>("home");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);

  const currentGroup = groups.find((g) => g.id === screen);

  const myMemberId = useCallback(
    (groupId: string): string =>
      groups.find((x) => x.id === groupId)?.members.find((m) => m.is_me)?.id ??
      "",
    [groups],
  );

  // Exposto via ref para poder ser chamado após mutations (criar gasto, marcar pago, etc.)
  const loadGroupsRef = useRef<(() => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!myProfileId) return;
      setLoading(true);
      const data = await fetchGroups(myProfileId);
      if (!cancelled) {
        setGroups(data);
        setLoading(false);
      }
    };

    loadGroupsRef.current = load;
    load();

    return () => {
      cancelled = true;
    };
  }, [myProfileId]);

  const loadGroups = useCallback(async () => {
    await loadGroupsRef.current?.();
  }, []);

  const pendingCount = groups.reduce((n, g) => {
    const myMid = myMemberId(g.id);
    return (
      n +
      computeDebts(g.members, g.expenses, g.payments).filter(
        (t) => t.from === myMid || t.to === myMid,
      ).length
    );
  }, 0);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 50%, #0a0a1a 100%)",
        fontFamily: "var(--font-body, 'DM Sans', 'Segoe UI', sans-serif)",
        color: "#e2e8f0",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage:
            "radial-gradient(ellipse at 20% 20%, #7c3aed12 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #7c3aed08 0%, transparent 50%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 680,
          margin: "0 auto",
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid #1e1e3f",
            position: "sticky",
            top: 0,
            background: "rgba(10,10,26,.95)",
            backdropFilter: "blur(10px)",
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {screen !== "home" && (
              <button
                onClick={() => setScreen("home")}
                style={{
                  background: "#1e1e3f",
                  border: "1px solid #2d2d4e",
                  borderRadius: 8,
                  padding: "6px 12px",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ← Voltar
              </button>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>💸</span>
                <span
                  style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}
                >
                  {screen === "home" ? "Racha Conta" : currentGroup?.name}
                </span>
                {screen === "home" && pendingCount > 0 && (
                  <span
                    style={{
                      background: "#f43f5e",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </div>
              {screen === "home" && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Olá,{" "}
                  <strong style={{ color: "#7c3aed" }}>
                    {profile?.display_name?.split(" ")[0]}
                  </strong>{" "}
                  · {groups.length} grupos
                </div>
              )}
            </div>
            {screen === "home" ? (
              <Btn
                onClick={() => {
                  setEditGroup(null);
                  setShowGroupModal(true);
                }}
                small
              >
                + Grupo
              </Btn>
            ) : (
              <Btn
                onClick={() => {
                  setEditGroup(currentGroup ?? null);
                  setShowGroupModal(true);
                }}
                small
                variant="outline"
              >
                ✏️
              </Btn>
            )}
          </div>
        </div>

        <div style={{ padding: "20px" }}>
          {screen === "home" ? (
            <HomeScreen
              groups={groups}
              myMemberId={myMemberId}
              onGroupClick={setScreen}
            />
          ) : currentGroup ? (
            <GroupDetail
              group={currentGroup}
              myProfileId={myProfileId}
              onGroupUpdated={loadGroups}
            />
          ) : null}
        </div>
      </div>

      {showGroupModal && (
        <GroupModal
          group={editGroup}
          myProfileId={myProfileId}
          onSaved={loadGroups}
          onClose={() => {
            setShowGroupModal(false);
            setEditGroup(null);
          }}
        />
      )}
    </div>
  );
}
