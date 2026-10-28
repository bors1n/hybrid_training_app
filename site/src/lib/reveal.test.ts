import { describe, expect, it } from 'vitest';
import { REVEAL_SELECTOR, revealDelay } from './reveal.ts';

describe('появление при прокрутке', () => {
  it('задержка растёт по 80 мс и ограничена 0,4 с', () => {
    expect([0, 1, 2, 5, 6, 40].map(revealDelay)).toEqual([0, 0.08, 0.16, 0.4, 0.4, 0.4]);
  });
  it('селектор непустой и без дубликатов', () => {
    const parts = REVEAL_SELECTOR.split(', ');
    expect(parts.length).toBeGreaterThan(10);
    expect(new Set(parts).size).toBe(parts.length);
  });
});
