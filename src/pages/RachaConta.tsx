import { useState, useCallback } from "react";

// ─── Dados iniciais mock ───────────────────────────────────────────────────────
const APP_USERS = [
  { id: "u1", name: "Você", avatar: "V", isMe: true },
  { id: "u2", name: "Ana Lima", avatar: "A" },
  { id: "u3", name: "Bruno Melo", avatar: "B" },
  { id: "u4", name: "Carla Dias", avatar: "C" },
  { id: "u5", name: "Diego Ramos", avatar: "D" },
];

const INITIAL_GROUPS = [
  {
    id: "g1",
    name: "Viagem Búzios 🏖️",
    emoji: "🏖️",
    createdAt: "2025-03-01",
    members: [
      { id: "u1", name: "Você", avatar: "V", isApp: true, isMe: true },
      { id: "u2", name: "Ana Lima", avatar: "A", isApp: true },
      { id: "u3", name: "Bruno Melo", avatar: "B", isApp: true },
      { id: "ext1", name: "Fernanda (ext)", avatar: "F", isApp: false },
    ],
    expenses: [
      {
        id: "e1",
        name: "Pousada 3 noites",
        amount: 1200,
        paidBy: "u2",
        splitType: "equal",
        participants: ["u1", "u2", "u3", "ext1"],
        splits: {},
        date: "2025-03-02",
        category: "hospedagem",
        createdBy: "u2",
      },
      {
        id: "e2",
        name: "Jantar frutos do mar",
        amount: 320,
        paidBy: "u1",
        splitType: "custom",
        participants: ["u1", "u2", "u3", "ext1"],
        splits: { u1: 60, u2: 80, u3: 100, ext1: 80 },
        date: "2025-03-03",
        category: "alimentação",
        createdBy: "u1",
      },
      {
        id: "e3",
        name: "Passeio de barco",
        amount: 480,
        paidBy: "u3",
        splitType: "percent",
        participants: ["u1", "u2", "u3", "ext1"],
        splits: { u1: 25, u2: 25, u3: 25, ext1: 25 },
        date: "2025-03-04",
        category: "lazer",
        createdBy: "u3",
      },
    ],
    payments: [],
  },
  {
    id: "g2",
    name: "Aluguel Apto",
    emoji: "🏠",
    createdAt: "2025-01-01",
    members: [
      { id: "u1", name: "Você", avatar: "V", isApp: true, isMe: true },
      { id: "u4", name: "Carla Dias", avatar: "C", isApp: true },
    ],
    expenses: [
      {
        id: "e4",
        name: "Aluguel Março",
        amount: 2400,
        paidBy: "u1",
        splitType: "equal",
        participants: ["u1", "u4"],
        splits: {},
        date: "2025-03-01",
        category: "moradia",
        createdBy: "u1",
      },
    ],
    payments: [],
  },
];

// ─── Algoritmo de mínimo de transações ───────────────────────────────────────
function computeDebts(members, expenses, payments) {
  const balance = {};
  members.forEach((m) => (balance[m.id] = 0));

  expenses.forEach((exp) => {
    const amount = exp.amount;
    const parts = exp.participants;
    let shares = {};

    if (exp.splitType === "equal") {
      const share = amount / parts.length;
      parts.forEach((p) => (shares[p] = share));
    } else if (exp.splitType === "custom") {
      shares = { ...exp.splits };
    } else if (exp.splitType === "percent") {
      parts.forEach((p) => (shares[p] = (exp.splits[p] / 100) * amount));
    }

    // quem pagou recebe de volta o que os outros devem
    parts.forEach((p) => {
      if (p !== exp.paidBy) {
        balance[exp.paidBy] = (balance[exp.paidBy] || 0) + shares[p];
        balance[p] = (balance[p] || 0) - shares[p];
      }
    });
  });

  // aplica pagamentos já realizados
  payments.forEach((pay) => {
    if (pay.settled) {
      balance[pay.from] = (balance[pay.from] || 0) + pay.amount;
      balance[pay.to] = (balance[pay.to] || 0) - pay.amount;
    }
  });

  // algoritmo greedy
  const creditors = [];
  const debtors = [];
  Object.entries(balance).forEach(([id, val]) => {
    if (val > 0.005) creditors.push({ id, amount: val });
    else if (val < -0.005) debtors.push({ id, amount: -val });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let ci = 0,
    di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.amount, d.amount);
    transactions.push({
      from: d.id,
      to: c.id,
      amount: parseFloat(amount.toFixed(2)),
    });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount < 0.005) ci++;
    if (d.amount < 0.005) di++;
  }

  return transactions;
}

