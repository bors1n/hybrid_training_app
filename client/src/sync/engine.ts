import { MAX_BATCH, type PullResponse, type PushResponse, type SyncRecord } from '@splav/shared';
import { db, getMeta, setMeta, type SplavDB } from '../data/db.ts';
import { applyRemote } from './records.ts';

/** Нет связи с сервером (офлайн, таймаут, 5xx): данные остаются в очереди. */
export class NetworkError extends Error {}
/** Сессия недействительна: нужен повторный вход, очередь не трогаем. */
export class AuthError extends Error {}

export interface Transport {
  push(records: SyncRecord[]): Promise<PushResponse>;
  pull(since: number, limit: number): Promise<PullResponse>;
}

export const CURSOR_KEY = 'syncCursor';
const MAX_PUSH_ROUNDS = 50;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

async function pushPending(transport: Transport, database: SplavDB): Promise<number> {
  let pushed = 0;
  for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
    const pending = await database.outbox.limit(MAX_BATCH).toArray();
    if (pending.length === 0) break;

    const batch: SyncRecord[] = [];
    const orphans: string[] = [];
    for (const item of pending) {
      const row = await database.rows(item.collection).get(item.id);
      if (!row) orphans.push(item.key);
      else batch.push({ collection: item.collection, id: row.id, updatedAt: row.updatedAt, deletedAt: row.deletedAt, data: row });
    }
    if (orphans.length > 0) await database.outbox.bulkDelete(orphans);
    if (batch.length === 0) continue;

    await transport.push(batch);
    pushed += batch.length;

    // Строку убираем из очереди, только если её не меняли во время отправки.
    await database.transaction('rw', [database.outbox, ...new Set(batch.map((b) => database.rows(b.collection)))], async () => {
      for (const sent of batch) {
        const current = await database.rows(sent.collection).get(sent.id);
        if (!current || current.updatedAt === sent.updatedAt) await database.outbox.delete(`${sent.collection}:${sent.id}`);
      }
    });
  }
  return pushed;
}

async function pullAll(transport: Transport, database: SplavDB): Promise<number> {
  let since = (await getMeta<number>(CURSOR_KEY, database)) ?? 0;
  let pulled = 0;
  for (;;) {
    const page = await transport.pull(since, MAX_BATCH);
    pulled += await applyRemote(page.records, database);
    since = page.cursor;
    await setMeta(CURSOR_KEY, since, database);
    if (!page.hasMore) break;
  }
  return pulled;
}

/** Один цикл синхронизации: сначала отправка очереди, затем получение чужих изменений. */
export async function syncOnce(transport: Transport, database: SplavDB = db): Promise<SyncResult> {
  const pushed = await pushPending(transport, database);
  const pulled = await pullAll(transport, database);
  return { pushed, pulled };
}
