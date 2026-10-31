import type { SessionRecord } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import { lastComplexAttempt } from './complexResults.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

const session = (id: string, date: string, blocks: S['blocks'], over: Partial<S> = {}): S => ({
  id, date, blocks, startedAt: Date.parse(`${date}T10:00:00Z`), updatedAt: 1, deletedAt: null, ...over,
});

const complex = (id: string, format: 'AMRAP' | 'FOR_TIME', result: object, over: object = {}): S['blocks'][number] =>
  ({ type: 'conditioning', id, format, result, ...over }) as S['blocks'][number];

describe('lastComplexAttempt', () => {
  it('нет комплексов — null', () => {
    expect(lastComplexAttempt([])).toBeNull();
    expect(lastComplexAttempt([session('a', '2026-10-20', [])])).toBeNull();
  });

  it('берёт самый свежий комплекс с результатом', () => {
    const list = [
      session('a', '2026-10-20', [complex('1', 'FOR_TIME', { timeSec: 600 }, { complexId: '#001' })]),
      session('b', '2026-10-25', [complex('2', 'AMRAP', { rounds: 9 }, { complexId: '#002' })]),
    ];
    const last = lastComplexAttempt(list)!;
    expect(last.sessionId).toBe('b');
    expect(last.block.complexId).toBe('#002');
  });

  it('комплекс без результата пропускается, свой комплекс без номера считается', () => {
    const list = [
      session('a', '2026-10-20', [complex('1', 'AMRAP', { totalReps: 120 })]),
      session('b', '2026-10-25', [complex('2', 'AMRAP', {}, { complexId: '#003' })]),
    ];
    expect(lastComplexAttempt(list)!.sessionId).toBe('a');
  });

  it('удалённые тренировки не считаются', () => {
    const list = [
      session('a', '2026-10-20', [complex('1', 'AMRAP', { rounds: 5 })]),
      session('b', '2026-10-25', [complex('2', 'AMRAP', { rounds: 7 })], { deletedAt: 9 }),
    ];
    expect(lastComplexAttempt(list)!.sessionId).toBe('a');
  });
});
