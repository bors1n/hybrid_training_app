import type { SessionRecord } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import { lastCardioEntry } from './lastCardio.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

const session = (id: string, date: string, blocks: S['blocks'], over: Partial<S> = {}): S => ({
  id, date, blocks, startedAt: Date.parse(`${date}T10:00:00Z`), updatedAt: 1, deletedAt: null, ...over,
});

const cardio = (id: string, modality: 'run' | 'bike' | 'skierg', role: 'main' | 'warmup' | 'finisher', over: object = {}): S['blocks'][number] =>
  ({ type: 'cardio', id, modality, role, name: 'К', ...over }) as S['blocks'][number];

describe('lastCardioEntry', () => {
  it('нет кардио — null', () => {
    expect(lastCardioEntry([])).toBeNull();
    expect(lastCardioEntry([session('a', '2026-10-20', [])])).toBeNull();
  });

  it('берёт самое свежее кардио любого вида', () => {
    const list = [
      session('a', '2026-10-20', [cardio('1', 'run', 'main', { distanceM: 5000, durationSec: 1500 })]),
      session('b', '2026-10-25', [cardio('2', 'bike', 'main', { distanceM: 20000, durationSec: 3000 })]),
    ];
    const last = lastCardioEntry(list)!;
    expect(last.sessionId).toBe('b');
    expect(last.block.modality).toBe('bike');
    expect(last.speedKmh).toBeCloseTo(24);
  });

  it('разминка и финиш не считаются, как и пустые блоки', () => {
    const list = [
      session('a', '2026-10-20', [cardio('1', 'run', 'main', { distanceM: 5000, durationSec: 1500 })]),
      session('b', '2026-10-25', [cardio('2', 'run', 'warmup', { durationSec: 300 }), cardio('3', 'skierg', 'finisher', { durationSec: 900 }), cardio('4', 'run', 'main')]),
    ];
    expect(lastCardioEntry(list)!.sessionId).toBe('a');
  });

  it('удалённые тренировки не считаются', () => {
    const list = [
      session('a', '2026-10-20', [cardio('1', 'run', 'main', { durationSec: 1500 })]),
      session('b', '2026-10-25', [cardio('2', 'run', 'main', { durationSec: 1800 })], { deletedAt: 5 }),
    ];
    expect(lastCardioEntry(list)!.sessionId).toBe('a');
  });
});
