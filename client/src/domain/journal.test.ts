import type { Block, SessionRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { attempts, bestAttempt, formatResult, isTimeFormat, plural, resultScore } from './complexResults.ts';
import { filterSessions, sortSessions, todayKey } from './history.ts';
import { formatDateShort, formatPerformance, formatSet, lastPerformance } from './lastPerformance.ts';
import { deriveSessionType } from './sessionType.ts';
import { countPendingSets, sessionDurationMin, summarize } from './summary.ts';

const set = (over: object = {}) => ({ done: true, load: 'normal' as const, ...over });
const strength = (exerciseId: string, sets: object[], id = exerciseId): Block => ({
  type: 'strength', id, superset: false, items: [{ exerciseId, sets: sets.map((s) => set(s)) }],
});
const cardio = (over: object = {}): Block => ({ type: 'cardio', id: 'c' + Math.random(), modality: 'run', role: 'main', ...over }) as Block;
const complex = (over: object = {}): Block =>
  ({ type: 'conditioning', id: 'k' + Math.random(), complexId: '#005', format: 'AMRAP', result: {}, ...over }) as Block;

function session(id: string, date: string, blocks: Block[], over: Partial<SessionRecord> = {}): SessionRecord {
  return { id, date, title: `Т ${id}`, type: 'strength', blocks, updatedAt: 1, deletedAt: null, ...over };
}

describe('deriveSessionType', () => {
  it('один вид основной работы — он и есть тип', () => {
    expect(deriveSessionType([strength('a', [{}])])).toBe('strength');
    expect(deriveSessionType([cardio()])).toBe('cardio');
    expect(deriveSessionType([complex()])).toBe('conditioning');
  });
  it('разминки, финиши и мобильность тип не меняют (Тренировка 1 из шаблона)', () => {
    const blocks: Block[] = [
      cardio({ modality: 'stairs', role: 'warmup' }),
      strength('squat', [{}]),
      { type: 'mobility', id: 'm', items: [{ exerciseId: 'core', sets: [] }] },
      cardio({ modality: 'indoor_bike', role: 'finisher' }),
    ];
    expect(deriveSessionType(blocks)).toBe('strength');
  });
  it('несколько видов — смешанная', () => {
    expect(deriveSessionType([strength('a', [{}]), complex()])).toBe('mixed');
    expect(deriveSessionType([strength('a', [{}]), cardio()])).toBe('mixed');
  });
  it('без основной работы: мобильность, затем кардио, иначе смешанная', () => {
    expect(deriveSessionType([{ type: 'mobility', id: 'm', items: [{ exerciseId: 'x', sets: [] }] }])).toBe('mobility');
    expect(deriveSessionType([cardio({ role: 'warmup' })])).toBe('cardio');
    expect(deriveSessionType([])).toBe('mixed');
  });
});

describe('summarize', () => {
  it('тоннаж: только выполненные подходы с обычным весом', () => {
    const s = summarize({
      blocks: [
        strength('squat', [{ weightKg: 85, reps: 8 }, { weightKg: 85, reps: 8 }, { weightKg: 100, reps: 5, done: false }]),
        strength('pullup', [{ weightKg: 10, reps: 8, load: 'added' }]),
        strength('gravitron', [{ weightKg: 18.5, reps: 12, load: 'assisted' }]),
      ],
    });
    expect(s.tonnageKg).toBe(85 * 8 * 2);
    expect(s).toMatchObject({ doneSets: 4, totalSets: 5, blocks: 3 });
  });
  it('повторы на сторону считаются на обе стороны', () => {
    expect(summarize({ blocks: [strength('lunge', [{ weightKg: 15, reps: 12, perSide: true }])] }).tonnageKg).toBe(15 * 12 * 2);
  });
  it('подходы без веса или повторов (время, свой вес) в тоннаже не участвуют', () => {
    expect(summarize({ blocks: [strength('plank', [{ durationSec: 60 }]), strength('pushups', [{ reps: 20 }])] }).tonnageKg).toBe(0);
  });
  it('км и время кардио: разминки и финиши входят', () => {
    const s = summarize({
      blocks: [cardio({ distanceM: 3090, durationSec: 1448 }), cardio({ role: 'warmup', distanceM: 1000, durationSec: 600 })],
    });
    expect(s).toMatchObject({ distanceM: 4090, cardioSec: 2048 });
  });
  it('число невыполненных подходов', () => {
    expect(countPendingSets({ blocks: [strength('a', [{ done: true }, { done: false }, { done: false }])] })).toBe(2);
  });
});

describe('sessionDurationMin', () => {
  it('введённая вручную важнее часов', () => {
    expect(sessionDurationMin({ durationMin: 66, startedAt: 0, finishedAt: 10 * 60_000 })).toBe(66);
  });
  it('по часам, если тренировка шла в один день', () => {
    expect(sessionDurationMin({ startedAt: 1_000, finishedAt: 1_000 + 42 * 60_000 })).toBe(42);
    expect(sessionDurationMin({ startedAt: 1_000, finishedAt: 1_000 + 20 * 60 * 60_000 })).toBeNull();
  });
  it('нет данных — null', () => {
    expect(sessionDurationMin({})).toBeNull();
    expect(sessionDurationMin({ startedAt: 5 })).toBeNull();
  });
});

describe('lastPerformance', () => {
  const sessions = [
    session('a', '2026-10-13', [strength('squat', [{ weightKg: 80, reps: 12 }])]),
    session('b', '2026-10-20', [strength('squat', [{ weightKg: 85, reps: 8 }, { weightKg: 85, reps: 8 }, { weightKg: 85, reps: 7 }, { weightKg: 90, reps: 3, done: false }])]),
    session('c', '2026-10-23', [strength('bench', [{ weightKg: 80, reps: 8 }])]),
    session('d', '2026-10-25', [strength('squat', [{ weightKg: 87.5, reps: 8 }])]),
  ];
  it('последняя тренировка с упражнением, только выполненные подходы', () => {
    const p = lastPerformance('squat', sessions, { onOrBefore: '2026-10-21' })!;
    expect(p.sessionId).toBe('b');
    expect(p.sets).toHaveLength(3);
    expect(formatPerformance(p.sets)).toBe('85 кг × 8 · 85 кг × 8 · 85 кг × 7');
  });
  it('внесение задним числом: «прошлое» — то, что было до даты тренировки', () => {
    expect(lastPerformance('squat', sessions, { onOrBefore: '2026-10-14' })!.sessionId).toBe('a');
    expect(lastPerformance('squat', sessions, { onOrBefore: '2026-10-01' })).toBeNull();
  });
  it('редактируемая тренировка исключается', () => {
    expect(lastPerformance('squat', sessions, { excludeSessionId: 'd' })!.sessionId).toBe('b');
  });
  it('удалённые тренировки и упражнения без выполненных подходов пропускаются', () => {
    const list = [
      session('x', '2026-10-01', [strength('row', [{ weightKg: 50, reps: 10 }])]),
      session('y', '2026-10-02', [strength('row', [{ weightKg: 60, reps: 10 }])], { deletedAt: 5 }),
      session('z', '2026-10-03', [strength('row', [{ weightKg: 70, reps: 10, done: false }])]),
    ];
    expect(lastPerformance('row', list)!.sessionId).toBe('x');
    expect(lastPerformance('никогда', list)).toBeNull();
  });
  it('две тренировки в один день: последняя по времени начала', () => {
    const list = [
      session('m', '2026-10-05', [strength('row', [{ weightKg: 50, reps: 10 }])], { startedAt: 100 }),
      session('n', '2026-10-05', [strength('row', [{ weightKg: 55, reps: 10 }])], { startedAt: 200 }),
    ];
    expect(lastPerformance('row', list)!.sessionId).toBe('n');
  });
});

describe('formatSet', () => {
  it('вес, отягощение, противовес, время', () => {
    expect(formatSet({ weightKg: 85, reps: 8, load: 'normal' })).toBe('85 кг × 8');
    expect(formatSet({ weightKg: 10, reps: 8, load: 'added' })).toBe('+10 кг × 8');
    expect(formatSet({ weightKg: 18.5, reps: 12, load: 'assisted' })).toBe('18,5 кг (противовес) × 12');
    expect(formatSet({ durationSec: 90, load: 'normal' })).toBe('1:30');
    expect(formatSet({ reps: 20, load: 'normal' })).toBe('20');
  });
  it('даты: год показывается, только если он не текущий', () => {
    expect(formatDateShort('2026-10-20', '2026-10-27')).toBe('20 окт');
    expect(formatDateShort('2025-03-05', '2026-10-27')).toBe('5 мар 2025');
  });
});

describe('результаты комплексов', () => {
  it('«9 раундов», «7 + 14», время, «не уложился», сумма повторов', () => {
    expect(formatResult('AMRAP', { rounds: 9 })).toBe('9 раундов');
    expect(formatResult('AMRAP', { rounds: 1 })).toBe('1 раунд');
    expect(formatResult('AMRAP', { rounds: 3, extraReps: 7 })).toBe('3 + 7');
    expect(formatResult('FOR_TIME', { timeSec: 755 })).toBe('12:35');
    expect(formatResult('FOR_TIME', { timeSec: 720, finished: false })).toBe('не уложился · 12:00');
    expect(formatResult('FOR_TIME', { finished: false })).toBe('не уложился');
    expect(formatResult('EMOM', { totalReps: 184 })).toBe('184 повтора');
    expect(formatResult('AMRAP', {})).toBe('—');
  });
  it('склонение', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, 'раунд', 'раунда', 'раундов'))).toEqual(
      ['раунд', 'раунда', 'раундов', 'раундов', 'раундов', 'раунд', 'раунда', 'раундов', 'раундов'],
    );
  });
  it('сравнение: AMRAP — больше раундов и повторов лучше', () => {
    const a = resultScore('AMRAP', { rounds: 9 })!;
    const b = resultScore('AMRAP', { rounds: 9, extraReps: 12 })!;
    const c = resultScore('AMRAP', { rounds: 10 })!;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(resultScore('AMRAP', {})).toBeNull();
  });
  it('сравнение: «на время» — быстрее лучше, незавершённый хуже любого завершённого', () => {
    const fast = resultScore('FOR_TIME', { timeSec: 600 })!;
    const slow = resultScore('FOR_TIME', { timeSec: 700 })!;
    const dnf = resultScore('FOR_TIME', { timeSec: 720, finished: false, totalReps: 150 })!;
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(dnf);
    expect(isTimeFormat('LADDER')).toBe(true);
    expect(isTimeFormat('AMRAP')).toBe(false);
  });

  const history = [
    session('s1', '2026-08-10', [complex({ result: { rounds: 8, extraReps: 3 } })]),
    session('s2', '2026-09-14', [complex({ result: { rounds: 9, extraReps: 12 } })]),
    session('s3', '2026-10-18', [complex({ result: { rounds: 9 } })]),
    session('s4', '2026-10-20', [complex({ complexId: '#006', format: 'EMOM', result: { totalReps: 100 } })]),
    session('s5', '2026-10-21', [complex({ result: {} })]),
    session('s6', '2026-10-22', [complex({ result: { rounds: 12 } })], { deletedAt: 9 }),
  ];
  it('история комплекса: от новых к старым, без пустых результатов, чужих комплексов и удалённых', () => {
    const list = attempts('#005', history);
    expect(list.map((a) => a.sessionId)).toEqual(['s3', 's2', 's1']);
    expect(formatResult(list[0]!.block.format, list[0]!.block.result)).toBe('9 раундов');
  });
  it('рекорд — лучшая попытка; при равенстве — более ранняя', () => {
    const best = bestAttempt(attempts('#005', history))!;
    expect(best.sessionId).toBe('s2');
    const tie = [session('t1', '2026-01-01', [complex({ result: { rounds: 5 } })]), session('t2', '2026-02-01', [complex({ result: { rounds: 5 } })])];
    expect(bestAttempt(attempts('#005', tie))!.sessionId).toBe('t1');
    expect(bestAttempt([])).toBeNull();
  });
  it('редактируемая тренировка в историю не попадает', () => {
    expect(attempts('#005', history, { excludeSessionId: 's3' }).map((a) => a.sessionId)).toEqual(['s2', 's1']);
  });
});

