// ═══════════════════════════════════════════
// Auth / User
// ═══════════════════════════════════════════

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  hidden_features: string[];
  birthday: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════
// Dados — Dice Rolls
// ═══════════════════════════════════════════

export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export interface DiceRoll {
  id: string;
  user_id: string;
  dice_type: DiceType;
  result: number;
  batch_id: string | null;
  created_at: string;
  profile?: Profile;
}

/** A group of rolls (single or multi-dice) displayed as one line */
export interface RollGroup {
  key: string;
  user_id: string;
  dice_type: DiceType;
  rolls: DiceRoll[];
  total: number;
  created_at: string;
  profile?: Profile;
}

export const DICE_CONFIG: Record<
  DiceType,
  { sides: number; label: string; icon: string }
> = {
  d4: { sides: 4, label: "D4", icon: "/images/D4.png" },
  d6: { sides: 6, label: "D6", icon: "/images/D6.png" },
  d8: { sides: 8, label: "D8", icon: "/images/D8.png" },
  d10: { sides: 10, label: "D10", icon: "/images/D10.png" },
  d12: { sides: 12, label: "D12", icon: "/images/D12.png" },
  d20: { sides: 20, label: "D20", icon: "/images/D20.png" },
  d100: { sides: 100, label: "D100", icon: "/images/D100.png" },
};

export const DICE_TYPES: DiceType[] = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "d100",
];

// ═══════════════════════════════════════════
// Racha Conta
// ═══════════════════════════════════════════

export type SplitType = "equal" | "custom" | "percent";

export type ExpenseCategory =
  | "alimentação"
  | "bebidas"
  | "hospedagem"
  | "transporte"
  | "lazer"
  | "moradia"
  | "compras"
  | "outros";

/** Membro de um grupo — pode ser usuário do app ou pessoa externa */
export interface GroupMember {
  /** UUID de profile para usuários do app; string local ("ext_<timestamp>") para externos */
  id: string;
  display_name: string;
  /** Iniciais para o avatar fallback */
  avatar_letter: string;
  avatar_url: string | null;
  /** true = tem conta no app (profiles table); false = externo */
  is_app_user: boolean;
  /** true = é o usuário autenticado atual */
  is_me: boolean;
}

/**
 * Mapa de splits por member id.
 * - splitType "custom"  → valor em reais  (ex: { "uuid-a": 60, "uuid-b": 80 })
 * - splitType "percent" → porcentagem 0-100 (ex: { "uuid-a": 50, "uuid-b": 50 })
 * - splitType "equal"   → objeto vazio {}
 */
export type SplitsMap = Record<string, number>;

export interface Expense {
  id: string;
  group_id: string;
  name: string;
  amount: number;
  paid_by: string; // GroupMember.id
  split_type: SplitType;
  /** IDs dos membros que participam deste gasto */
  participant_ids: string[];
  splits: SplitsMap;
  category: ExpenseCategory;
  date: string; // ISO date "YYYY-MM-DD"
  created_by: string; // GroupMember.id
  created_at: string; // ISO timestamp
}

export interface Payment {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  date: string; // ISO date "YYYY-MM-DD"
  settled: true;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  created_by: string; // profile id
  created_at: string;
  members: GroupMember[];
  expenses: Expense[];
  payments: Payment[];
}

/** Transação mínima calculada pelo algoritmo greedy */
export interface DebtTransaction {
  from: string; // GroupMember.id
  to: string; // GroupMember.id
  amount: number;
}

/** Transação enriquecida com contexto de grupo (usada na home global) */
export interface GlobalDebtTransaction extends DebtTransaction {
  group_id: string;
  group_name: string;
}

// ═══════════════════════════════════════════
// Features registry
// ═══════════════════════════════════════════

export interface Feature {
  id: string;
  name: string;
  icon: string;
  path: string;
  enabled: boolean;
  description: string;
}

export const APP_FEATURES: Feature[] = [
  {
    id: "aniversarios",
    name: "Aniversários",
    icon: "🎂",
    path: "/aniversarios",
    enabled: true,
    description: "Próximos aniversários dos integrantes",
  },
  {
    id: "musicas",
    name: "Músicas de Hoje",
    icon: "🎵",
    path: "/musicas",
    enabled: true,
    description: "Uma indicação musical por pessoa por dia",
  },
  {
    id: "agenda",
    name: "Agenda",
    icon: "📅",
    path: "/agenda",
    enabled: true,
    description: "Eventos, confirmações e finalizados",
  },
  {
    id: "cultura",
    name: "Cultura",
    icon: "🎬",
    path: "/cultura",
    enabled: true,
    description: "Filmes, séries, livros e álbuns do grupo",
  },
  {
    id: "bolao",
    name: "Bolão",
    icon: "⚽",
    path: "/bolao",
    enabled: true,
    description: "Bolão para eventos esportivos, com palpites e pontuação",
  },
  {
    id: "splitwise",
    name: "Racha Conta",
    icon: "💰",
    path: "/racha-conta",
    enabled: true,
    description: "Divisão de gastos entre amigos",
  },
  {
    id: "dados",
    name: "Dados D20",
    icon: "🎲",
    path: "/dados",
    enabled: true,
    description: "Rolagem de dados de RPG em tempo real",
  },
  {
    id: "briga-de-bar",
    name: "Briga de Bar",
    icon: "🍺",
    path: "/arena",
    enabled: true,
    description: "Apostas hipotéticas com odds e veredito da IA",
  },
  {
    id: "ficha",
    name: "RPG",
    icon: "🏰",
    path: "/rpg",
    enabled: false,
    description: "Mesas de RPG, fichas D&D e sessões ao vivo",
  },
];