function getMemberName(members, id) {
  return members.find((m) => m.id === id)?.name || id;
}

function getMemberAvatar(members, id) {
  return members.find((m) => m.id === id)?.avatar || "?";
}

const CATEGORIES = [
  "alimentação",
  "bebidas",
  "hospedagem",
  "transporte",
  "lazer",
  "moradia",
  "compras",
  "outros",
];
const CATEGORY_COLORS = {
  alimentação: "#f59e0b",
  bebidas: "#8b5cf6",
  hospedagem: "#06b6d4",
  transporte: "#10b981",
  lazer: "#f43f5e",
  moradia: "#3b82f6",
  compras: "#ec4899",
  outros: "#6b7280",
};

// ─── Componentes utilitários ──────────────────────────────────────────────────
function Avatar({ letter, size = 36, color = "#7c3aed", isApp = true }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isApp ? color : "#6b7280",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        border: isApp
          ? "2px solid rgba(124,58,237,0.3)"
          : "2px solid rgba(107,114,128,0.3)",
      }}
    >
      {letter}
    </div>
  );
}

function Tag({ color, label }) {
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

function MoneyBadge({ amount, positive }) {
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
      }}
    >
      {positive ? "+" : "-"}R$ {Math.abs(amount).toFixed(2)}
    </span>
  );
}

// ─── Modal genérico ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
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
              lineHeight: 1,
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

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  step,
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
        style={{
          width: "100%",
          background: "#0f0f23",
          border: "1px solid #2d2d4e",
          borderRadius: 8,
          padding: "10px 12px",
          color: "#e2e8f0",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Select({ label, value, onChange, children }) {
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
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          background: "#0f0f23",
          border: "1px solid #2d2d4e",
          borderRadius: 8,
          padding: "10px 12px",
          color: "#e2e8f0",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      >
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
}) {
  const bg = danger
    ? "#f43f5e"
    : variant === "primary"
      ? "#7c3aed"
      : variant === "outline"
        ? "transparent"
        : "#1e1e3f";
  const border = variant === "outline" ? "1px solid #4a4a6e" : "none";
  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        border,
        borderRadius: 8,
        color: "#fff",
        padding: small ? "6px 12px" : "10px 18px",
        fontWeight: 600,
        fontSize: small ? 12 : 14,
        cursor: "pointer",
        transition: "opacity .15s",
      }}
      onMouseOver={(e) => (e.target.style.opacity = 0.8)}
      onMouseOut={(e) => (e.target.style.opacity = 1)}
    >
      {children}
    </button>
  );
}

