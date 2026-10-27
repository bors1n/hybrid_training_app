import type { FastifyInstance } from 'fastify';
import { PullQuerySchema, PushRequestSchema } from '@splav/shared';
import { requireUser } from '../auth/routes.ts';
import type { AuthDeps } from '../auth/service.ts';
import { pullRecords, pushRecords } from './service.ts';

export function registerSyncRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const preHandler = requireUser(deps);

  app.get('/api/sync', { preHandler }, async (request, reply) => {
    const query = PullQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'bad_request' });
    return pullRecords(deps.db, request.user!.id, query.data.since, query.data.limit);
  });

  app.post('/api/sync', { preHandler }, async (request, reply) => {
    const body = PushRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    return pushRecords(deps.db, request.user!.id, body.data.records);
  });
}
