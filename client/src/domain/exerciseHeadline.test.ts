import type { Block, SessionRecord, SetEntry } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { exerciseHeadline, frequentExercises } from './exerciseHeadline.ts';

let n = 0;
const set = (weightKg: number | undefined, reps: number | undefined, extra: Partial<SetEntry> = {}): SetEntry => ({ weightKg, reps, done: true, load: 'normal', ...extra });
function ses(date: string, exerciseId: string, sets: SetEntry[]): SessionRecord {
  n += 1;
  const block: Block = { type: 'strength', id: `b${n}`, superset: false, items: [{ exerciseId, sets }] };
  return { id: `s${n}`, date, title: 't', type: 'strength', blocks: [block], updatedAt: n, deletedAt: null };
}

describe('подпись упражнения в каталоге', () => {
  it('лучший расчётный 1ПМ, если есть подходы с весом', () => {
    expect(exerciseHeadline('sq', [ses('2026-10-20', 'sq', [set(85, 8)])])).toBe('1ПМ 107,7 кг');
  });
  it('нет веса — лучший подход последней тренировки (повторы)', () => {
    expect(exerciseHeadline('pu', [ses('2026-10-20', 'pu', [set(undefined, 12)])])).toBe('12');
  });
  it('противовес без 1ПМ — вес × повторы', () => {
    expect(exerciseHeadline('g', [ses('2026-10-20', 'g', [set(18.5, 6, { load: 'assisted' })])])).toBe('18,5 кг × 6');
  });
  it('не делал — null', () => expect(exerciseHeadline('x', [])).toBeNull());
});

describe('часто делаешь', () => {
  it('по числу тренировок, потом по свежести; не больше лимита', () => {
    const sessions = [
      ses('2026-10-01', 'a', [set(50, 5)]), ses('2026-10-08', 'a', [set(50, 5)]),
      ses('2026-10-09', 'b', [set(50, 5)]), ses('2026-10-20', 'c', [set(50, 5)]),
    ];
    expect(frequentExercises(sessions, 2).map((f) => f.exerciseId)).toEqual(['a', 'c']);
    expect(frequentExercises([], 5)).toEqual([]);
  });
});
