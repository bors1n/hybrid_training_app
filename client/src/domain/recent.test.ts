import type { Block, SessionRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { lastCardio, recentExerciseIds } from './recent.ts';

const st = (...ids: string[]): Block => ({ type: 'strength', id: ids.join(), superset: false, items: ids.map((exerciseId) => ({ exerciseId, sets: [] })) });
const run = (over: object): Block => ({ type: 'cardio', id: 'c' + Math.random(), modality: 'run', role: 'main', ...over }) as Block;
const s = (id: string, date: string, blocks: Block[], over: Partial<SessionRecord> = {}): SessionRecord =>
  ({ id, date, title: id, type: 'strength', blocks, updatedAt: 1, deletedAt: null, ...over }) as SessionRecord;

describe('recentExerciseIds', () => {
  const list = [
    s('a', '2026-10-01', [st('squat', 'bench')]),
    s('b', '2026-10-05', [st('row', 'squat')]),
    s('c', '2026-10-09', [{ type: 'mobility', id: 'm', items: [{ exerciseId: 'core', sets: [] }] }]),
    s('d', '2026-10-10', [st('old')], { deletedAt: 3 }),
  ];
  it('от свежих к давним, без повторов и удалённых тренировок', () => {
    expect(recentExerciseIds(list)).toEqual(['core', 'row', 'squat', 'bench']);
  });
  it('ограничение по числу', () => {
    expect(recentExerciseIds(list, 2)).toEqual(['core', 'row']);
    expect(recentExerciseIds([])).toEqual([]);
  });
});

describe('lastCardio', () => {
  const list = [
    s('a', '2026-09-16', [run({ distanceM: 4200, durationSec: 2151 })]),
    s('b', '2026-09-22', [run({ distanceM: 4490, durationSec: 2284 }), run({ modality: 'treadmill', durationSec: 600, role: 'warmup' })]),
    s('c', '2026-10-01', [run({ modality: 'bike', durationSec: 3600 })]),
  ];
  it('последняя запись того же вида и роли', () => {
    expect(lastCardio('run', 'main', list)!.block.distanceM).toBe(4490);
    expect(lastCardio('treadmill', 'warmup', list)!.date).toBe('2026-09-22');
    expect(lastCardio('treadmill', 'main', list)).toBeNull();
  });
  it('дата и исключение редактируемой тренировки', () => {
    expect(lastCardio('run', 'main', list, { onOrBefore: '2026-09-20' })!.block.distanceM).toBe(4200);
    expect(lastCardio('run', 'main', list, { excludeSessionId: 'b' })!.block.distanceM).toBe(4200);
  });
  it('записи без дистанции и времени не считаются', () => {
    expect(lastCardio('run', 'main', [s('x', '2026-10-02', [run({})])])).toBeNull();
  });
});
