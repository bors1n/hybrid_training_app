import Fastify, { type FastifyInstance } from 'fastify';
import type { Health } from '@splav/shared';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });

  app.get('/api/health', async (): Promise<Health> => ({ ok: true, service: 'splav' }));

  return app;
}
