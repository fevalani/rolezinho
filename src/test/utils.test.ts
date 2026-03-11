import { describe, it, expect } from 'vitest';
import { rollDice, isCriticalHit, isCriticalFail, formatRelativeTime, getInitials } from '@/lib/utils';
import type { DiceType } from '@/lib/types';

describe('rollDice', () => {
  const types: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  types.forEach((type) => {
    it(`rolls ${type} within valid range`, () => {
      const sides = parseInt(type.slice(1));
      for (let i = 0; i < 100; i++) {
        const r = rollDice(type);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(sides);
        expect(Number.isInteger(r)).toBe(true);
      }
    });
  });
});

describe('isCriticalHit', () => {
  it('true for d20=20', () => expect(isCriticalHit('d20', 20)).toBe(true));
  it('false for d20=19', () => expect(isCriticalHit('d20', 19)).toBe(false));
  it('false for d100=20', () => expect(isCriticalHit('d100', 20)).toBe(false));
});

describe('isCriticalFail', () => {
  it('true for d20=1', () => expect(isCriticalFail('d20', 1)).toBe(true));
  it('false for d20=2', () => expect(isCriticalFail('d20', 2)).toBe(false));
  it('false for d6=1', () => expect(isCriticalFail('d6', 1)).toBe(false));
});

describe('formatRelativeTime', () => {
  it('returns "agora" for recent', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('agora');
  });

  it('returns seconds', () => {
    const past = new Date(Date.now() - 30000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\d+s/);
  });

  it('returns minutes', () => {
    const past = new Date(Date.now() - 300000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\d+min/);
  });

  it('returns hours', () => {
    const past = new Date(Date.now() - 7200000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\d+h/);
  });
});

describe('getInitials', () => {
  it('two words', () => expect(getInitials('John Doe')).toBe('JD'));
  it('one word', () => expect(getInitials('Gandalf')).toBe('G'));
  it('three words', () => expect(getInitials('Ana Maria Silva')).toBe('AM'));
  it('lowercase', () => expect(getInitials('maria clara')).toBe('MC'));
});
