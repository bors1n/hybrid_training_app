import type { Block, SessionRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { chartValue, complexFeed, complexSummaries, complexTotals } from './complexMetrics.ts';

let n = 0;
function k(complexId: string, date: string, result: object, format: 'AMRAP' | 'FOR_TIME' = 'AMRAP', extra: Partial<SessionRecord> = {}): SessionRecord {
  n += 1;
  const block = { type: 'conditioning', id: 'k', complexId, format, result } as Block;
  return { id: `s${n}`, date, title: 't', type: 'conditioning', blocks: [block], updatedAt: n, deletedAt: null, ...extra };
}

describe('значение для графика комплекса', () => {
  it('AMRAP — раунды, «на время» — секунды, незавершённое время — нет значения', () => {
    expect(chartValue('AMRAP', { rounds: 9, extraReps: 3 })).toBe(9);
    expect(chartValue('AMRAP', { totalReps: 180 })).toBe(180);
    expect(chartValue('FOR_TIME', { timeSec: 754 })).toBe(754);
    expect(chartValue('FOR_TIME', { timeSec: 900, finished: false })).toBeNull();
    expect(chartValue('AMRAP', {})).toBeNull();
  });
});

describe('список комплексов с попытками', () => {
  const library = [
    { id: '#001', title: 'Раз', format: 'AMRAP' as const },
    { id: '#002', title: 'Два', format: 'AMRAP' as const },
    { id: '#005', title: 'Пять', format: 'AMRAP' as const },
  ];

  it('считает попытки и рекорд; сделанные — первыми, недавние выше', () => {
    const sessions = [k('#005', '2026-10-18', { rounds: 9 }), k('#005', '2026-10-25', { rounds: 7, extraReps: 14 }), k('#001', '2026-10-20', { rounds: 5 })];
    const list = complexSummaries(library, sessions);
    expect(list.map((c) => c.complexId)).toEqual(['#005', '#001', '#002']);
    expect(list[0]).toMatchObject({ attempts: 2, lastDate: '2026-10-25' });
    expect(list[0]!.best?.block.result).toEqual({ rounds: 9 });
    expect(list[2]).toMatchObject({ attempts: 0, lastDate: null, best: null });
  });

  it('удалённые тренировки и попытки без результата не считаются', () => {
    const list = complexSummaries(library, [k('#001', '2026-10-20', { rounds: 5 }, 'AMRAP', { deletedAt: 1 }), k('#002', '2026-10-21', {})]);
    expect(list.every((c) => c.attempts === 0)).toBe(true);
    expect(list.map((c) => c.complexId)).toEqual(['#001', '#002', '#005']);
  });
});

describe('итоги и лента комплексов', () => {
  it('итоги: выполнено, повторы (totalReps, а без него добор), раунды; пустые не считаются', () => {
    const sessions = [
      k('#001', '2026-10-20', { rounds: 7, extraReps: 14 }),
      k('#002', '2026-10-21', { totalReps: 180 }, 'AMRAP'),
      k('#003', '2026-10-22', { timeSec: 600 }, 'FOR_TIME'),
      k('#004', '2026-10-23', {}),
      k('#005', '2026-10-24', { rounds: 5 }, 'AMRAP', { deletedAt: 5 }),
    ];
    expect(complexTotals(sessions)).toEqual({ done: 3, reps: 194, rounds: 7 });
  });

  it('лента: новые сверху, повторы комплекса — отдельные карточки, рекорд у лучшей из нескольких', () => {
    const sessions = [k('#005', '2026-10-18', { rounds: 9 }), k('#005', '2026-10-25', { rounds: 7 }), k('#001', '2026-10-20', { rounds: 5 })];
    const feed = complexFeed(sessions);
    expect(feed.map((f) => [f.date, f.title, f.record])).toEqual([
      ['2026-10-25', '#005', false],
      ['2026-10-20', '#001', false], // единственная попытка — не рекорд
      ['2026-10-18', '#005', true],
    ]);
  });

  it('свой комплекс без номера попадает в ленту', () => {
    const own = { type: 'conditioning', id: 'k', name: 'Свой', format: 'AMRAP', result: { rounds: 4 } } as Block;
    const feed = complexFeed([{ id: 'x', date: '2026-10-20', blocks: [own], updatedAt: 1, deletedAt: null }]);
    expect(feed).toMatchObject([{ title: 'Свой', record: false }]);
  });
});
