import { describe, expect, it } from 'vitest';
import { fnv1a, identicon, IDENTICON_COLORS } from './identicon.ts';

describe('identicon', () => {
  it('FNV-1a: известные значения', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  it('детерминирован: один id — один рисунок', () => {
    expect(identicon('user-1')).toEqual(identicon('user-1'));
  });

  it('сетка 5×5, зеркальная по вертикальной оси, не пустая', () => {
    for (const seed of ['a', 'user-1', 'b8f3-77', '', 'zizy613@gmail.com']) {
      const { cells } = identicon(seed);
      expect(cells).toHaveLength(5);
      for (const row of cells) {
        expect(row).toHaveLength(5);
        expect(row[0]).toBe(row[4]);
        expect(row[1]).toBe(row[3]);
      }
      expect(cells.some((r) => r.some(Boolean))).toBe(true);
    }
  });

  it('разные id дают разные аватары, цвет — из палитры без оранжевого', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    const pics = new Set(ids.map((id) => JSON.stringify(identicon(id))));
    expect(pics.size).toBeGreaterThan(35);
    for (const id of ids) expect(IDENTICON_COLORS).toContain(identicon(id).color);
    expect(IDENTICON_COLORS.join()).not.toContain('conditioning');
  });
});
