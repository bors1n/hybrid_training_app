import type { FastifyInstance } from 'fastify';
import { checkRecord, PullQuerySchema, PushRequestSchema, type PushResponse, type SyncRecord } from '@hybridlog/shared';
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

    const valid: SyncRecord[] = [];
    const rejected: PushResponse['rejected'] = [];
    for (const rec of body.data.records) {
      const check = checkRecord(rec.collection, rec, rec.data);
      if (check.ok) valid.push({ ...rec, data: check.data });
      else rejected.push({ collection: rec.collection, id: rec.id, reason: check.reason });
    }
    const result = await pushRecords(deps.db, request.user!.id, valid);
    return { ...result, rejected };
  });
}
