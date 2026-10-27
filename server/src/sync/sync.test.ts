import type { PullResponse, PushResponse, SyncRecord } from '@splav/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, rec, type TestApp } from '../test-helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}, 60_000);
afterAll(async () => {
  await t.close();
});

async function push(sid: string, records: SyncRecord[]): Promise<PushResponse> {
  const res = await t.app.inject({ method: 'POST', url: '/api/sync', cookies: { sid }, payload: { records } });
  expect(res.statusCode).toBe(200);
  return res.json();
}
async function pull(sid: string, since = 0, limit?: number): Promise<PullResponse> {
  const q = `since=${since}${limit ? `&limit=${limit}` : ''}`;
  const res = await t.app.inject({ method: 'GET', url: `/api/sync?${q}`, cookies: { sid } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('доступ', () => {
  it('без сессии GET и POST дают 401', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/sync' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/sync', payload: { records: [] } })).statusCode).toBe(401);
  });

  it('невалидные запросы дают 400', async () => {
    const sid = await t.login('val@example.com');
    const bad = (payload: object) => t.app.inject({ method: 'POST', url: '/api/sync', cookies: { sid }, payload });
    expect((await bad({ records: [{ ...rec('a', 1), collection: 'nope' }] })).statusCode).toBe(400);
    expect((await bad({ records: Array.from({ length: 201 }, (_, i) => rec(`r${i}`, 1)) })).statusCode).toBe(400);
    expect((await bad({})).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'GET', url: '/api/sync?since=-1', cookies: { sid } })).statusCode).toBe(400);
  });
});

describe('push и pull', () => {
  it('записи возвращаются с растущим seq', async () => {
    const sid = await t.login('basic@example.com');
    expect(await push(sid, [rec('a', 10), rec('b', 20)])).toEqual({ applied: 2, stale: [] });
    const got = await pull(sid);
    expect(got.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(got.records[0]!.seq).toBeLessThan(got.records[1]!.seq);
    expect(got.cursor).toBe(got.records[1]!.seq);
    expect(got.hasMore).toBe(false);
    expect(got.records[0]!.data).toMatchObject({ title: 't-a-10' });
  });

  it('пустой pull возвращает прежний курсор', async () => {
    const sid = await t.login('empty@example.com');
    expect(await pull(sid, 0)).toEqual({ records: [], cursor: 0, hasMore: false });
    await push(sid, [rec('a', 1)]);
    const { cursor } = await pull(sid);
    expect(await pull(sid, cursor)).toEqual({ records: [], cursor, hasMore: false });
  });

  it('постраничная выдача: hasMore и курсор', async () => {
    const sid = await t.login('pages@example.com');
    await push(sid, [1, 2, 3, 4, 5].map((n) => rec(`r${n}`, n)));
    const p1 = await pull(sid, 0, 2);
    expect(p1.records).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = await pull(sid, p1.cursor, 2);
    expect(p2.hasMore).toBe(true);
    const p3 = await pull(sid, p2.cursor, 2);
    expect(p3.records).toHaveLength(1);
    expect(p3.hasMore).toBe(false);
    expect([...p1.records, ...p2.records, ...p3.records].map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('изменённая запись снова попадает в pull после курсора', async () => {
    const sid = await t.login('again@example.com');
    await push(sid, [rec('a', 1), rec('b', 1)]);
    const { cursor } = await pull(sid);
    await push(sid, [rec('a', 2)]);
    const next = await pull(sid, cursor);
    expect(next.records.map((r) => r.id)).toEqual(['a']);
    expect(next.records[0]!.updatedAt).toBe(2);
  });

  it('мягкое удаление доезжает до другого устройства', async () => {
    const sid = await t.login('del@example.com');
    await push(sid, [rec('a', 1)]);
    await push(sid, [rec('a', 5, { deletedAt: 5 })]);
    const got = await pull(sid);
    expect(got.records).toHaveLength(1);
    expect(got.records[0]).toMatchObject({ id: 'a', deletedAt: 5, updatedAt: 5 });
  });
});

describe('last-write-wins', () => {
  it('старая версия не затирает новую и попадает в stale', async () => {
    const sid = await t.login('lww@example.com');
    await push(sid, [rec('a', 100)]);
    const res = await push(sid, [rec('a', 50)]);
    expect(res).toEqual({ applied: 0, stale: [{ collection: 'sessions', id: 'a' }] });
    expect((await pull(sid)).records[0]!.updatedAt).toBe(100);
  });

  it('более новая версия заменяет старую', async () => {
    const sid = await t.login('lww2@example.com');
    await push(sid, [rec('a', 100)]);
    expect(await push(sid, [rec('a', 200)])).toEqual({ applied: 1, stale: [] });
    const got = await pull(sid);
    expect(got.records).toHaveLength(1);
    expect(got.records[0]!.data).toMatchObject({ title: 't-a-200' });
  });

  it('повторная отправка той же версии безопасна и seq не двигает', async () => {
    const sid = await t.login('idem@example.com');
    await push(sid, [rec('a', 100)]);
    const before = await pull(sid);
    const res = await push(sid, [rec('a', 100)]);
    expect(res.applied).toBe(0);
    expect(await pull(sid)).toEqual(before);
  });

  it('разные коллекции с одним id не пересекаются', async () => {
    const sid = await t.login('coll@example.com');
    await push(sid, [rec('x', 1), rec('x', 1, { collection: 'templates' })]);
    expect((await pull(sid)).records.map((r) => r.collection).sort()).toEqual(['sessions', 'templates']);
  });
});

describe('изоляция пользователей', () => {
  it('A не видит записи B и не может их перезаписать', async () => {
    const a = await t.login('iso-a@example.com');
    const b = await t.login('iso-b@example.com');
    await push(a, [rec('secret', 10)]);

    expect((await pull(b)).records).toHaveLength(0);

    // B отправляет запись с тем же id и более новым временем: у A ничего не меняется.
    expect(await push(b, [rec('secret', 999)])).toEqual({ applied: 1, stale: [] });
    const aRecords = (await pull(a)).records;
    expect(aRecords).toHaveLength(1);
    expect(aRecords[0]!.updatedAt).toBe(10);
    expect((await pull(b)).records[0]!.updatedAt).toBe(999);
  });

  it('userId из тела запроса игнорируется', async () => {
    const a = await t.login('inj-a@example.com');
    const b = await t.login('inj-b@example.com');
    const meB = (await t.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: b } })).json().user;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/sync',
      cookies: { sid: a },
      payload: { userId: meB.id, records: [{ ...rec('mine', 1), userId: meB.id }] },
    });
    expect(res.statusCode).toBe(200);
    expect((await pull(b)).records).toHaveLength(0);
    expect((await pull(a)).records).toHaveLength(1);
  });

  it('курсоры у пользователей независимы', async () => {
    const a = await t.login('cur-a@example.com');
    const b = await t.login('cur-b@example.com');
    await push(a, [rec('1', 1), rec('2', 1), rec('3', 1)]);
    await push(b, [rec('1', 1)]);
    expect((await pull(b)).cursor).toBe(1);
    expect((await pull(a)).cursor).toBe(3);
  });
});

describe('параллельные push одного пользователя', () => {
  it('не теряют записи, seq уникальны', async () => {
    const sid = await t.login('par@example.com');
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => push(sid, [rec(`p${i}a`, 1), rec(`p${i}b`, 1)])),
    );
    const got = await pull(sid);
    expect(got.records).toHaveLength(12);
    expect(new Set(got.records.map((r) => r.seq)).size).toBe(12);
  });
});
