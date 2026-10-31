import type { Block, SessionRecord, SetEntry } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import { strengthEnduranceBalance } from './balanceMetrics.ts';
import { cardioEntries, cardioTotals, weeklyCardioFilled } from './cardioMetrics.ts';
import { overallWeeklyTonnage, strengthOverview } from './strengthMetrics.ts';

// Среда, 28 октября 2026: окно баланса — четыре недели с 5 октября.
const today = '2026-10-28';

let n = 0;
function ses(date: string, blocks: Block[], extra: Partial<SessionRecord> = {}): SessionRecord {
  n += 1;
  return { id: `s${n}`, date, title: `T${n}`, type: 'strength', blocks, updatedAt: n, deletedAt: null, ...extra };
}
const set = (weightKg: number, reps: number, extra: Partial<SetEntry> = {}): SetEntry => ({ weightKg, reps, done: true, load: 'normal', ...extra });
const strength = (sets: SetEntry[]): Block => ({ type: 'strength', id: 'b', superset: false, items: [{ exerciseId: 'x', sets }] });
const cardio = (extra: object = {}): Block => ({ type: 'cardio', id: 'c', modality: 'run', role: 'main', ...extra }) as Block;
const complex = (result: object): Block => ({ type: 'conditioning', id: 'k', format: 'AMRAP', result }) as Block;
const mobility = (): Block => ({ type: 'mobility', id: 'm', items: [{ exerciseId: 'y', sets: [] }] });

describe('баланс сила — выносливость', () => {
  it('считает тренировки, а не минуты; смешанная идёт в обе стороны, мобильность не считается', () => {
    const list = [
      ses('2026-10-27', [strength([set(50, 5)])]),
      ses('2026-10-26', [strength([set(60, 5)]), cardio({ durationSec: 900 })]),
      ses('2026-10-20', [cardio({ distanceM: 5000 })]),
      ses('2026-10-14', [complex({ rounds: 8 })]),
      ses('2026-10-13', [mobility()]),
    ];
    expect(strengthEnduranceBalance(list, today)).toEqual({ strength: 2, endurance: 3, from: '2026-10-05' });
  });

  it('окно — четыре недели: старое, будущее, удалённое, пустое не считаются', () => {
    const list = [
      ses('2026-10-04', [strength([set(50, 5)])]), // воскресенье перед окном
      ses('2026-10-29', [strength([set(50, 5)])]), // будущее
      ses('2026-10-27', [strength([set(50, 5)])], { deletedAt: 9 }),
      ses('2026-10-27', [strength([{ ...set(50, 5), done: false }]), cardio(), complex({})]), // ничего не выполнено
    ];
    expect(strengthEnduranceBalance(list, today)).toMatchObject({ strength: 0, endurance: 0 });
  });
});

describe('общая аналитика силовых', () => {
  it('тренировки, подходы, тоннаж за четыре недели; противовес и невыполненное не входят в тоннаж', () => {
    const list = [
      ses('2026-10-27', [strength([set(100, 5), set(100, 5, { perSide: true }), set(20, 10, { load: 'assisted' }), { ...set(100, 5), done: false }])]),
      ses('2026-09-01', [strength([set(100, 5)])]),
    ];
    expect(strengthOverview(list, today)).toEqual({ sessions: 1, sets: 3, tonnageKg: 500 + 1000 });
  });

  it('тоннаж по неделям — все упражнения, пустые недели нулями', () => {
    const list = [ses('2026-10-27', [strength([set(100, 5)])]), ses('2026-10-21', [strength([set(50, 10)])])];
    const weeks = overallWeeklyTonnage(list, today, 3);
    expect(weeks).toEqual([
      { week: '2026-10-12', tonnageKg: 0 },
      { week: '2026-10-19', tonnageKg: 500 + 500 },
      { week: '2026-10-26', tonnageKg: 500 },
    ].map((w, i) => (i === 1 ? { ...w, tonnageKg: 500 } : w)));
  });
});

describe('выносливость: «Все» и недели с нулями', () => {
  const list = [
    ses('2026-10-27', [cardio({ distanceM: 5000, durationSec: 1500 })]),
    ses('2026-10-14', [cardio({ modality: 'bike', distanceM: 20000, durationSec: 3600 })]),
  ];

  it('«Все» складывает группы, группа — только своё', () => {
    const entries = cardioEntries(list);
    expect(cardioTotals(entries, 'all')).toEqual({ km: 25, minutes: 85, count: 2 });
    expect(cardioTotals(entries, 'bike')).toEqual({ km: 20, minutes: 60, count: 1 });
    expect(cardioTotals(entries, 'other')).toEqual({ km: 0, minutes: 0, count: 0 });
  });

  it('сетка недель заполнена нулями', () => {
    const weeks = weeklyCardioFilled(cardioEntries(list), 'all', today, 4);
    expect(weeks.map((w) => [w.week, w.km])).toEqual([['2026-10-05', 0], ['2026-10-12', 20], ['2026-10-19', 0], ['2026-10-26', 5]]);
  });
});