describe('история', () => {
  const list = [
    session('1', '2026-10-20', [], { title: 'Тренировка 1', type: 'mixed' }),
    session('2', '2026-10-23', [], { title: 'Тренировка 2', type: 'strength', notes: 'болела спина' }),
    session('3', '2026-10-23', [], { title: 'Бег', type: 'cardio', startedAt: 500 }),
    session('4', '2026-09-01', [], { title: 'Удалённая', deletedAt: 3 }),
  ];
  it('сортировка: новые сверху, удалённые скрыты, в один день — по времени', () => {
    expect(sortSessions(list).map((s) => s.id)).toEqual(['3', '2', '1']);
  });
  it('поиск по названию, заметке и дате в двух форматах', () => {
    const q = (query: string, type: SessionRecord['type'] | null = null) => filterSessions(list, { query, type }).map((s) => s.id);
    expect(q('бег')).toEqual(['3']);
    expect(q('спина')).toEqual(['2']);
    expect(q('20.10.2026')).toEqual(['1']);
    expect(q('5.10.2026')).toEqual([]);
    expect(q('23.10.2026 бег')).toEqual(['3']);
    expect(q('2026-10-23')).toEqual(['2', '3']);
    expect(q('тренировка 2')).toEqual(['2']);
    expect(q('', 'cardio')).toEqual(['3']);
    expect(q('тренировка', 'cardio')).toEqual([]);
  });
  it('сегодняшняя дата в формате ГГГГ-ММ-ДД', () => {
    expect(todayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(todayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});
