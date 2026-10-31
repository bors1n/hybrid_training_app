import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseCsvText } from '../domain/csvText.ts';
import { buildImport, type ImportPlan } from '../domain/importCsv.ts';
import { canonicalJson, classifyPlan } from '../domain/importPlan.ts';
import { createMatcher } from '../domain/matching.ts';
import { CATALOG } from '../seed/catalog.ts';
import { deleteRecord, listRecords, saveRecord } from '../sync/records.ts';
import { session } from '../test/fixtures.ts';
import { HybridLogDB } from './db.ts';
import { exportAllJson, exportAllSessionsCsv } from './exportService.ts';
import { applyImport, loadSessions } from './importService.ts';

const TEMPLATE = readFileSync(new URL('../../../docs/import_template.csv', import.meta.url), 'utf8');

let database: HybridLogDB;
beforeEach(async () => {
  database = new HybridLogDB(`import-${Math.random()}`);
  await database.open();
});

/** План импорта по текущему состоянию базы: так его строит экран импорта. */
async function plan(csv: string, resolutions: Record<string, string> = {}): Promise<ImportPlan> {
  const customs = await listRecords('exercises', database);
  const remembered = (await listRecords('exerciseAliases', database)).map((r) => ({ alias: String(r['alias']), exerciseId: String(r['exerciseId']) }));
  const matcher = createMatcher(
    [...CATALOG, ...customs.map((c) => ({ id: c.id, name: String(c['name']), aliases: (c['aliases'] as string[]) ?? [] }))],
    { remembered },
  );
  return buildImport(parseCsvText(csv), { today: '2026-10-27', matcher, resolutions, existing: await loadSessions(database) });
}

