import { beforeEach, describe, expect, it } from 'vitest';
import type { PullResponse, PushResponse, SyncRecord } from '@splav/shared';
import { getMeta, SplavDB } from '../data/db.ts';
import { AuthError, CURSOR_KEY, NetworkError, syncOnce, type Transport } from './engine.ts';
import { saveRecord } from './records.ts';
import { session, template } from '../test/fixtures.ts';

let database: SplavDB;
beforeEach(async () => {
  database = new SplavDB(`test-${Math.random()}`);
  await database.open();
});

function fakeTransport(over: Partial<Transport> = {}): Transport & { pushed: SyncRecord[][]; pulls: number[] } {
  const pushed: SyncRecord[][] = [];
  const pulls: number[] = [];
  return {
    pushed,
    pulls,
    push: async (records): Promise<PushResponse> => {
      pushed.push(records);
      return { applied: records.length, stale: [], rejected: [] };
    },
    pull: async (since): Promise<PullResponse> => {
      pulls.push(since);
      return { records: [], cursor: since, hasMore: false };
    },
    ...over,
  };
}

describe('syncOnce: отправка', () => {
  it('отправляет очередь целиком записями и очищает её', async () => {
    await saveRecord('sessions', session('a', { title: 'A' }), { database });
    await saveRecord('templates', template('b'), { database });
    const t = fakeTransport();
    expect(await syncOnce(t, database)).toEqual({ pushed: 2, pulled: 0 });
    expect(t.pushed).toHaveLength(1);
    expect(t.pushed[0]!.map((r) => `${r.collection}:${r.id}`).sort()).toEqual(['sessions:a', 'templates:b']);
    expect(t.pushed[0]![0]!.data).toMatchObject({ id: expect.any(String) });
    expect(await database.outbox.count()).toBe(0);
  });

  it('без сети очередь сохраняется и уходит при следующей попытке', async () => {
    await saveRecord('sessions', session('a'), { database });
    const down = fakeTransport({
      push: async () => {
        throw new NetworkError('нет сети');
      },
    });
    await expect(syncOnce(down, database)).rejects.toBeInstanceOf(NetworkError);
    expect(await database.outbox.count()).toBe(1);

    const up = fakeTransport();
    await syncOnce(up, database);
    expect(up.pushed[0]).toHaveLength(1);
    expect(await database.outbox.count()).toBe(0);
  });

  it('при 401 очередь не теряется', async () => {
    await saveRecord('sessions', session('a'), { database });
    const t = fakeTransport({
      push: async () => {
        throw new AuthError('вход');
      },
    });
    await expect(syncOnce(t, database)).rejects.toBeInstanceOf(AuthError);
    expect(await database.outbox.count()).toBe(1);
  });

  it('правка во время отправки не теряется и уходит следующей пачкой', async () => {
    await saveRecord('sessions', session('a', { title: 'v1' }), { database, now: () => 100 });
    const sentTitles: unknown[] = [];
    let edited = false;
    const t = fakeTransport({
      push: async (records) => {
        sentTitles.push(records[0]!.data['title']);
        if (!edited) {
          edited = true;
          // Пользователь меняет запись, пока идёт первый запрос.
          await saveRecord('sessions', session('a', { title: 'v2' }), { database, now: () => 200 });
        }
        return { applied: records.length, stale: [], rejected: [] };
      },
    });
    await syncOnce(t, database);
    expect(sentTitles).toEqual(['v1', 'v2']);
    expect(await database.outbox.count()).toBe(0);
  });

  it('большая очередь уходит пачками не больше 200', async () => {
    for (let i = 0; i < 450; i++) await saveRecord('sessions', session(`r${i}`), { database });
    const t = fakeTransport();
    expect((await syncOnce(t, database)).pushed).toBe(450);
    expect(t.pushed.map((b) => b.length)).toEqual([200, 200, 50]);
  });
});

describe('syncOnce: получение', () => {
  it('идёт по страницам и запоминает курсор', async () => {
    const pages: PullResponse[] = [
      { records: [{ collection: 'sessions', id: 'a', updatedAt: 1, deletedAt: null, data: { id: 'a' }, seq: 1 }], cursor: 1, hasMore: true },
      { records: [{ collection: 'sessions', id: 'b', updatedAt: 1, deletedAt: null, data: { id: 'b' }, seq: 2 }], cursor: 2, hasMore: false },
    ];
    const t = fakeTransport({ pull: async (since) => (since === 0 ? pages[0]! : pages[1]!) });
    expect(await syncOnce(t, database)).toEqual({ pushed: 0, pulled: 2 });
    expect(await getMeta<number>(CURSOR_KEY, database)).toBe(2);
    expect((await database.rows('sessions').toArray()).map((r) => r.id).sort()).toEqual(['a', 'b']);

    const again = fakeTransport();
    await syncOnce(again, database);
    expect(again.pulls).toEqual([2]);
  });

  it('ошибка на второй странице не откатывает курсор первой', async () => {
    const t = fakeTransport({
      pull: async (since) => {
        if (since === 0) return { records: [], cursor: 7, hasMore: true };
        throw new NetworkError('обрыв');
      },
    });
    await expect(syncOnce(t, database)).rejects.toBeInstanceOf(NetworkError);
    expect(await getMeta<number>(CURSOR_KEY, database)).toBe(7);
  });
});
