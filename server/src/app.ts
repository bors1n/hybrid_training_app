import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Health } from '@hybridlog/shared';
import type { Mailer } from './auth/mailer.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { registerSyncRoutes } from './sync/routes.ts';

export interface AppDeps {
  db: Db;
  mailer: Mailer;
  config: Config;
  /** Часы; в тестах подменяются. */
  now?: () => number;
}

export async function buildApp({ db, mailer, config, now = Date.now }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env['NODE_ENV'] !== 'test',
    trustProxy: config.trustProxy,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.get('/api/health', async (): Promise<Health> => ({ ok: true, service: 'hybridlog' }));

  const deps = { db, mailer, config, now };
  registerAuthRoutes(app, deps);
  registerSyncRoutes(app, deps);

  return app;
}
