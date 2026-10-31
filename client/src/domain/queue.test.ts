import type { Block } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import { complexQueueState, queueState } from './queue.ts';

const Q = { id: 'q', templateIds: ['t1', 't2', 't3'] };
let n = 0;
type Over = Partial<{ queueId: string; queueSlot: number; finishedAt: number | undefined; deletedAt: number | null; date: string; blocks: Block[] }>;
/** Тренировка очереди: по умолчанию завершена, время завершения растёт с каждым вызовом. */
function done(slot: number, over: Over = {}) {
  n += 1;
  return {
    id: `s${n}`, date: over.date ?? `2026-10-${String(n).padStart(2, '0')}`, blocks: over.blocks ?? [], startedAt: n * 1000, updatedAt: n,
    deletedAt: over.deletedAt ?? null,
    finishedAt: 'finishedAt' in over ? over.finishedAt : n * 1000 + 500,
    queueId: over.queueId ?? 'q', queueSlot: slot,
  };
}
/** Свободная тренировка или пробежка: без очереди. */
const free = (over: Over = {}) => {
  const s = done(0, over);
  const { queueId: _q, queueSlot: _s, ...rest } = s;
  return rest;
};

describe('очередь Т1 → Т2 → Т3', () => {
  it('без истории следующая — Т1, цикл 1', () => {
    expect(queueState(Q, [])).toMatchObject({ position: 0, templateId: 't1', cycle: 1, completed: 0, doneInCycle: {} });
  });
  it('пустая очередь — нет состояния', () => {
    expect(queueState({ id: 'q', templateIds: [] }, [])).toBeNull();
  });

  it('завершение Т1 делает следующей Т2 (критерий приёмки)', () => {
    const s = queueState(Q, [done(0)])!;
    expect(s).toMatchObject({ position: 1, templateId: 't2', cycle: 1, completed: 1 });
    expect(s.doneInCycle).toEqual({ 0: expect.any(String) });
  });
  it('Т1 → Т2 → Т3 → снова Т1 в новом цикле', () => {
    const history = [done(0), done(1), done(2)];
    expect(queueState(Q, history)).toMatchObject({ templateId: 't1', cycle: 2, completed: 3, doneInCycle: {} });
    expect(queueState(Q, [...history, done(0)])).toMatchObject({ templateId: 't2', cycle: 2 });
  });

  it('свободная тренировка и пробежка очередь не сдвигают (критерий приёмки)', () => {
    const history = [done(0), free(), free({ blocks: [{ type: 'cardio', id: 'c', modality: 'run', role: 'main', durationSec: 1800 }] })];
    expect(queueState(Q, history)).toMatchObject({ templateId: 't2', completed: 1 });
  });
  it('незавершённая тренировка очередь не двигает', () => {
    expect(queueState(Q, [done(0), done(1, { finishedAt: undefined })])).toMatchObject({ templateId: 't2' });
  });
  it('удалённая тренировка очередь не двигает; удаление последней возвращает назад', () => {
    expect(queueState(Q, [done(0), done(1, { deletedAt: 5 })])).toMatchObject({ templateId: 't2' });
    const [a, b] = [done(0), done(1)];
    expect(queueState(Q, [a, b])!.templateId).toBe('t3');
    expect(queueState(Q, [a, { ...b, deletedAt: 9 }])!.templateId).toBe('t2');
  });
  it('другая очередь не влияет', () => {
    expect(queueState(Q, [done(0, { queueId: 'other' }), done(1, { queueId: 'other' })])).toMatchObject({ templateId: 't1', completed: 0 });
    expect(queueState({ id: 'other', templateIds: ['a', 'b'] }, [done(0, { queueId: 'other' })])).toMatchObject({ templateId: 'b' });
  });

  it('пропуск не страшен: сделал Т3 вместо Т1 — следующая Т1 нового цикла', () => {
    expect(queueState(Q, [done(2)])).toMatchObject({ templateId: 't1', cycle: 2 });
  });
  it('повторил тот же слот (Т2 дважды): следующая Т3 и новый круг не начался раньше времени', () => {
    const s = queueState(Q, [done(0), done(1), done(1)])!;
    expect(s).toMatchObject({ templateId: 't3', cycle: 2 });
    expect(s.doneInCycle).toEqual({ 1: expect.any(String) });
  });
  it('порядок определяет время завершения, а не порядок в массиве', () => {
    const [a, b] = [done(0), done(1)];
    expect(queueState(Q, [b, a])).toMatchObject({ templateId: 't3' });
  });
  it('слот за пределами очереди (шаблонов стало меньше) не ломает расчёт', () => {
    expect(queueState({ id: 'q', templateIds: ['t1', 't2'] }, [done(2)])).toMatchObject({ position: 1, templateId: 't2' });
  });
  it('даты слотов в текущем цикле — для подписей «23 окт»', () => {
    const s = queueState(Q, [done(0, { date: '2026-10-20' }), done(1, { date: '2026-10-23' })])!;
    expect(s.doneInCycle).toEqual({ 0: '2026-10-20', 1: '2026-10-23' });
  });
});

