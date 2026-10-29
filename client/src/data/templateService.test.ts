import { SessionRecordSchema } from '@splav/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { queueState } from '../domain/queue.ts';
import { QUEUE, TEMPLATES } from '../seed/templates.ts';
import { ensureSeed, COMPLEX_QUEUE_ID } from '../seed/install.ts';
import { deleteRecord, listRecords, saveRecord } from '../sync/records.ts';
import { session } from '../test/fixtures.ts';
import { SplavDB } from './db.ts';
import { loadSessions } from './importService.ts';
import { createTemplate, deleteTemplate, startTemplateWorkout } from './templateService.ts';

let database: SplavDB;
beforeEach(async () => {
  database = new SplavDB(`tpl-${Math.random()}`);
  await database.open();
  await ensureSeed(database);
});

const T1 = 'seed:template:t1';
const T2 = 'seed:template:t2';
const T3 = 'seed:template:t3';

async function queueRow() {
  const q = (await listRecords('queues', database))[0]!;
  return { id: q.id, templateIds: q['templateIds'] as string[], override: q['override'] as never };
}
async function stateNow() {
  return queueState(await queueRow(), await loadSessions(database))!;
}
/** Завершить тренировку так, как это делает экран: проставить finishedAt. */
async function finish(id: string, at: number) {
  const row = (await database.rows('sessions').get(id))!;
  await saveRecord('sessions', { ...row, finishedAt: at } as never, { database });
}

describe('запуск тренировки из шаблона', () => {
  it('тренировка из очереди: шаблон, очередь и слот; не завершена; корректна по схеме', async () => {
    const id = await startTemplateWorkout(T2, { now: new Date(2026, 9, 27, 9, 0).getTime(), database });
    const row = (await database.rows('sessions').get(id))!;
    expect(SessionRecordSchema.safeParse(row).success).toBe(true);
    expect(row).toMatchObject({ title: 'Тренировка 2', templateId: T2, queueId: QUEUE.id, queueSlot: 1, date: '2026-10-27', deletedAt: null });
    expect(row['finishedAt']).toBeUndefined();
    expect(await database.outbox.get(`sessions:${id}`)).toBeTruthy();
  });

  it('завершение Т1 делает следующей Т2; свободная тренировка и пробежка очередь не сдвигают (критерий приёмки)', async () => {
    expect((await stateNow()).templateId).toBe(T1);

    const first = await startTemplateWorkout(T1, { database });
    expect((await stateNow()).templateId).toBe(T1); // не завершена — очередь на месте
    await finish(first, 10_000);
    expect(await stateNow()).toMatchObject({ templateId: T2, cycle: 1 });

    // Свободная тренировка и пробежка
    await saveRecord('sessions', session('free', { title: 'Свободная', finishedAt: 20_000 }), { database });
    await saveRecord('sessions', session('run', { title: 'Бег', type: 'cardio', finishedAt: 21_000, blocks: [{ type: 'cardio', id: 'c', modality: 'run', role: 'main', distanceM: 3000, durationSec: 1500 }] }), { database });
    expect((await stateNow()).templateId).toBe(T2);

    // Шаблон, не стоящий в очереди, тоже очередь не двигает
    await saveRecord('templates', { id: 'outside', title: 'Вне очереди', blocks: [] }, { database });
    const out = await startTemplateWorkout('outside', { database });
    expect((await database.rows('sessions').get(out))).not.toHaveProperty('queueId');
    await finish(out, 30_000);
    expect((await stateNow()).templateId).toBe(T2);

    await finish(await startTemplateWorkout(T2, { database }), 40_000);
    await finish(await startTemplateWorkout(T3, { database }), 50_000);
    expect(await stateNow()).toMatchObject({ templateId: T1, cycle: 2 });
  });

  it('можно начать шаблон не по порядку: следующий считается от него', async () => {
    await finish(await startTemplateWorkout(T3, { database }), 10_000);
    expect(await stateNow()).toMatchObject({ templateId: T1, cycle: 2 });
  });

  it('прошлый результат подставляется в подходы', async () => {
    await saveRecord('sessions', session('old', {
      date: '2026-10-20', finishedAt: 5,
      blocks: [{ type: 'strength', id: 'b', superset: false, items: [{ exerciseId: 'repdb:squat', sets: [{ weightKg: 92.5, reps: 7, done: true, load: 'normal' }] }] }],
    }), { database });
    const id = await startTemplateWorkout(T1, { now: new Date(2026, 9, 27).getTime(), database });
    const blocks = (await database.rows('sessions').get(id))!['blocks'] as { type: string; items?: { exerciseId: string; sets: { weightKg?: number; reps?: number; done: boolean }[] }[] }[];
    const squat = blocks.find((b) => b.type === 'strength' && b.items![0]!.exerciseId === 'repdb:squat')!;
    expect(squat.items![0]!.sets[0]).toMatchObject({ weightKg: 92.5, reps: 7, done: false });
  });

  it('Т3 берёт следующий комплекс из очереди комплексов; после его выполнения — следующий', async () => {
    const first = await startTemplateWorkout(T3, { database });
    const k = ((await database.rows('sessions').get(first))!['blocks'] as { type: string; complexId?: string; name?: string }[]).filter((b) => b.type === 'conditioning')[0]!;
    expect(k).toMatchObject({ complexId: '#001', name: 'EMOM, каждые 2,5 мин, 6–8 раундов' });

    // Выполнили #001 в завершённой тренировке
    const row = (await database.rows('sessions').get(first))!;
    const blocks = (row['blocks'] as { type: string; result?: object }[]).map((b) => (b.type === 'conditioning' && 'complexId' in b ? { ...b, result: { rounds: 7 } } : b));
    await saveRecord('sessions', { ...row, blocks, finishedAt: 9_000 } as never, { database });
    const second = await startTemplateWorkout(T3, { database });
    const k2 = ((await database.rows('sessions').get(second))!['blocks'] as { type: string; complexId?: string }[]).find((b) => b.type === 'conditioning')!;
    expect(k2.complexId).toBe('#002');
  });

  it('несуществующий или удалённый шаблон — понятная ошибка', async () => {
    await expect(startTemplateWorkout('нет', { database })).rejects.toThrow(/Шаблон не найден/);
    await saveRecord('templates', { id: 'tmp', title: 'Временный', blocks: [] }, { database });
    await deleteRecord('templates', 'tmp', { database });
    await expect(startTemplateWorkout('tmp', { database })).rejects.toThrow(/Шаблон не найден/);
  });
});

