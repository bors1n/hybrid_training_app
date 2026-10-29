import { z } from 'zod';

/** Коллекции, которые синхронизируются. Каталог RepDB статичен и сюда не входит. */
export const COLLECTIONS = [
  'sessions',
  'templates',
  'queues',
  'complexQueue',
  'complexes',
  'programs',
  'exercises',
  'exerciseNotes',
  'exerciseAliases',
  'settings',
] as const;
export const CollectionSchema = z.enum(COLLECTIONS);
export type Collection = z.infer<typeof CollectionSchema>;

export const MAX_BATCH = 200;

/** Время — миллисекунды Unix. `data` — вся запись целиком (включая id, updatedAt, deletedAt). */
export const SyncRecordSchema = z.object({
  collection: CollectionSchema,
  id: z.string().min(1).max(200),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

export const PushRequestSchema = z.object({
  records: z.array(SyncRecordSchema).max(MAX_BATCH),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

/**
 * `stale` — записи, у которых на сервере updatedAt новее; клиент получит их при pull.
 * `rejected` — записи, не прошедшие проверку схемы: повторять их бессмысленно.
 */
export const PushResponseSchema = z.object({
  applied: z.number().int().nonnegative(),
  stale: z.array(z.object({ collection: CollectionSchema, id: z.string() })),
  rejected: z.array(z.object({ collection: CollectionSchema, id: z.string(), reason: z.string() })).default([]),
});
export type PushResponse = z.infer<typeof PushResponseSchema>;

export const PullRecordSchema = SyncRecordSchema.extend({ seq: z.number().int().positive() });
export type PullRecord = z.infer<typeof PullRecordSchema>;

export const PullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(MAX_BATCH).default(MAX_BATCH),
});

export const PullResponseSchema = z.object({
  records: z.array(PullRecordSchema),
  /** Курсор для следующего запроса: seq последней записи, либо прежний since. */
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponseSchema>;