describe('ручной выбор: «Новый цикл» и «начать с…»', () => {
  it('«Новый цикл»: следующая Т1, пока не завершена тренировка очереди', () => {
    const history = [done(0), done(1)];
    expect(queueState({ ...Q, override: { position: 0, setAt: 1_000_000 } }, history)).toMatchObject({ templateId: 't1', cycle: 2, doneInCycle: {} });
  });
  it('после выбора и завершения тренировки очередь снова считается по истории', () => {
    const q = { ...Q, override: { position: 0, setAt: 1_000_000 } };
    const history = [done(0), done(1), done(0, { finishedAt: 2_000_000 })];
    expect(queueState(q, history)).toMatchObject({ templateId: 't2', cycle: 2 });
  });
  it('выбор «начать с Т3» в пустой очереди', () => {
    expect(queueState({ ...Q, override: { position: 2, setAt: 5 } }, [])).toMatchObject({ templateId: 't3', cycle: 1 });
  });
  it('тренировка, завершённая до выбора, его не отменяет', () => {
    const q = { ...Q, override: { position: 2, setAt: 10_000 } };
    expect(queueState(q, [done(0, { finishedAt: 5_000 })])).toMatchObject({ templateId: 't3' });
  });
});

describe('очередь комплексов', () => {
  const order = ['#001', '#002', '#003', '#005', '#006'];
  const k = (complexId?: string): Block => ({ type: 'conditioning', id: 'k' + Math.random(), format: 'AMRAP', result: {}, ...(complexId ? { complexId } : {}) }) as Block;
  const session = (blocks: Block[], over: Over = {}) => free({ blocks, ...over });

  it('без истории — первый комплекс', () => {
    expect(complexQueueState({ order }, [])).toEqual({ position: 0, complexId: '#001' });
    expect(complexQueueState({ order: [] }, [])).toBeNull();
  });
  it('сдвигается, когда завершена тренировка с ожидаемым комплексом', () => {
    expect(complexQueueState({ order }, [session([k('#001')])])).toEqual({ position: 1, complexId: '#002' });
    expect(complexQueueState({ order }, [session([k('#001')]), session([k('#002')]), session([k('#003')])])).toEqual({ position: 3, complexId: '#005' });
  });
  it('другой комплекс (в том числе #004 вне очереди) очередь не двигает', () => {
    expect(complexQueueState({ order }, [session([k('#001')]), session([k('#004')]), session([k('#006')])])).toEqual({ position: 1, complexId: '#002' });
  });
  it('комплекс без номера, не завершённая и удалённая тренировки не двигают', () => {
    const s = [session([k()]), session([k('#001')], { finishedAt: undefined }), session([k('#001')], { deletedAt: 3 })];
    expect(complexQueueState({ order }, s)).toEqual({ position: 0, complexId: '#001' });
  });
  it('работает в любой тренировке, не только из очереди шаблонов; несколько блоков по порядку', () => {
    expect(complexQueueState({ order }, [session([k('#001'), k('#002')])])).toEqual({ position: 2, complexId: '#003' });
    expect(complexQueueState({ order }, [done(2, { blocks: [k('#001')] })])).toEqual({ position: 1, complexId: '#002' });
  });
  it('очередь идёт по кругу', () => {
    const s = order.map((id) => session([k(id)]));
    expect(complexQueueState({ order }, s)).toEqual({ position: 0, complexId: '#001' });
  });
  it('ручной выбор: учитываются только тренировки после него', () => {
    const q = { order, override: { position: 3, setAt: 5_000_000 } };
    expect(complexQueueState(q, [session([k('#001')])])).toEqual({ position: 3, complexId: '#005' });
    expect(complexQueueState(q, [session([k('#005')], { finishedAt: 6_000_000 })])).toEqual({ position: 4, complexId: '#006' });
  });
});