describe('шаблоны: создание и удаление', () => {
  it('новый шаблон — пустой, вне очереди', async () => {
    const id = await createTemplate(database);
    expect(await database.rows('templates').get(id)).toMatchObject({ title: 'Новый шаблон', blocks: [], deletedAt: null });
    expect((await queueRow()).templateIds).not.toContain(id);
  });

  it('удаление шаблона из очереди убирает его из очереди; сделанные тренировки остаются', async () => {
    const done = await startTemplateWorkout(T2, { database });
    await finish(done, 5_000);
    expect(await deleteTemplate(T2, database)).toEqual({ ok: true });
    expect((await queueRow()).templateIds).toEqual([T1, T3]);
    expect((await database.rows('templates').get(T2))?.deletedAt).not.toBeNull();
    expect((await loadSessions(database)).map((s) => s.id)).toContain(done);
  });

  it('единственный шаблон очереди удалить нельзя', async () => {
    await deleteTemplate(T2, database);
    await deleteTemplate(T3, database);
    const r = await deleteTemplate(T1, database);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? '' : r.reason).toMatch(/единственный шаблон в очереди/);
    expect((await database.rows('templates').get(T1))?.deletedAt).toBeNull();
  });

  it('шаблон вне очереди удаляется без побочных эффектов', async () => {
    const id = await createTemplate(database);
    expect(await deleteTemplate(id, database)).toEqual({ ok: true });
    expect((await queueRow()).templateIds).toEqual([T1, T2, T3]);
  });

  it('очередь комплексов существует после seed', async () => {
    expect((await database.rows('complexQueue').get(COMPLEX_QUEUE_ID))).toBeTruthy();
  });
});
