import type { Collection, PullRecord } from '@splav/shared';
import { db, outboxKey, type Row, type SplavDB } from '../data/db.ts';

type Listener = () => void;
const writeListeners = new Set<Listener>();

/** Подписка на локальные записи: по ним синхронизация запускается через пару секунд. */
export function onLocalWrite(listener: Listener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export interface SaveOptions {
  database?: SplavDB;
  now?: () => number;
}

/**
 * Сохраняет запись и ставит её в очередь отправки в одной транзакции.
 * updatedAt растёт строго монотонно: правка в ту же миллисекунду не проиграет предыдущей версии.
 */
export async function saveRecord<T extends { id: string }>(
  collection: Collection,
  data: T & Record<string, unknown>,
  { database = db, now = Date.now }: SaveOptions = {},
): Promise<Row> {
  const table = database.rows(collection);
  const row = await database.transaction('rw', [table, database.outbox], async () => {
    const prev = await table.get(data.id);
    const updatedAt = Math.max(now(), (prev?.updatedAt ?? 0) + 1);
    const next: Row = { ...data, id: data.id, updatedAt, deletedAt: null };
    await table.put(next);
    await database.outbox.put({ key: outboxKey(collection, data.id), collection, id: data.id });
    return next;
  });
  for (const l of writeListeners) l();
  return row;
}

/** Мягкое удаление: запись остаётся с deletedAt, чтобы удаление доехало до других устройств. */
export async function deleteRecord(
  collection: Collection,
  id: string,
  { database = db, now = Date.now }: SaveOptions = {},
): Promise<void> {
  const table = database.rows(collection);
  await database.transaction('rw', [table, database.outbox], async () => {
    const prev = await table.get(id);
    if (!prev) return;
    const updatedAt = Math.max(now(), prev.updatedAt + 1);
    await table.put({ ...prev, updatedAt, deletedAt: updatedAt });
    await database.outbox.put({ key: outboxKey(collection, id), collection, id });
  });
  for (const l of writeListeners) l();
}

/** Живые записи коллекции (без помеченных удалёнными). */
export async function listRecords(collection: Collection, database: SplavDB = db): Promise<Row[]> {
  return (await database.rows(collection).toArray()).filter((r) => r.deletedAt === null);
}

/**
 * Применяет записи с сервера по правилу last-write-wins: локальная версия не младше — остаётся.
 * Возвращает число применённых записей.
 */
export async function applyRemote(remote: PullRecord[], database: SplavDB = db): Promise<number> {
  if (remote.length === 0) return 0;
  const tables = [...new Set(remote.map((r) => r.collection))].map((c) => database.rows(c));
  return database.transaction('rw', [...tables, database.outbox], async () => {
    let applied = 0;
    for (const rec of remote) {
      const table = database.rows(rec.collection);
      const local = await table.get(rec.id);
      if (local && local.updatedAt >= rec.updatedAt) continue;
      await table.put({ ...rec.data, id: rec.id, updatedAt: rec.updatedAt, deletedAt: rec.deletedAt });
      // Неотправленная локальная правка старше серверной версии: сервер её всё равно отклонил бы.
      await database.outbox.delete(outboxKey(rec.collection, rec.id));
      applied += 1;
    }
    return applied;
  });
}
