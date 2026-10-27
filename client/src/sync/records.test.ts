import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRecord } from '@splav/shared';
import { SplavDB } from '../data/db.ts';
import { applyRemote, deleteRecord, listRecords, onLocalWrite, saveRecord } from './records.ts';
import { session, template } from '../test/fixtures.ts';

let database: SplavDB;
beforeEach(async () => {
  database = new SplavDB(`test-${Math.random()}`);
  await database.open();
});

const remote = (id: string, updatedAt: number, extra: Partial<PullRecord> = {}): PullRecord => ({
  collection: 'sessions',
  id,
  updatedAt,
  deletedAt: null,
  data: { id, title: `remote-${updatedAt}` },
  seq: 1,
  ...extra,
});

describe('saveRecord', () => {
  it('пишет запись и ставит её в очередь', async () => {
    const row = await saveRecord('sessions', session('s1', { title: 'Т1' }), { database, now: () => 1000 });
    expect(row).toMatchObject({ id: 's1', title: 'Т1', updatedAt: 1000, deletedAt: null });
    expect(await database.rows('sessions').get('s1')).toEqual(row);
    expect(await database.outbox.toArray()).toEqual([{ key: 'sessions:s1', collection: 'sessions', id: 's1' }]);
  });

  it('повторные правки одной записи занимают одну строку очереди', async () => {
    for (let i = 0; i < 5; i++) await saveRecord('sessions', session('s1', { title: `v${i}` }), { database });
    expect(await database.outbox.count()).toBe(1);
    expect((await database.rows('sessions').get('s1'))?.['title']).toBe('v4');
  });

  it('updatedAt строго растёт, даже если часы стоят на месте', async () => {
    const a = await saveRecord('sessions', session('s1'), { database, now: () => 500 });
    const b = await saveRecord('sessions', session('s1'), { database, now: () => 500 });
    const c = await saveRecord('sessions', session('s1'), { database, now: () => 100 });
    expect([a.updatedAt, b.updatedAt, c.updatedAt]).toEqual([500, 501, 502]);
  });

  it('уведомляет подписчиков о локальной записи', async () => {
    const listener = vi.fn();
    const off = onLocalWrite(listener);
    await saveRecord('sessions', session('s1'), { database });
    off();
    await saveRecord('sessions', session('s2'), { database });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('deleteRecord', () => {
  it('помечает запись удалённой и ставит в очередь', async () => {
    await saveRecord('sessions', session('s1'), { database, now: () => 100 });
    await database.outbox.clear();
    await deleteRecord('sessions', 's1', { database, now: () => 200 });
    const row = await database.rows('sessions').get('s1');
    expect(row).toMatchObject({ updatedAt: 200, deletedAt: 200 });
    expect(await database.outbox.count()).toBe(1);
    expect(await listRecords('sessions', database)).toEqual([]);
  });

  it('удаление несуществующей записи ничего не делает', async () => {
    await deleteRecord('sessions', 'нет', { database });
    expect(await database.outbox.count()).toBe(0);
  });
});

describe('applyRemote', () => {
  it('добавляет новую запись без очереди', async () => {
    expect(await applyRemote([remote('a', 10)], database)).toBe(1);
    expect(await database.rows('sessions').get('a')).toMatchObject({ id: 'a', title: 'remote-10', updatedAt: 10, deletedAt: null });
    expect(await database.outbox.count()).toBe(0);
  });

  it('новая серверная версия заменяет старую локальную и снимает её с очереди', async () => {
    await saveRecord('sessions', session('a', { title: 'local' }), { database, now: () => 5 });
    expect(await applyRemote([remote('a', 10)], database)).toBe(1);
    expect((await database.rows('sessions').get('a'))?.['title']).toBe('remote-10');
    expect(await database.outbox.count()).toBe(0);
  });

  it('локальная версия новее или равна — остаётся и ждёт отправки', async () => {
    await saveRecord('sessions', session('a', { title: 'local' }), { database, now: () => 50 });
    expect(await applyRemote([remote('a', 10), remote('a', 50)], database)).toBe(0);
    expect((await database.rows('sessions').get('a'))?.['title']).toBe('local');
    expect(await database.outbox.count()).toBe(1);
  });

  it('удаление с сервера скрывает запись', async () => {
    await applyRemote([remote('a', 10)], database);
    await applyRemote([remote('a', 20, { deletedAt: 20 })], database);
    expect(await listRecords('sessions', database)).toEqual([]);
  });
});
