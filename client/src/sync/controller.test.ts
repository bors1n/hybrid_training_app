import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HybridLogDB } from '../data/db.ts';
import { createSyncController } from './controller.ts';
import { AuthError, NetworkError, type Transport } from './engine.ts';
import { saveRecord } from './records.ts';
import { syncLabel, type SyncStatus } from './status.ts';
import { session, template } from '../test/fixtures.ts';

let database: HybridLogDB;
beforeEach(async () => {
  database = new HybridLogDB(`test-${Math.random()}`);
  await database.open();
});

const okTransport: Transport = {
  push: async (r) => ({ applied: r.length, stale: [], rejected: [] }),
  pull: async (since) => ({ records: [], cursor: since, hasMore: false }),
};

function setup(transport: Transport, isOnline = () => true) {
  const log: Partial<SyncStatus>[] = [];
  const onUnauth = vi.fn();
  const c = createSyncController({ transport, database, isOnline, onStatus: (p) => log.push(p), onUnauth, now: () => 42 });
  return { c, log, onUnauth, states: () => log.map((p) => p.state).filter(Boolean) };
}

describe('контроллер синхронизации', () => {
  it('успех: syncing → idle, время и счётчик очереди', async () => {
    await saveRecord('sessions', session('a'), { database });
    const { c, log, states } = setup(okTransport);
    await c.trigger();
    expect(states()).toEqual(['syncing', 'idle']);
    expect(log).toContainEqual({ state: 'idle', lastSyncAt: 42 });
    expect(log.at(-1)).toEqual({ pending: 0 });
  });

  it('офлайн не обращается к сети, но показывает очередь', async () => {
    await saveRecord('sessions', session('a'), { database });
    const push = vi.fn(okTransport.push);
    const { c, log, states } = setup({ ...okTransport, push }, () => false);
    await c.trigger();
    expect(push).not.toHaveBeenCalled();
    expect(states()).toEqual(['offline']);
    expect(log.at(-1)).toEqual({ pending: 1 });
  });

  it('сетевая ошибка → offline, очередь цела', async () => {
    await saveRecord('sessions', session('a'), { database });
    const { c, states, log } = setup({
      ...okTransport,
      push: async () => {
        throw new NetworkError('x');
      },
    });
    await c.trigger();
    expect(states()).toEqual(['syncing', 'offline']);
    expect(log.at(-1)).toEqual({ pending: 1 });
  });

  it('401 → unauth и вызов onUnauth', async () => {
    const { c, states, onUnauth } = setup({
      ...okTransport,
      pull: async () => {
        throw new AuthError('x');
      },
    });
    await c.trigger();
    expect(states()).toEqual(['syncing', 'unauth']);
    expect(onUnauth).toHaveBeenCalledOnce();
  });

  it('неожиданная ошибка → error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { c, states } = setup({
      ...okTransport,
      pull: async () => {
        throw new Error('баг');
      },
    });
    await c.trigger();
    expect(states()).toEqual(['syncing', 'error']);
  });

  it('параллельные запуски не пересекаются, а дают один повторный проход', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const slow: Transport = {
      push: okTransport.push,
      pull: async (since) => {
        calls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return { records: [], cursor: since, hasMore: false };
      },
    };
    const { c } = setup(slow);
    await Promise.all([c.trigger(), c.trigger(), c.trigger()]);
    expect(maxInFlight).toBe(1);
    expect(calls).toBe(2);
  });
});

describe('syncLabel', () => {
  const base: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null };
  it('всё хорошо — подписи нет', () => {
    expect(syncLabel(base)).toBeNull();
  });
  it('очередь, офлайн, ошибка', () => {
    expect(syncLabel({ ...base, pending: 3 })).toBe('Не синхронизировано: 3');
    expect(syncLabel({ ...base, state: 'offline', pending: 2 })).toBe('Нет сети · не отправлено: 2');
    expect(syncLabel({ ...base, state: 'offline' })).toBe('Нет сети');
    expect(syncLabel({ ...base, state: 'error' })).toBe('Ошибка синхронизации');
    expect(syncLabel({ ...base, state: 'unauth' })).toBe('Нужен вход');
  });
});
