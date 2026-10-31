import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { HybridLogDB } from './db.ts';
import { LEGACY_DB_NAME, migrateLegacyDb, renameLegacyIds } from './legacyMigration.ts';

describe('renameLegacyIds', () => {
  it('меняет префикс во вложенных строках и не трогает остальное', () => {
    const value = { id: 'splav:a', blocks: [{ items: [{ exerciseId: 'splav:b' }, { exerciseId: 'repdb:c', note: 'splav' }] }], n: 3 };
    expect(renameLegacyIds(value)).toEqual({
      id: 'hybridlog:a',
      blocks: [{ items: [{ exerciseId: 'hybridlog:b' }, { exerciseId: 'repdb:c', note: 'splav' }] }],
      n: 3,
    });
  });
});

describe('migrateLegacyDb', () => {
  let database: HybridLogDB;
  beforeEach(async () => {
    await Dexie.delete(LEGACY_DB_NAME);
    database = new HybridLogDB(`test-${Math.random()}`);
    await database.open();
  });

  async function seedLegacy(): Promise<void> {
    const legacy = new Dexie(LEGACY_DB_NAME);
    legacy.version(1).stores({ meta: 'key', outbox: 'key', sessions: 'id', exerciseNotes: 'id' });
    await legacy.open();
    await legacy.table('sessions').bulkPut([
      { id: 's1', updatedAt: 10, deletedAt: null, exerciseId: 'splav:core-complex' },
      { id: 's2', updatedAt: 20, deletedAt: null, exerciseId: 'repdb:squat' },
    ]);
    await legacy.table('exerciseNotes').put({ id: 'splav:core-complex', updatedAt: 30, deletedAt: null, text: 'заметка' });
    await legacy.table('outbox').put({ key: 'sessions:s2', collection: 'sessions', id: 's2' });
    await legacy.table('meta').put({ key: 'syncCursor', value: 7 });
    legacy.close();
  }

  it('переносит данные, переписывает id и ставит изменённое в очередь', async () => {
    await seedLegacy();
    expect(await migrateLegacyDb(database, () => 1000)).toBe(true);

    expect(await database.rows('sessions').get('s1')).toMatchObject({ exerciseId: 'hybridlog:core-complex', updatedAt: 1000 });
    expect(await database.rows('sessions').get('s2')).toMatchObject({ exerciseId: 'repdb:squat', updatedAt: 20 });
    expect(await database.rows('exerciseNotes').get('hybridlog:core-complex')).toMatchObject({ text: 'заметка', deletedAt: null });
    expect(await database.rows('exerciseNotes').get('splav:core-complex')).toMatchObject({ deletedAt: 1000 });
    expect((await database.outbox.toArray()).map((r) => r.key).sort()).toEqual([
      'exerciseNotes:hybridlog:core-complex',
      'exerciseNotes:splav:core-complex',
      'sessions:s1',
      'sessions:s2',
    ].sort());
    expect((await database.meta.get('syncCursor'))?.value).toBe(7);
    expect(await Dexie.exists(LEGACY_DB_NAME)).toBe(false);
  });

  it('повторный запуск и отсутствие старой базы ничего не делают', async () => {
    expect(await migrateLegacyDb(database)).toBe(false);
    await seedLegacy();
    await migrateLegacyDb(database, () => 1000);
    expect(await migrateLegacyDb(database, () => 2000)).toBe(false);
    expect(await database.rows('sessions').get('s1')).toMatchObject({ updatedAt: 1000 });
  });
});
