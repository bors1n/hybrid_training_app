import { readFileSync } from 'node:fs';
import { PullResponseSchema, PushResponseSchema, type SyncRecord } from '@splav/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SplavDB, getMeta } from '../../client/src/data/db.ts';
import { applyImport, loadSessions } from '../../client/src/data/importService.ts';
import { parseCsvText } from '../../client/src/domain/csvText.ts';
import { buildImport } from '../../client/src/domain/importCsv.ts';
import { createMatcher } from '../../client/src/domain/matching.ts';
import { CATALOG } from '../../client/src/seed/catalog.ts';
import { AuthError, NetworkError, REJECTED_KEY, syncOnce, type Transport } from '../../client/src/sync/engine.ts';
import { createTestApp, type TestApp } from '../../server/src/test-helpers.ts';

const TEMPLATE = readFileSync(new URL('../../docs/import_template.csv', import.meta.url), 'utf8');

function serverTransport(app: FastifyInstance, sid: string): Transport {
  const call = async (method: 'GET' | 'POST', url: string, payload?: object) => {
    const res = await app.inject({ method, url, cookies: { sid }, ...(payload ? { payload } : {}) });
    if (res.statusCode === 401) throw new AuthError('вход');
    if (res.statusCode >= 500) throw new NetworkError('сервер');
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

const device = async (): Promise<SplavDB> => {
  const d = new SplavDB(`import-${Math.random()}`);
  await d.open();
  return d;
};

async function importTemplate(database: SplavDB, replaceExisting = false) {
  const plan = buildImport(parseCsvText(TEMPLATE), {
    today: '2026-10-27',
    matcher: createMatcher(CATALOG),
    existing: await loadSessions(database),
  });
  return applyImport(plan, { replaceExisting, database });
}

describe('импорт и сервер', () => {
  it('импортированные тренировки принимаются сервером без отклонений и доезжают до второго устройства', async () => {
    const sid = await t.login('import@example.com');
    const [phone, laptop] = [await device(), await device()];
    const net = serverTransport(t.app, sid);

    expect(await importTemplate(phone)).toMatchObject({ added: 9 });
    await syncOnce(net, phone);
    expect(await getMeta(REJECTED_KEY, phone)).toBeUndefined();
    expect(await phone.outbox.count()).toBe(0);

    await syncOnce(net, laptop);
    expect((await loadSessions(laptop)).map((s) => s.title).sort()).toEqual(
      ['Бег', 'Бег', 'Push day', 'Pull day', 'Pull day', 'Pull day', 'Тренировка 1', 'Тренировка 2', 'Тренировка 3'].sort(),
    );
  });

  it('тот же файл, импортированный на втором устройстве, дубликатов не даёт: тренировки сходятся по id', async () => {
    const sid = await t.login('import2@example.com');
    const [a, b] = [await device(), await device()];
    const net = serverTransport(t.app, sid);

    await importTemplate(a);
    await syncOnce(net, a);
    // Второе устройство импортирует файл, не дожидаясь синхронизации
    await importTemplate(b);
    await syncOnce(net, b);
    await syncOnce(net, a);

    for (const d of [a, b]) expect(await loadSessions(d)).toHaveLength(9);
    // Повторный импорт на синхронизированном устройстве ничего не меняет
    await database_is_unchanged(a);
  });
});

async function database_is_unchanged(d: SplavDB): Promise<void> {
  await d.outbox.clear();
  const again = await importTemplate(d, true);
  expect(again).toMatchObject({ added: 0, replaced: 0, unchanged: 9 });
  expect(await d.outbox.count()).toBe(0);
}
