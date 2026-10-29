import { SessionRecordSchema, type Block, type SessionRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, QUEUE } from '../seed/templates.ts';
import { dropEmptyBlocks, isEmptyBlock, sessionFromTemplate, type FromTemplateOptions } from './templateSession.ts';

const [T1, T2, T3] = TEMPLATES.map((t) => ({ ...t, updatedAt: 1, deletedAt: null })) as [
  (typeof TEMPLATES)[0] & { updatedAt: number; deletedAt: null }, (typeof TEMPLATES)[0] & { updatedAt: number; deletedAt: null }, (typeof TEMPLATES)[0] & { updatedAt: number; deletedAt: null },
];

const base = (over: Partial<FromTemplateOptions> = {}): FromTemplateOptions => ({
  date: '2026-10-27', now: 5_000, id: 'new', sessions: [], queue: { id: QUEUE.id, slot: 0 }, ...over,
});
const valid = (s: object): boolean => SessionRecordSchema.safeParse({ ...s, updatedAt: 1, deletedAt: null }).success;
const strengthBlocks = (blocks: Block[]) => blocks.flatMap((b) => (b.type === 'strength' ? [b] : []));

function past(over: Partial<SessionRecord>): SessionRecord {
  return { id: 'p', date: '2026-10-20', title: 'Т1', type: 'strength', finishedAt: 5, blocks: [], updatedAt: 1, deletedAt: null, ...over } as SessionRecord;
}
const squatSets = (...sets: [number, number][]): Block => ({
  type: 'strength', id: 'b', superset: false,
  items: [{ exerciseId: 'repdb:squat', sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, done: true, load: 'normal' as const })) }],
});