// ─── Modal: Criar/Editar Grupo ────────────────────────────────────────────────
function GroupModal({ group, onSave, onClose }) {
  const editing = !!group;
  const [name, setName] = useState(
    group?.name.replace(/\s*[\p{Emoji}]\s*$/u, "").trim() || "",
  );
  const [emoji, setEmoji] = useState(group?.emoji || "🎉");
  const [members, setMembers] = useState(
    group?.members.filter((m) => !m.isMe) || [],
  );
  const [extName, setExtName] = useState("");
  const [extAvatar, setExtAvatar] = useState("");

  const toggleAppUser = (user) => {
    const exists = members.find((m) => m.id === user.id);
    if (exists) setMembers(members.filter((m) => m.id !== user.id));
    else setMembers([...members, { ...user, isApp: true }]);
  };

  const addExternal = () => {
    if (!extName.trim()) return;
    const id = "ext" + Date.now();
    setMembers([
      ...members,
      {
        id,
        name: extName.trim() + " (ext)",
        avatar: (extAvatar || extName[0]).toUpperCase(),
        isApp: false,
      },
    ]);
    setExtName("");
    setExtAvatar("");
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const me = APP_USERS.find((u) => u.isMe);
    const allMembers = [
      { ...me, isApp: true, isMe: true },
      ...members.filter((m) => m.id !== me.id),
    ];
    onSave({
      id: group?.id || "g" + Date.now(),
      name: name.trim() + " " + emoji,
      emoji,
      createdAt: group?.createdAt || new Date().toISOString().split("T")[0],
      members: allMembers,
      expenses: group?.expenses || [],
      payments: group?.payments || [],
    });
    onClose();
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

  return (
    <Modal title={editing ? "Editar Grupo" : "Novo Grupo"} onClose={onClose}>
      <Input
        label="Nome do grupo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Viagem Rio"
      />
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          Emoji
        </label>
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
      </div>

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Usuários do App
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {APP_USERS.filter((u) => !u.isMe).map((user) => {
            const selected = !!members.find((m) => m.id === user.id);
            return (
              <div
                key={user.id}
                onClick={() => toggleAppUser(user)}
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
                <Avatar letter={user.avatar} size={30} />
                <span style={{ color: "#e2e8f0", flex: 1 }}>{user.name}</span>
                {selected && <span style={{ color: "#7c3aed" }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Adicionar Externo
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            placeholder="Nome da pessoa"
            style={{
              flex: 1,
              background: "#0f0f23",
              border: "1px solid #2d2d4e",
              borderRadius: 8,
              padding: "8px 12px",
              color: "#e2e8f0",
              fontSize: 14,
              outline: "none",
            }}
          />
          <Btn onClick={addExternal} small>
            + Add
          </Btn>
        </div>
        {members.filter((m) => !m.isApp).length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {members
              .filter((m) => !m.isApp)
              .map((m) => (
                <div
                  key={m.id}
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
                  <Avatar
                    letter={m.avatar}
                    size={26}
                    color="#6b7280"
                    isApp={false}
                  />
                  <span style={{ flex: 1, color: "#94a3b8", fontSize: 13 }}>
                    {m.name}
                  </span>
                  <button
                    onClick={() =>
                      setMembers(members.filter((x) => x.id !== m.id))
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
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} variant="outline">
          Cancelar
        </Btn>
        <Btn onClick={handleSave}>Salvar</Btn>
      </div>
    </Modal>
  );
}

// ─── Modal: Criar/Editar Gasto ────────────────────────────────────────────────
function ExpenseModal({ expense, members, onSave, onClose }) {
  const editing = !!expense;
  const [name, setName] = useState(expense?.name || "");
  const [amount, setAmount] = useState(expense?.amount || "");
  const [paidBy, setPaidBy] = useState(expense?.paidBy || "u1");
  const [category, setCategory] = useState(expense?.category || "outros");
  const [splitType, setSplitType] = useState(expense?.splitType || "equal");
  const [participants, setParticipants] = useState(
    expense?.participants || members.map((m) => m.id),
  );
  const [splits, setSplits] = useState(expense?.splits || {});
  const [date, setDate] = useState(
    expense?.date || new Date().toISOString().split("T")[0],
  );

  const toggleParticipant = (id) => {
    if (participants.includes(id)) {
      const next = participants.filter((p) => p !== id);
      setParticipants(next);
    } else {
      setParticipants([...participants, id]);
    }
  };

  const totalCustom = participants.reduce(
    (s, p) => s + (parseFloat(splits[p]) || 0),
    0,
  );
  const totalPercent = participants.reduce(
    (s, p) => s + (parseFloat(splits[p]) || 0),
    0,
  );
  const equalShare =
    participants.length > 0
      ? (parseFloat(amount) || 0) / participants.length
      : 0;

  const handleSave = () => {
    if (!name.trim() || !amount || participants.length === 0) return;
    if (
      splitType === "custom" &&
      Math.abs(totalCustom - parseFloat(amount)) > 0.01
    )
      return;
    if (splitType === "percent" && Math.abs(totalPercent - 100) > 0.1) return;
    onSave({
      id: expense?.id || "e" + Date.now(),
      name: name.trim(),
      amount: parseFloat(amount),
      paidBy,
      category,
      splitType,
      participants,
      splits: splitType === "equal" ? {} : splits,
      date,
      createdBy: "u1",
    });
    onClose();
  };

  return (
    <Modal
      title={editing ? "Editar Gasto" : "Novo Gasto"}
      onClose={onClose}
      width={560}
    >
      <Input
        label="Descrição"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Pizza da sexta"
      />
      <Input
        label="Valor (R$)"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0,00"
        min="0.01"
        step="0.01"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select
          label="Pago por"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select
          label="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Data"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Tipo de divisão
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            ["equal", "Igualitária"],
            ["custom", "Personalizada"],
            ["percent", "Porcentagem"],
          ].map(([v, l]) => (
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
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Participantes{" "}
          {splitType !== "equal" &&
            (splitType === "custom"
              ? `— Total: R$ ${totalCustom.toFixed(2)} / R$ ${parseFloat(amount || 0).toFixed(2)}`
              : `— Total: ${totalPercent.toFixed(1)}%`)}
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => {
            const isIn = participants.includes(m.id);
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
                  <Avatar
                    letter={m.avatar}
                    size={26}
                    isApp={m.isApp !== false}
                  />
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>
                    {m.name}
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
                    value={splits[m.id] || ""}
                    onChange={(e) =>
                      setSplits({ ...splits, [m.id]: e.target.value })
                    }
                    placeholder="0.00"
                    min="0"
                    step="0.01"
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
                      value={splits[m.id] || ""}
                      onChange={(e) =>
                        setSplits({ ...splits, [m.id]: e.target.value })
                      }
                      placeholder="0"
                      min="0"
                      max="100"
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
        {splitType === "custom" &&
          Math.abs(totalCustom - parseFloat(amount || 0)) > 0.01 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#f43f5e" }}>
              ⚠ A soma dos valores deve ser igual ao total
            </div>
          )}
        {splitType === "percent" && Math.abs(totalPercent - 100) > 0.1 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#f43f5e" }}>
            ⚠ A soma das porcentagens deve ser 100% (atual:{" "}
            {totalPercent.toFixed(1)}%)
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} variant="outline">
          Cancelar
        </Btn>
        <Btn onClick={handleSave}>Salvar Gasto</Btn>
      </div>
    </Modal>
  );
}

// ─── Tela: Home (resumo global) ───────────────────────────────────────────────
function HomeScreen({ groups, onGroupClick }) {
  const ME = "u1";
  const allTransactions = [];

  groups.forEach((g) => {
    const txs = computeDebts(g.members, g.expenses, g.payments);
    txs.forEach((tx) =>
      allTransactions.push({ ...tx, groupName: g.name, groupId: g.id }),
    );
  });

  const iOwe = allTransactions.filter((t) => t.from === ME);
  const theyOweMe = allTransactions.filter((t) => t.to === ME);
  const totalOwe = iOwe.reduce((s, t) => s + t.amount, 0);
  const totalReceive = theyOweMe.reduce((s, t) => s + t.amount, 0);

  const allMembers = {};
  groups.forEach((g) =>
    g.members.forEach((m) => {
      allMembers[m.id] = m;
    }),
  );

  const totalExpenses = groups.reduce(
    (s, g) => s + g.expenses.reduce((ss, e) => ss + e.amount, 0),
    0,
  );

  return (
    <div>
      {/* Cards de resumo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Total de Gastos",
            value: `R$ ${totalExpenses.toFixed(2)}`,
            icon: "💳",
            color: "#7c3aed",
          },
          {
            label: "A receber",
            value: `R$ ${totalReceive.toFixed(2)}`,
            icon: "📥",
            color: "#10b981",
          },
          {
            label: "A pagar",
            value: `R$ ${totalOwe.toFixed(2)}`,
            icon: "📤",
            color: "#f43f5e",
          },
        ].map((card) => (
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
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* A Receber */}
      {theyOweMe.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#10b981",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              margin: "0 0 12px",
            }}
          >
            📥 Quem te deve
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {theyOweMe.map((t, i) => (
              <div
                key={i}
                onClick={() => onGroupClick(t.groupId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#10b98110",
                  border: "1px solid #10b98130",
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "transform .1s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.transform = "translateX(4px)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.transform = "translateX(0)")
                }
              >
                <Avatar
                  letter={getMemberAvatar(Object.values(allMembers), t.from)}
                  size={36}
                  color="#10b981"
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}
                  >
                    {getMemberName(Object.values(allMembers), t.from)}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {t.groupName}
                  </div>
                </div>
                <MoneyBadge amount={t.amount} positive />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A Pagar */}
      {iOwe.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#f43f5e",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              margin: "0 0 12px",
            }}
          >
            📤 Você deve
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {iOwe.map((t, i) => (
              <div
                key={i}
                onClick={() => onGroupClick(t.groupId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#f43f5e10",
                  border: "1px solid #f43f5e30",
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "transform .1s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.transform = "translateX(4px)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.transform = "translateX(0)")
                }
              >
                <Avatar
                  letter={getMemberAvatar(Object.values(allMembers), t.to)}
                  size={36}
                  color="#f43f5e"
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}
                  >
                    {getMemberName(Object.values(allMembers), t.to)}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    {t.groupName}
                  </div>
                </div>
                <MoneyBadge amount={t.amount} positive={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      {theyOweMe.length === 0 && iOwe.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
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

      {/* Lista de grupos */}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g) => {
          const txs = computeDebts(g.members, g.expenses, g.payments);
          const myReceive = txs
            .filter((t) => t.to === ME)
            .reduce((s, t) => s + t.amount, 0);
          const myOwe = txs
            .filter((t) => t.from === ME)
            .reduce((s, t) => s + t.amount, 0);
          const balance = myReceive - myOwe;
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
                transition: "border-color .15s, background .15s",
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
              {balance !== 0 && (
                <MoneyBadge amount={balance} positive={balance > 0} />
              )}
              {balance === 0 && (
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
function GroupDetail({ group, onUpdate, onBack }) {
  const ME = "u1";
  const [tab, setTab] = useState("debts");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const transactions = computeDebts(
    group.members,
    group.expenses,
    group.payments,
  );
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const myReceive = transactions
    .filter((t) => t.to === ME)
    .reduce((s, t) => s + t.amount, 0);
  const myOwe = transactions
    .filter((t) => t.from === ME)
    .reduce((s, t) => s + t.amount, 0);

  const saveExpense = (exp) => {
    const exists = group.expenses.find((e) => e.id === exp.id);
    const expenses = exists
      ? group.expenses.map((e) => (e.id === exp.id ? exp : e))
      : [...group.expenses, exp];
    onUpdate({ ...group, expenses });
  };

  const deleteExpense = (id) => {
    onUpdate({ ...group, expenses: group.expenses.filter((e) => e.id !== id) });
    setConfirmDelete(null);
  };

  const markPaid = (tx) => {
    const pay = {
      id: "p" + Date.now(),
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      date: new Date().toISOString().split("T")[0],
      settled: true,
    };
    onUpdate({ ...group, payments: [...group.payments, pay] });
  };

  const allMembers = {};
  group.members.forEach((m) => {
    allMembers[m.id] = m;
  });

  const TABS = [
    { id: "debts", label: "Dívidas" },
    { id: "expenses", label: "Gastos" },
    { id: "history", label: "Histórico" },
    { id: "members", label: "Membros" },
  ];

  return (
    <div>
      {/* Header do grupo */}
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
              {group.members.length} membros · criado em {group.createdAt}
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
          {[
            {
              label: "Total gasto",
              value: `R$ ${total.toFixed(2)}`,
              color: "#7c3aed",
            },
            {
              label: "Você recebe",
              value: `R$ ${myReceive.toFixed(2)}`,
              color: "#10b981",
            },
            {
              label: "Você deve",
              value: `R$ ${myOwe.toFixed(2)}`,
              color: "#f43f5e",
            },
          ].map((c) => (
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
                {c.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
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

      {/* Tab: Dívidas */}
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
                {transactions.length} transação
                {transactions.length !== 1 ? "ões" : ""} necessária
                {transactions.length !== 1 ? "s" : ""} (otimizado)
              </div>
              {transactions.map((t, i) => {
                const isMe = t.from === ME || t.to === ME;
                const color =
                  t.from === ME
                    ? "#f43f5e"
                    : t.to === ME
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
                    <Avatar
                      letter={getMemberAvatar(group.members, t.from)}
                      size={36}
                      color={color}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          color: "#e2e8f0",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {getMemberName(group.members, t.from)}
                        <span style={{ color: "#64748b", fontWeight: 400 }}>
                          {" "}
                          →{" "}
                        </span>
                        {getMemberName(group.members, t.to)}
                      </div>
                      {t.from === ME && (
                        <div style={{ color: "#f43f5e", fontSize: 12 }}>
                          Você precisa pagar
                        </div>
                      )}
                      {t.to === ME && (
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
                      <MoneyBadge amount={t.amount} positive={t.to === ME} />
                      {isMe && (
                        <button
                          onClick={() => markPaid(t)}
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Gastos */}
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
                setShowExpenseModal(true);
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
                let myShare = 0;
                if (exp.participants.includes(ME)) {
                  if (exp.splitType === "equal")
                    myShare = exp.amount / exp.participants.length;
                  else if (exp.splitType === "custom")
                    myShare = parseFloat(exp.splits[ME] || 0);
                  else if (exp.splitType === "percent")
                    myShare =
                      (parseFloat(exp.splits[ME] || 0) / 100) * exp.amount;
                }
                const catColor = CATEGORY_COLORS[exp.category] || "#6b7280";
                const splitLabels = {
                  equal: "Igualitário",
                  custom: "Personalizado",
                  percent: "Porcentagem",
                };
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
                        {exp.category === "alimentação"
                          ? "🍽️"
                          : exp.category === "hospedagem"
                            ? "🏨"
                            : exp.category === "transporte"
                              ? "🚗"
                              : exp.category === "lazer"
                                ? "🎮"
                                : exp.category === "moradia"
                                  ? "🏠"
                                  : exp.category === "bebidas"
                                    ? "🍺"
                                    : "🛍️"}
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
                                {getMemberName(group.members, exp.paidBy)}
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
                            {exp.participants.includes(ME) && (
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
                            label={splitLabels[exp.splitType]}
                          />
                          <Tag
                            color="#64748b"
                            label={`${exp.participants.length} pessoas`}
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
                          setShowExpenseModal(true);
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

      {/* Tab: Histórico */}
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
                    {[...group.payments].reverse().map((p) => (
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
                            <strong>
                              {getMemberName(group.members, p.from)}
                            </strong>{" "}
                            pagou{" "}
                            <strong>
                              {getMemberName(group.members, p.to)}
                            </strong>
                          </div>
                          <div style={{ color: "#64748b", fontSize: 11 }}>
                            {p.date}
                          </div>
                        </div>
                        <span style={{ color: "#10b981", fontWeight: 700 }}>
                          R$ {p.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
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
                        CATEGORY_COLORS[exp.category] || "#6b7280";
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
                              por {getMemberName(group.members, exp.paidBy)} ·{" "}
                              {exp.date}
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

      {/* Tab: Membros */}
      {tab === "members" && (
        <div>
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
                .filter((e) => e.paidBy === m.id)
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
                  <Avatar
                    letter={m.avatar}
                    size={40}
                    color={m.isMe ? "#7c3aed" : "#4a4a6e"}
                    isApp={m.isApp !== false}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
                      {m.name}{" "}
                      {m.isMe && (
                        <span style={{ color: "#7c3aed", fontSize: 12 }}>
                          (você)
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      {m.isApp ? "🟢 no app" : "⚫ externo"} · pagou R${" "}
                      {totalPaid.toFixed(2)}
                    </div>
                  </div>
                  {balance !== 0 && (
                    <MoneyBadge
                      amount={Math.abs(balance)}
                      positive={balance > 0}
                    />
                  )}
                  {balance === 0 && (
                    <span style={{ color: "#10b981", fontSize: 12 }}>
                      ✓ quitado
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modais */}
      {showExpenseModal && (
        <ExpenseModal
          expense={editExpense}
          members={group.members}
          onSave={saveExpense}
          onClose={() => {
            setShowExpenseModal(false);
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
            <Btn onClick={() => deleteExpense(confirmDelete)} danger>
              Excluir
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── App Principal ────────────────────────────────────────────────────────────
export default function RachaConta() {
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [screen, setScreen] = useState("home"); // "home" | groupId
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState(null);

  const currentGroup = groups.find((g) => g.id === screen);

  const saveGroup = useCallback((g) => {
    setGroups((prev) => {
      const exists = prev.find((x) => x.id === g.id);
      return exists ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g];
    });
  }, []);

  const updateGroup = useCallback((g) => {
    setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)));
  }, []);

  const pendingCount = (() => {
    const ME = "u1";
    let n = 0;
    groups.forEach((g) => {
      const txs = computeDebts(g.members, g.expenses, g.payments);
      n += txs.filter((t) => t.from === ME || t.to === ME).length;
    });
    return n;
  })();

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0a0a1a 0%, #0f0f23 50%, #0a0a1a 100%)",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        color: "#e2e8f0",
      }}
    >
      {/* Background texture */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(ellipse at 20% 20%, #7c3aed15 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #7c3aed08 0%, transparent 50%)",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 680,
          margin: "0 auto",
          padding: "0 0 80px",
        }}
      >
        {/* Header */}
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
                  Olá, <strong style={{ color: "#7c3aed" }}>Você</strong> ·{" "}
                  {groups.length} grupos
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
              <div style={{ display: "flex", gap: 8 }}>
                <Btn
                  onClick={() => {
                    setEditGroup(currentGroup);
                    setShowGroupModal(true);
                  }}
                  small
                  variant="outline"
                >
                  ✏️
                </Btn>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          {screen === "home" ? (
            <HomeScreen groups={groups} onGroupClick={setScreen} />
          ) : currentGroup ? (
            <GroupDetail
              group={currentGroup}
              onUpdate={updateGroup}
              onBack={() => setScreen("home")}
            />
          ) : null}
        </div>
      </div>

      {/* Modais */}
      {showGroupModal && (
        <GroupModal
          group={editGroup}
          onSave={saveGroup}
          onClose={() => {
            setShowGroupModal(false);
            setEditGroup(null);
          }}
        />
      )}
    </div>
  );
}
