// ═══════════════════════════════════════════
// Auth / User
// ═══════════════════════════════════════════

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════
// Taverna — Dice Rolls
// ═══════════════════════════════════════════

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRoll {
  id: string;
  user_id: string;
  dice_type: DiceType;
  result: number;
  created_at: string;
  // joined from profiles
  profile?: Profile;
}

export const DICE_CONFIG: Record<DiceType, { sides: number; label: string; icon: string }> = {
  d4:   { sides: 4,   label: 'D4',   icon: '▲' },
  d6:   { sides: 6,   label: 'D6',   icon: '⬡' },
  d8:   { sides: 8,   label: 'D8',   icon: '◆' },
  d10:  { sides: 10,  label: 'D10',  icon: '⬠' },
  d12:  { sides: 12,  label: 'D12',  icon: '⬡' },
  d20:  { sides: 20,  label: 'D20',  icon: '⬡' },
  d100: { sides: 100, label: 'D100', icon: '%' },
};

export const DICE_TYPES: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

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
    id: 'taverna',
    name: 'Taverna D20',
    icon: '🎲',
    path: '/taverna',
    enabled: true,
    description: 'Rolagem de dados de RPG em tempo real',
  },
  {
    id: 'splitwise',
    name: 'Racha Conta',
    icon: '💰',
    path: '/racha-conta',
    enabled: false,
    description: 'Divisão de gastos entre amigos',
  },
  {
    id: 'ficha',
    name: 'Fichas de RPG',
    icon: '📋',
    path: '/fichas',
    enabled: false,
    description: 'Gerenciamento de fichas de personagem',
  },
];