describe('тренировка из шаблона', () => {
  it('общие поля: название шаблона, шаблон и слот очереди, время начала, не завершена', () => {
    const s = sessionFromTemplate(T1, base());
    expect(s).toMatchObject({ id: 'new', title: 'Тренировка 1', date: '2026-10-27', startedAt: 5_000, templateId: 'seed:template:t1', queueId: 'seed:queue:cycle', queueSlot: 0 });
    expect(s.finishedAt).toBeUndefined();
    expect(valid(s)).toBe(true);
  });
  it('без очереди (шаблон вне очереди) очередь не указывается', () => {
    const s = sessionFromTemplate(T1, base({ queue: undefined }));
    expect(s).not.toHaveProperty('queueId');
    expect(s).not.toHaveProperty('queueSlot');
  });
  it('Т1 целиком: блоки по порядку шаблона с детерминированными id; тип «силовая»', () => {
    const s = sessionFromTemplate(T1, base());
    expect(s.blocks).toHaveLength(T1.blocks.length);
    s.blocks.forEach((b, i) => expect(b.id).toBe(`new:${i}`));
    expect(s.type).toBe('strength');
  });

  it('без истории подходы берут ориентир из шаблона: вес, число подходов; повторы не подставляются', () => {
    const squat = strengthBlocks(sessionFromTemplate(T1, base()).blocks).find((b) => b.items[0]!.exerciseId === 'repdb:squat')!;
    expect(squat.items[0]!.sets).toEqual([
      { weightKg: 85, done: false, load: 'normal' },
      { weightKg: 85, done: false, load: 'normal' },
      { weightKg: 85, done: false, load: 'normal' },
    ]);
  });
  it('прошлый результат важнее ориентира: подходы — копия прошлых (не отмечены выполненными)', () => {
    const s = sessionFromTemplate(T1, base({ sessions: [past({ blocks: [squatSets([87.5, 8], [87.5, 8], [87.5, 7])] })] }));
    const squat = strengthBlocks(s.blocks).find((b) => b.items[0]!.exerciseId === 'repdb:squat')!;
    expect(squat.items[0]!.sets).toEqual([
      { weightKg: 87.5, reps: 8, done: false, load: 'normal' },
      { weightKg: 87.5, reps: 8, done: false, load: 'normal' },
      { weightKg: 87.5, reps: 7, done: false, load: 'normal' },
    ]);
  });
  it('в прошлый раз подходов было меньше — недостающие копируют последний', () => {
    const s = sessionFromTemplate(T1, base({ sessions: [past({ blocks: [squatSets([80, 10], [80, 9])] })] }));
    const squat = strengthBlocks(s.blocks).find((b) => b.items[0]!.exerciseId === 'repdb:squat')!;
    expect(squat.items[0]!.sets.map((x) => `${x.weightKg}×${x.reps}`)).toEqual(['80×10', '80×9', '80×9']);
  });
  it('приложение ничего не прибавляет к прошлому весу', () => {
    const s = sessionFromTemplate(T1, base({ sessions: [past({ blocks: [squatSets([85, 8], [85, 8], [85, 8])] })] }));
    const squat = strengthBlocks(s.blocks).find((b) => b.items[0]!.exerciseId === 'repdb:squat')!;
    expect(new Set(squat.items[0]!.sets.map((x) => x.weightKg))).toEqual(new Set([85]));
  });
  it('внесение задним числом: «прошлое» — до даты тренировки; текущая тренировка не считается', () => {
    const sessions = [past({ id: 'old', date: '2026-10-13', blocks: [squatSets([80, 12])] }), past({ id: 'later', date: '2026-10-25', blocks: [squatSets([90, 5])] })];
    const s = sessionFromTemplate(T1, base({ date: '2026-10-20', sessions }));
    const squat = strengthBlocks(s.blocks).find((b) => b.items[0]!.exerciseId === 'repdb:squat')!;
    expect(squat.items[0]!.sets[0]).toMatchObject({ weightKg: 80, reps: 12 });
    expect(strengthBlocks(sessionFromTemplate(T1, base({ id: 'later', date: '2026-10-27', sessions })).blocks)[0]!.items[0]!.sets[0]).toMatchObject({ weightKg: 80 });
  });

  it('подтягивания Т2: нагрузка «с отягощением», вес +5 кг как ориентир; вес прошлого раза с другой нагрузкой не переносится', () => {
    const pull = (s: SessionDraftLike) => strengthBlocks(s.blocks).find((b) => b.items[0]!.exerciseId === 'repdb:pull-up')!;
    const fresh = pull(sessionFromTemplate(T2, base()));
    expect(fresh.items[0]!.sets[0]).toMatchObject({ weightKg: 5, load: 'added', done: false });
    expect(fresh.items[0]!.note).toMatch(/Нет пояса/);

    const assistedBefore = past({ blocks: [{ type: 'strength', id: 'x', superset: false, items: [{ exerciseId: 'repdb:pull-up', sets: [{ weightKg: 18, reps: 12, done: true, load: 'assisted' }] }] }] });
    const mixed = pull(sessionFromTemplate(T2, base({ sessions: [assistedBefore] })));
    expect(mixed.items[0]!.sets[0]).toMatchObject({ load: 'added', reps: 12 });
    expect(mixed.items[0]!.sets[0]!.weightKg).toBe(undefined);
  });
  it('Т1: выпады «на сторону», суперсет из двух упражнений с круговыми подходами', () => {
    const blocks = strengthBlocks(sessionFromTemplate(T1, base()).blocks);
    const lunge = blocks.find((b) => b.items[0]!.exerciseId === 'repdb:db-lunge')!;
    expect(lunge.items[0]!.sets.every((x) => x.perSide === true)).toBe(true);
    const ss = blocks.find((b) => b.superset)!;
    expect(ss.items.map((i) => i.exerciseId)).toEqual(['repdb:tricep-pushdown', 'repdb:cable-lateral-raise']);
    expect(ss.items.every((i) => i.sets.length === 3)).toBe(true);
    expect(ss.items[1]!.sets[0]!.weightKg).toBe(6.8);
  });
  it('разминка, финиш, мобильность из шаблона — заготовки блоков без значений', () => {
    const s = sessionFromTemplate(T1, base());
    expect(s.blocks[0]).toMatchObject({ type: 'cardio', role: 'warmup', modality: 'treadmill', name: 'Разминка' });
    expect(s.blocks[0]).not.toHaveProperty('durationSec');
    expect(s.blocks.at(-1)).toMatchObject({ type: 'cardio', role: 'finisher' });
    expect(s.blocks.find((b) => b.type === 'mobility')).toMatchObject({ items: [{ exerciseId: 'splav:pelvis-mobility', sets: [] }] });
  });

  it('Т3: комплекс берётся из очереди комплексов; спринты — отдельный блок', () => {
    const c005 = { id: '#005', title: 'AMRAP 15 мин, вес тела', format: 'AMRAP' as const, timeCapMin: 15, description: '6 подтягиваний → …' };
    const s = sessionFromTemplate(T3, base({ nextComplex: c005, queue: { id: QUEUE.id, slot: 2 } }));
    expect(s.blocks.filter((b) => b.type === 'conditioning')).toEqual([
      { type: 'conditioning', id: 'new:1', complexId: '#005', name: 'AMRAP 15 мин, вес тела', format: 'AMRAP', timeCapMin: 15, description: '6 подтягиваний → …', result: {} },
      expect.objectContaining({ id: 'new:2', name: 'Спринты', format: 'INTERVALS', result: {} }),
    ]);
    expect(s.type).toBe('conditioning');
    expect(s.queueSlot).toBe(2);
    expect(valid(s)).toBe(true);
  });
  it('очереди комплексов нет — блок «Комплекс» без номера', () => {
    const k = sessionFromTemplate(T3, base()).blocks.find((b) => b.type === 'conditioning')!;
    expect(k).toMatchObject({ name: 'Комплекс', format: 'AMRAP', result: {} });
    expect(k).not.toHaveProperty('complexId');
  });
  it('все шаблоны дают корректные тренировки', () => {
    for (const t of [T1, T2, T3]) expect(valid(sessionFromTemplate(t, base())), t.title).toBe(true);
  });
});

