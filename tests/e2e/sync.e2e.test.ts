import { PullResponseSchema, PushResponseSchema, type SyncRecord } from '@splav/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SplavDB } from '../../client/src/data/db.ts';
import { AuthError, NetworkError, syncOnce, type Transport } from '../../client/src/sync/engine.ts';
import { deleteRecord, listRecords, saveRecord } from '../../client/src/sync/records.ts';
import { createTestApp, type TestApp } from '../../server/src/test-helpers.ts';

/** Транспорт клиента поверх настоящего сервера (без сети: fastify.inject). */
function serverTransport(app: FastifyInstance, sid: string, online = { value: true }): Transport {
  const call = async (method: 'GET' | 'POST', url: string, payload?: object) => {
    if (!online.value) throw new NetworkError('нет сети');
    const res = await app.inject({ method, url, cookies: { sid }, ...(payload ? { payload } : {}) });
    if (res.statusCode === 401) throw new AuthError('вход');
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${res.body}`);
    return res.json();
  };
  return {
    push: async (records: SyncRecord[]) => PushResponseSchema.parse(await call('POST', '/api/sync', { records })),
    pull: async (since, limit) => PullResponseSchema.parse(await call('GET', `/api/sync?since=${since}&limit=${limit}`)),
  };
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}, 60_000);
afterAll(async () => {
  await t.close();
});

async function device(): Promise<SplavDB> {
  const d = new SplavDB(`device-${Math.random()}`);
  await d.open();
  return d;
}

describe('два устройства одного аккаунта', () => {
  it('тренировка, внесённая без сети, появляется на втором устройстве после связи', async () => {
    const sid = await t.login('e2e-offline@example.com');
    const online = { value: false };
    const phone = await device();
    const laptop = await device();
    const phoneNet = serverTransport(t.app, sid, online);
    const laptopNet = serverTransport(t.app, sid);

    // iPhone без сети: запись остаётся в очереди.
    await saveRecord('sessions', { id: 's1', title: 'Тренировка 1', date: '2026-10-20' }, { database: phone });
    await expect(syncOnce(phoneNet, phone)).rejects.toBeInstanceOf(NetworkError);
    expect(await phone.outbox.count()).toBe(1);
    await syncOnce(laptopNet, laptop);
    expect(await listRecords('sessions', laptop)).toHaveLength(0);

    // Связь появилась.
    online.value = true;
    await syncOnce(phoneNet, phone);
    expect(await phone.outbox.count()).toBe(0);

    await syncOnce(laptopNet, laptop);
    const onLaptop = await listRecords('sessions', laptop);
    expect(onLaptop).toHaveLength(1);
    expect(onLaptop[0]).toMatchObject({ id: 's1', title: 'Тренировка 1', date: '2026-10-20' });
  });

  it('правка на втором устройстве возвращается на первое', async () => {
    const sid = await t.login('e2e-edit@example.com');
    const a = await device();
    const b = await device();
    const [na, nb] = [serverTransport(t.app, sid), serverTransport(t.app, sid)];

    await saveRecord('sessions', { id: 's1', title: 'до' }, { database: a });
    await syncOnce(na, a);
    await syncOnce(nb, b);
    await saveRecord('sessions', { id: 's1', title: 'после' }, { database: b });
    await syncOnce(nb, b);
    await syncOnce(na, a);
    expect((await listRecords('sessions', a))[0]).toMatchObject({ title: 'после' });
  });

  it('конфликт: побеждает более поздняя правка на обоих устройствах', async () => {
    const sid = await t.login('e2e-conflict@example.com');
    const a = await device();
    const b = await device();
    const [na, nb] = [serverTransport(t.app, sid), serverTransport(t.app, sid)];

    await saveRecord('sessions', { id: 's1', title: 'исходная' }, { database: a, now: () => 1000 });
    await syncOnce(na, a);
    await syncOnce(nb, b);

    // Оба правят офлайн; на B правка позже.
    await saveRecord('sessions', { id: 's1', title: 'правка A' }, { database: a, now: () => 2000 });
    await saveRecord('sessions', { id: 's1', title: 'правка B' }, { database: b, now: () => 3000 });

    // Раньше на сервер приходит более старая правка A, затем B.
    await syncOnce(na, a);
    await syncOnce(nb, b);
    await syncOnce(na, a);

    expect((await listRecords('sessions', a))[0]).toMatchObject({ title: 'правка B' });
    expect((await listRecords('sessions', b))[0]).toMatchObject({ title: 'правка B' });
  });

  it('конфликт: поздняя правка, пришедшая на сервер первой, не затирается старой', async () => {
    const sid = await t.login('e2e-conflict2@example.com');
    const a = await device();
    const b = await device();
    const [na, nb] = [serverTransport(t.app, sid), serverTransport(t.app, sid)];

    await saveRecord('sessions', { id: 's1', title: 'исходная' }, { database: a, now: () => 1000 });
    await syncOnce(na, a);
    await syncOnce(nb, b);
    await saveRecord('sessions', { id: 's1', title: 'позже' }, { database: b, now: () => 5000 });
    await saveRecord('sessions', { id: 's1', title: 'раньше' }, { database: a, now: () => 4000 });

    await syncOnce(nb, b);
    await syncOnce(na, a); // A отправляет более старую правку: сервер её отклоняет, A получает версию B.
    expect((await listRecords('sessions', a))[0]).toMatchObject({ title: 'позже' });
    expect(await a.outbox.count()).toBe(0);
  });

  it('удаление доезжает до другого устройства', async () => {
    const sid = await t.login('e2e-delete@example.com');
    const a = await device();
    const b = await device();
    const [na, nb] = [serverTransport(t.app, sid), serverTransport(t.app, sid)];

    await saveRecord('sessions', { id: 's1' }, { database: a });
    await syncOnce(na, a);
    await syncOnce(nb, b);
    expect(await listRecords('sessions', b)).toHaveLength(1);

    await deleteRecord('sessions', 's1', { database: a });
    await syncOnce(na, a);
    await syncOnce(nb, b);
    expect(await listRecords('sessions', b)).toHaveLength(0);
  });

  it('большой объём (450 записей) переезжает целиком', async () => {
    const sid = await t.login('e2e-bulk@example.com');
    const a = await device();
    const b = await device();
    for (let i = 0; i < 450; i++) await saveRecord('sessions', { id: `r${i}`, n: i }, { database: a });
    await syncOnce(serverTransport(t.app, sid), a);
    const res = await syncOnce(serverTransport(t.app, sid), b);
    expect(res.pulled).toBe(450);
    expect(await b.rows('sessions').count()).toBe(450);
  }, 60_000);
});

describe('безопасность', () => {
  it('чужие данные недоступны по API', async () => {
    const mine = await t.login('e2e-owner@example.com');
    const other = await t.login('e2e-other@example.com');
    const a = await device();
    const intruder = await device();
    await saveRecord('sessions', { id: 'private', title: 'личное' }, { database: a });
    await syncOnce(serverTransport(t.app, mine), a);

    await syncOnce(serverTransport(t.app, other), intruder);
    expect(await intruder.rows('sessions').count()).toBe(0);
  });

  it('истёкшая сессия: очередь сохраняется, после повторного входа уходит', async () => {
    const email = 'e2e-expired@example.com';
    const sid = await t.login(email);
    const d = await device();
    await saveRecord('sessions', { id: 's1' }, { database: d });

    t.clock.t += 91 * 24 * 60 * 60 * 1000;
    await expect(syncOnce(serverTransport(t.app, sid), d)).rejects.toBeInstanceOf(AuthError);
    expect(await d.outbox.count()).toBe(1);

    const fresh = await t.login(email);
    await syncOnce(serverTransport(t.app, fresh), d);
    expect(await d.outbox.count()).toBe(0);
  });
});