describe('canonicalJson и классификация', () => {
  it('порядок ключей и undefined не важны', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: undefined }], c: 'z' } })).toBe(canonicalJson({ a: { c: 'z', d: [1, { y: 2 }] }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe('импорт в базу', () => {
  it('шаблон добавляет 9 тренировок; каждая попадает в очередь синхронизации', async () => {
    const p = await plan(TEMPLATE);
    const res = await applyImport(p, { replaceExisting: false, database });
    expect(res).toMatchObject({ added: 9, replaced: 0, unchanged: 0, keptExisting: 0 });
    expect(await database.rows('sessions').count()).toBe(9);
    expect((await database.outbox.toArray()).filter((o) => o.collection === 'sessions')).toHaveLength(9);
  });

  it('повторный импорт того же файла не создаёт дубликатов и ничего не меняет (критерий приёмки)', async () => {
    await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    const before = await database.rows('sessions').toArray();
    await database.outbox.clear();

    const again = await plan(TEMPLATE);
    expect(again.sessions.every((s) => s.replaces)).toBe(true);
    const res = await applyImport(again, { replaceExisting: true, database });
    expect(res).toMatchObject({ added: 0, replaced: 0, unchanged: 9 });
    expect(await database.rows('sessions').count()).toBe(9);
    // Ни одна запись не тронута: версии те же, очередь отправки пуста
    expect(await database.rows('sessions').toArray()).toEqual(before);
    expect(await database.outbox.count()).toBe(0);
  });

  it('изменённая после импорта тренировка заменяется только с подтверждением', async () => {
    await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    const t1 = (await database.rows('sessions').toArray()).find((s) => s['title'] === 'Тренировка 1')!;
    await saveRecord('sessions', { ...(t1 as unknown as ReturnType<typeof session>), notes: 'правка вручную' }, { database });

    const refused = await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    expect(refused).toMatchObject({ added: 0, replaced: 0, unchanged: 8, keptExisting: 1 });
    expect((await database.rows('sessions').get(t1.id))?.['notes']).toBe('правка вручную');

    const confirmed = await applyImport(await plan(TEMPLATE), { replaceExisting: true, database });
    expect(confirmed).toMatchObject({ replaced: 1, unchanged: 8, keptExisting: 0 });
    expect((await database.rows('sessions').get(t1.id))?.['notes']).toBeUndefined();
    expect(await database.rows('sessions').count()).toBe(9);
  });

  it('тренировка, внесённая вручную с той же датой и названием, заменяется, а не дублируется', async () => {
    await saveRecord('sessions', session('my-uuid', { date: '2026-10-20', title: 'Тренировка 1' }), { database });
    const p = await plan(TEMPLATE);
    expect(p.sessions.find((s) => s.draft.title === 'Тренировка 1')!.id).toBe('my-uuid');
    const res = await applyImport(p, { replaceExisting: true, database });
    expect(res).toMatchObject({ added: 8, replaced: 1 });
    expect(await database.rows('sessions').count()).toBe(9);
    expect((await database.rows('sessions').get('my-uuid'))?.['blocks']).toHaveLength(5);
  });

  it('удалённая ранее тренировка при повторном импорте возвращается', async () => {
    await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    const bug = (await database.rows('sessions').toArray()).find((s) => s['title'] === 'Бег' && s['date'] === '2026-05-29')!;
    await deleteRecord('sessions', bug.id, { database });
    expect(await database.rows('sessions').get(bug.id)).toMatchObject({ deletedAt: expect.any(Number) });

    const res = await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    expect(res).toMatchObject({ added: 1, unchanged: 8 });
    expect((await database.rows('sessions').get(bug.id))?.deletedAt).toBeNull();
  });

  it('новые упражнения создаются один раз и дальше находятся; сопоставления запоминаются', async () => {
    const csv = `${TEMPLATE.split(/\r?\n/)[0]}\n20.10.2026,Т,,,set,1,Фермерская прогулка 2×24,,1,24,,40,,,,,,,,,,,,,,,,,\n21.10.2026,Т2,,,set,1,Мой присед,,1,60,,5,,,,,,,,,,,,,,,,,`;
    const p1 = await plan(csv);
    expect(p1.newExercises.map((e) => e.name)).toEqual(['Фермерская прогулка 2×24', 'Мой присед']);

    const resolved = await plan(csv, { 'мой присед': CATALOG.find((e) => e.name === 'Кор-комплекс')!.id });
    expect(resolved.newExercises.map((e) => e.name)).toEqual(['Фермерская прогулка 2×24']);
    const res = await applyImport(resolved, { replaceExisting: false, manualMatches: [{ name: 'Мой присед', exerciseId: 'hybridlog:core-complex' }], database });
    expect(res.exercisesCreated).toBe(1);
    const custom = await listRecords('exercises', database);
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ name: 'Фермерская прогулка 2×24', isCustom: true });

    // Повторный импорт: ничего нового, «Мой присед» находится по запомненному сопоставлению
    const p2 = await plan(csv);
    expect(p2.newExercises).toEqual([]);
    const again = await applyImport(p2, { replaceExisting: false, database });
    expect(again).toMatchObject({ added: 0, unchanged: 2, exercisesCreated: 0 });
    expect(await listRecords('exercises', database)).toHaveLength(1);
  });

  it('импорт с ошибками записывает только корректные строки', async () => {
    const csv = `${TEMPLATE.split(/\r?\n/)[0]}\n31.02.2026,Плохая,,,set,1,Присед со штангой,,1,85,,8,,,,,,,,,,,,,,,,,\n20.10.2026,Хорошая,,,set,1,Присед со штангой,,1,85,,8,,,,,,,,,,,,,,,,,`;
    const p = await plan(csv);
    expect(p.issues.filter((i) => i.severity === 'error')).toHaveLength(1);
    await applyImport(p, { replaceExisting: false, database });
    expect((await database.rows('sessions').toArray()).map((s) => s['title'])).toEqual(['Хорошая']);
  });
});

describe('экспорт', () => {
  it('экспорт → импорт в пустую базу даёт те же тренировки (критерий приёмки)', async () => {
    await applyImport(await plan(TEMPLATE), { replaceExisting: false, database });
    const customs = await listRecords('exercises', database);
    const original = Object.fromEntries((await loadSessions(database)).map((s) => [s.id, canonicalJson({ ...s, updatedAt: 0 })]));

    const exported = await exportAllSessionsCsv(database);
    expect(exported).toMatchObject({ sessions: 9, rows: 19 });
    expect(exported.warnings).toEqual([]);

    // Новая база: свои упражнения (если были) восстанавливаем из экспорта, остальное — из файла
    const fresh = new HybridLogDB(`import-fresh-${Math.random()}`);
    await fresh.open();
    const matcher = createMatcher([...CATALOG, ...customs.map((c) => ({ id: c.id, name: String(c['name']) }))]);
    const back = buildImport(parseCsvText(exported.csv), { today: '2026-10-27', matcher });
    expect(back.issues).toEqual([]);
    expect(back.newExercises).toEqual([]);
    await applyImport(back, { replaceExisting: false, database: fresh });
    const restored = Object.fromEntries((await loadSessions(fresh)).map((s) => [s.id, canonicalJson({ ...s, updatedAt: 0 })]));
    expect(restored).toEqual(original);
  });

  it('JSON: все коллекции, без удалённых записей, версия и время', async () => {
    await saveRecord('sessions', session('a'), { database });
    await saveRecord('sessions', session('b'), { database });
    await deleteRecord('sessions', 'b', { database });
    await saveRecord('exerciseNotes', { id: 'hybridlog:core-complex', exerciseId: 'hybridlog:core-complex', text: 'заметка' }, { database });

    const { json, counts } = await exportAllJson(database, new Date('2026-10-27T12:00:00Z'));
    const data = JSON.parse(json);
    expect(data).toMatchObject({ app: 'HybridLog', version: 1, exportedAt: '2026-10-27T12:00:00.000Z' });
    expect(Object.keys(data.collections).sort()).toEqual(['complexQueue', 'complexes', 'exerciseAliases', 'exerciseNotes', 'exercises', 'programs', 'queues', 'sessions', 'settings', 'templates']);
    expect(data.collections.sessions.map((s: { id: string }) => s.id)).toEqual(['a']);
    expect(counts).toMatchObject({ sessions: 1, exerciseNotes: 1, templates: 0 });
  });
});