type SessionDraftLike = ReturnType<typeof sessionFromTemplate>;

describe('пустые заготовки при завершении', () => {
  const cardio = (over: object = {}): Block => ({ type: 'cardio', id: 'c', modality: 'treadmill', role: 'warmup', ...over }) as Block;
  const complex = (over: object = {}): Block => ({ type: 'conditioning', id: 'k', format: 'AMRAP', result: {}, ...over }) as Block;

  it('что считается пустым', () => {
    expect(isEmptyBlock(cardio())).toBe(true);
    expect(isEmptyBlock(cardio({ durationSec: 600 }))).toBe(false);
    expect(isEmptyBlock(cardio({ distanceM: 1000 }))).toBe(false);
    expect(isEmptyBlock(cardio({ notes: 'зона 2' }))).toBe(false);
    expect(isEmptyBlock(complex())).toBe(true);
    expect(isEmptyBlock(complex({ result: { rounds: 9 } }))).toBe(false);
    expect(isEmptyBlock(complex({ rpe: 8 }))).toBe(false);
    expect(isEmptyBlock({ type: 'mobility', id: 'm', items: [{ exerciseId: 'x', sets: [] }] })).toBe(false);
  });
  it('убираются разминка без данных и комплекс без результата; заполненное остаётся', () => {
    const base = sessionFromTemplate(T3, baseOptions({ nextComplex: null }));
    const filled = { ...base, blocks: base.blocks.map((b) => (b.type === 'conditioning' && b.name === 'Спринты' ? { ...b, result: { timeSec: 600 } } : b)) };
    const { session, dropped } = dropEmptyBlocks(filled);
    expect(dropped).toBe(2); // разминка и комплекс
    expect(session.blocks.map((b) => b.type)).toEqual(['conditioning', 'mobility']);
    expect(session.type).toBe('conditioning');
  });
  it('нечего убирать — та же тренировка', () => {
    const s = sessionFromTemplate(T1, base());
    expect(dropEmptyBlocks({ ...s, blocks: [] }).dropped).toBe(0);
  });
});

function baseOptions(over: Partial<FromTemplateOptions> = {}): FromTemplateOptions {
  return { date: '2026-10-27', now: 5_000, id: 'new', sessions: [], queue: { id: QUEUE.id, slot: 0 }, ...over };
}
