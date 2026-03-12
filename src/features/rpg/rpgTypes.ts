// ═══════════════════════════════════════════
// RPG — Types
// ═══════════════════════════════════════════

import type { Profile } from "@/lib/types";

export interface RpgTable {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  invite_code: string;
  master_id: string;
  is_active: boolean;
  session_count: number;
  created_at: string;
  updated_at: string;
  // joined
  master?: Profile;
  members?: RpgTableMember[];
}

export interface RpgTableMember {
  id: string;
  table_id: string;
  user_id: string;
  joined_at: string;
  total_sessions: number;
  total_minutes: number;
  profile?: Profile;
}

// ─── Ficha D&D 5.5e ─────────────────────────────────────────

export type AbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export const ABILITY_LABELS: Record<
  AbilityKey,
  { label: string; short: string }
> = {
  strength: { label: "Força", short: "FOR" },
  dexterity: { label: "Destreza", short: "DES" },
  constitution: { label: "Constituição", short: "CON" },
  intelligence: { label: "Inteligência", short: "INT" },
  wisdom: { label: "Sabedoria", short: "SAB" },
  charisma: { label: "Carisma", short: "CAR" },
};

export const SKILLS_BY_ABILITY: Record<AbilityKey, string[]> = {
  strength: ["Atletismo"],
  dexterity: ["Acrobacia", "Furtividade", "Prestidigitação"],
  constitution: [],
  intelligence: [
    "Arcanismo",
    "História",
    "Investigação",
    "Natureza",
    "Religião",
  ],
  wisdom: [
    "Adestrar Animais",
    "Intuição",
    "Medicina",
    "Percepção",
    "Sobrevivência",
  ],
  charisma: ["Atuação", "Enganação", "Intimidação", "Persuasão"],
};

export interface SpellEntry {
  name: string;
  prepared?: boolean;
}

export interface SpellSlotLevel {
  max: number;
  used: number;
}

export interface AttackEntry {
  name: string;
  bonus: string;
  damage: string;
  damage_type: string;
  range: string;
  notes: string;
}

export interface FeatureEntry {
  name: string;
  source: string;
  description: string;
}

export interface EquipmentEntry {
  name: string;
  quantity: number;
  weight: number;
  equipped: boolean;
}

export interface Currency {
  cp: number; // cobre
  sp: number; // prata
  ep: number; // electrum
  gp: number; // ouro
  pp: number; // platina
}

export interface RpgSheet {
  id: string;
  user_id: string;
  character_name: string;
  class_name: string;
  subclass: string;
  race: string;
  background: string;
  alignment: string;
  level: number;
  experience: number;
  // Atributos
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  // Vida
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  armor_class: number;
  speed: number;
  initiative: number;
  hit_dice: string;
  hit_dice_used: number;
  // Proficiências
  saving_throws: Record<AbilityKey, boolean>;
  skill_proficiencies: Record<string, boolean>;
  skill_expertise: Record<string, boolean>;
  proficiency_bonus: number;
  // Traços
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  // Equipamento
  equipment: EquipmentEntry[];
  currency: Currency;
  // Magias
  spellcasting_ability: string;
  spell_save_dc: number;
  spell_attack_bonus: number;
  spells: Record<string, SpellEntry[]>;
  spell_slots: Record<string, SpellSlotLevel>;
  // Ataques
  attacks: AttackEntry[];
  // Habilidades
  features: FeatureEntry[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface RpgSheetTableLink {
  id: string;
  sheet_id: string;
  table_id: string;
  user_id: string;
}

// ─── Feed ───────────────────────────────────────────────────

export type FeedPostType = "text" | "image" | "video" | "system";

export interface RpgFeedPost {
  id: string;
  table_id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  post_type: FeedPostType;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

// ─── Rolagens na Mesa ───────────────────────────────────────

export interface RpgTableRoll {
  id: string;
  table_id: string;
  user_id: string;
  dice_type: string;
  results: number[];
  total: number;
  is_master: boolean;
  batch_id: string | null;
  created_at: string;
  profile?: Profile;
}

// ─── Biblioteca ─────────────────────────────────────────────

export interface RpgLibraryEntry {
  id: string;
  table_id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Helper ─────────────────────────────────────────────────

export function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(score: number): string {
  const mod = getModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export const ALIGNMENTS = [
  "Leal e Bom",
  "Neutro e Bom",
  "Caótico e Bom",
  "Leal e Neutro",
  "Neutro",
  "Caótico e Neutro",
  "Leal e Mau",
  "Neutro e Mau",
  "Caótico e Mau",
];

export const BACKGROUNDS = [
  "Acólito",
  "Artesão",
  "Artista",
  "Charlatão",
  "Criminoso",
  "Eremita",
  "Escravo Liberto",
  "Forasteiro",
  "Herói do Povo",
  "Marinheiro",
  "Nobre",
  "Órfão",
  "Sábio",
  "Soldado",
];

export const RACES = [
  "Anão",
  "Draconato",
  "Elfo",
  "Gnomo",
  "Halfling",
  "Humano",
  "Meio-Elfo",
  "Meio-Orc",
  "Tiefling",
];

export const CLASSES = [
  "Bárbaro",
  "Bardo",
  "Bruxo",
  "Clérigo",
  "Druida",
  "Feiticeiro",
  "Guerreiro",
  "Ladino",
  "Mago",
  "Monge",
  "Paladino",
  "Patrulheiro",
];

export const DAMAGE_TYPES = [
  "Ácido",
  "Contundente",
  "Corte",
  "Elétrico",
  "Frio",
  "Fogo",
  "Força",
  "Necrótico",
  "Perfurante",
  "Psíquico",
  "Radiante",
  "Trovão",
  "Veneno",
];
