import { beforeEach, describe, expect, it } from 'vitest';
import { activeProgram } from '../domain/programs.ts';
import { ensureSeed } from '../seed/install.ts';
import { listRecords } from '../sync/records.ts';
import { HybridLogDB } from './db.ts';
import { addComplexToProgram, createOwnComplex, createProgram, deleteProgram, removeComplexFromProgram, setActiveProgram, updateProgram } from './programService.ts';

let database: HybridLogDB;
beforeEach(async () => {
  database = new HybridLogDB(`prg-${Math.random()}`);
  await database.open();
  await ensureSeed(database);
});

const programs = async () => (await listRecords('programs', database)) as unknown as { id: string; title: string; queueId: string; complexQueueId: string; description?: string }[];

describe('программы', () => {
  it('seed создаёт «Базовую программу» на seed-очередях', async () => {
    const list = await programs();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'seed:program:basic', title: 'Базовая программа', queueId: 'seed:queue:cycle', complexQueueId: 'seed:complexQueue:main' });
  });

  it('новая программа — пустая, со своими очередями; всё идёт в outbox', async () => {
    const id = await createProgram('  Силовая  ', database);
    const p = (await programs()).find((x) => x.id === id)!;
    expect(p.title).toBe('Силовая');
    expect((await database.rows('queues').get(p.queueId))!['templateIds']).toEqual([]);
    expect((await database.rows('complexQueue').get(p.complexQueueId))!['order']).toEqual([]);
    expect(await database.outbox.get(`programs:${id}`)).toBeTruthy();
  });

  it('активная программа: по умолчанию базовая; выбор сохраняется в настройках', async () => {
    const id = await createProgram('Своя', database);
    expect(activeProgram(await programs(), null)?.id).toBe('seed:program:basic');
    await setActiveProgram(id, database);
    await setActiveProgram(id, database);
    const settings = (await listRecords('settings', database)) as unknown as { id: string; activeProgramId: string }[];
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({ id: 'settings', activeProgramId: id });
    expect(activeProgram(await programs(), settings[0]!)?.id).toBe(id);
  });

  it('правка названия и описания; удаление убирает программу и её очереди, активной становится базовая', async () => {
    const id = await createProgram('Своя', database);
    await updateProgram(id, { title: 'Бег и сила', description: ' Осень ' }, database);
    expect((await programs()).find((x) => x.id === id)).toMatchObject({ title: 'Бег и сила', description: 'Осень' });
    await setActiveProgram(id, database);
    const p = (await programs()).find((x) => x.id === id)!;
    await deleteProgram(id, database);
    expect((await programs()).map((x) => x.id)).toEqual(['seed:program:basic']);
    expect(await database.rows('queues').get(p.queueId)).toMatchObject({ deletedAt: expect.any(Number) });
    const settings = (await listRecords('settings', database))[0] as never;
    expect(activeProgram(await programs(), settings)?.id).toBe('seed:program:basic');
  });

  it('комплексы программы: добавить без дублей, убрать; свой комплекс сразу попадает в программу', async () => {
    const id = await createProgram('Своя', database);
    const { complexQueueId } = (await programs()).find((x) => x.id === id)!;
    await addComplexToProgram(complexQueueId, '#004', database);
    await addComplexToProgram(complexQueueId, '#004', database);
    const own = await createOwnComplex({ title: ' Мой ', format: 'AMRAP', description: '5 подтягиваний', timeCapMin: 10 }, complexQueueId, database);
    expect(own.startsWith('own:')).toBe(true);
    expect(await database.rows('complexes').get(own)).toMatchObject({ title: 'Мой', format: 'AMRAP', timeCapMin: 10 });
    expect((await database.rows('complexQueue').get(complexQueueId))!['order']).toEqual(['#004', own]);
    await removeComplexFromProgram(complexQueueId, '#004', database);
    expect((await database.rows('complexQueue').get(complexQueueId))!['order']).toEqual([own]);
  });
});
