import type { FastifyInstance } from 'fastify';
import type { SyncRecord } from '@splav/shared';
import { buildApp } from './app.ts';
import type { Mailer } from './auth/mailer.ts';
import { loadConfig, type Config } from './config.ts';
import { openDb } from './db/client.ts';

export interface TestApp {
  app: FastifyInstance;
  clock: { t: number };
  sent: { email: string; code: string }[];
  lastCode: (email: string) => string;
  /** Проходит вход по коду и возвращает значение cookie сессии. */
  login: (email: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const handle = await openDb();
  const clock = { t: 1_800_000_000_000 };
  const sent: TestApp['sent'] = [];
  const mailer: Mailer = {
    async sendCode(email, code) {
      sent.push({ email, code });
    },
  };
  const config = { ...loadConfig({}), ipRateLimitPerMin: 100_000, ...overrides };
  const app = await buildApp({ db: handle.db, mailer, config, now: () => clock.t });

  const lastCode = (email: string): string => {
    const hit = [...sent].reverse().find((m) => m.email === email);
    if (!hit) throw new Error(`Код для ${email} не отправлялся`);
    return hit.code;
  };

  const login = async (email: string): Promise<string> => {
    await app.inject({ method: 'POST', url: '/api/auth/code', payload: { email } });
    const res = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { email, code: lastCode(email) } });
    const sid = res.cookies.find((c) => c.name === 'sid')?.value;
    if (res.statusCode !== 200 || !sid) throw new Error(`Вход не удался: ${res.statusCode} ${res.body}`);
    return sid;
  };

  return {
    app,
    clock,
    sent,
    lastCode,
    login,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export function rec(id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord {
  return {
    collection: 'sessions',
    id,
    updatedAt,
    deletedAt: null,
    data: { id, updatedAt, title: `t-${id}-${updatedAt}` },
    ...extra,
  };
}
