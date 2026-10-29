import { describe, expect, it } from 'vitest';
import { activeProgram, BASIC_PROGRAM_ID, complexQueueAdd, complexQueueRemove, programSummary } from './programs.ts';
import { complexQueueState, queueState } from './queue.ts';

const P = (id: string) => ({ id });

describe('activeProgram', () => {
  it('берёт выбранную в настройках', () => {
    expect(activeProgram([P(BASIC_PROGRAM_ID), P('own:1')], { activeProgramId: 'own:1' })?.id).toBe('own:1');
  });
  it('без выбора или с удалённой выбранной — базовая, потом первая', () => {
    expect(activeProgram([P('own:1'), P(BASIC_PROGRAM_ID)], undefined)?.id).toBe(BASIC_PROGRAM_ID);
    expect(activeProgram([P(BASIC_PROGRAM_ID)], { activeProgramId: 'gone' })?.id).toBe(BASIC_PROGRAM_ID);
    expect(activeProgram([P('own:2'), P('own:1')], null)?.id).toBe('own:2');
    expect(activeProgram([], null)).toBeNull();
  });
});

describe('программа: размер и очередь комплексов', () => {
  it('programSummary считает шаблоны и комплексы', () => {
    expect(programSummary({ templateIds: ['a', 'b'] }, { order: ['#001'] })).toEqual({ templates: 2, complexes: 1 });
    expect(programSummary(undefined, undefined)).toEqual({ templates: 0, complexes: 0 });
  });
  it('добавление без дублей, удаление сбрасывает ручную позицию', () => {
    const q = { order: ['#001'], override: { position: 0, setAt: 1 } };
    expect(complexQueueAdd(q, '#001')).toBe(q);
    expect(complexQueueAdd(q, '#002').order).toEqual(['#001', '#002']);
    const r = complexQueueRemove(q, '#001');
    expect(r.order).toEqual([]);
    expect(r.override).toBeUndefined();
  });
  it('пустые очереди не падают', () => {
    expect(queueState({ id: 'q', templateIds: [] }, [])).toBeNull();
    expect(complexQueueState({ order: [] }, [])).toBeNull();
  });
});
