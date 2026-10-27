import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { PullResponse, PushResponse, SyncRecord } from '@splav/shared';
import type { Db } from '../db/client.ts';
import { records, users } from '../db/schema.ts';

/**
 * Принимает пачку изменений пользователя. Запись применяется, только если её updatedAt
 * строго новее серверной (last-write-wins); остальные возвращаются как `stale`
 * (включая точное совпадение времени: повторная отправка той же записи ничего не меняет).
 */
export async function pushRecords(db: Db, userId: string, batch: SyncRecord[]): Promise<Omit<PushResponse, 'rejected'>> {
  if (batch.length === 0) return { applied: 0, stale: [] };

  return db.transaction(async (tx) => {
    // Обновление строки пользователя сериализует параллельные push одного аккаунта,
    // поэтому курсор seq внутри пользователя растёт в порядке фиксации транзакций.
    const [counter] = await tx
      .update(users)
      .set({ syncSeq: sql`${users.syncSeq} + ${batch.length}` })
      .where(eq(users.id, userId))
      .returning({ syncSeq: users.syncSeq });
    if (!counter) throw new Error('Пользователь не найден');
    const firstSeq = counter.syncSeq - batch.length + 1;

    const stale: PushResponse['stale'] = [];
    let applied = 0;
    for (const [i, rec] of batch.entries()) {
      const written = await tx
        .insert(records)
        .values({
          userId,
          collection: rec.collection,
          id: rec.id,
          data: rec.data,
          updatedAt: rec.updatedAt,
          deletedAt: rec.deletedAt,
          seq: firstSeq + i,
        })
        .onConflictDoUpdate({
          target: [records.userId, records.collection, records.id],
          set: { data: rec.data, updatedAt: rec.updatedAt, deletedAt: rec.deletedAt, seq: firstSeq + i },
          setWhere: sql`${records.updatedAt} < excluded.updated_at`,
        })
        .returning({ id: records.id });
      if (written.length > 0) applied += 1;
      else stale.push({ collection: rec.collection, id: rec.id });
    }
    return { applied, stale };
  });
}

export async function pullRecords(db: Db, userId: string, since: number, limit: number): Promise<PullResponse> {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.userId, userId), gt(records.seq, since)))
    .orderBy(asc(records.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    records: page.map((r) => ({
      collection: r.collection as SyncRecord['collection'],
      id: r.id,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      data: r.data,
      seq: r.seq,
    })),
    cursor: page.at(-1)?.seq ?? since,
    hasMore: rows.length > limit,
  };
}
