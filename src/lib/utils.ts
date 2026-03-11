import type { DiceType } from './types';
import { DICE_CONFIG } from './types';

/** Crypto-secure dice roll */
export function rollDice(type: DiceType): number {
  const { sides } = DICE_CONFIG[type];
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

export function isCriticalHit(type: DiceType, result: number): boolean {
  return type === 'd20' && result === 20;
}

export function isCriticalFail(type: DiceType, result: number): boolean {
  return type === 'd20' && result === 1;
}

export function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return 'agora';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(timestamp).toLocaleDateString('pt-BR');
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
