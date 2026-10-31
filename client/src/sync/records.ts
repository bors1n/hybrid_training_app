import { RECORD_SCHEMAS, type Collection, type PullRecord, type RecordInput } from '@hybridlog/shared';
import { db, outboxKey, type Row, type HybridLogDB } from '../data/db.ts';
import { LEGACY_ID_PREFIX, renameLegacyIds } from '../data/legacyMigration.ts';

type Listener = () => void;
const writeListeners = new Set<Listener>();

/** Подписка на локальные записи: по ним синхронизация запускается через пару секунд. */
export function onLocalWrite(listener: Listener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export interface SaveOptions {
  database?: HybridLogDB;
  now?: () => number;
}

/**
 * Проверяет запись по схеме коллекции, сохраняет её и ставит в очередь отправки в одной транзакции.
 * Невалидная запись не сохраняется (бросает ZodError) — так на сервер не уйдёт то, что он всё равно отклонит.
 * updatedAt растёт строго монотонно: правка в ту же миллисекунду не проиграет предыдущей версии.
 */
export async function saveRecord<C extends Collection>(
  collection: C,
  data: Omit<RecordInput<C>, 'updatedAt' | 'deletedAt'>,
  { database = db, now = Date.now }: SaveOptions = {},
): Promise<Row> {
  const table = database.rows(collection);
  const row = await database.transaction('rw', [table, database.outbox], async () => {
    const prev = await table.get(data.id);
    const updatedAt = Math.max(now(), (prev?.updatedAt ?? 0) + 1);
    const next = RECORD_SCHEMAS[collection].parse({ ...data, updatedAt, deletedAt: null }) as Row;
    await table.put(next);
    await database.outbox.put({ key: outboxKey(collection, next.id), collection, id: next.id });
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
export async function listRecords(collection: Collection, database: HybridLogDB = db): Promise<Row[]> {
  return (await database.rows(collection).toArray()).filter((r) => r.deletedAt === null);
}

/**
 * Применяет записи с сервера по правилу last-write-wins: локальная версия не младше — остаётся.
 * Возвращает число применённых записей.
 */
export async function applyRemote(incoming: PullRecord[], database: HybridLogDB = db): Promise<number> {
  // Устройство без обновления ещё шлёт id `splav:*`: переименовываем их. Удалённые старые id пропускаем:
  // это могильники, которые оставила миграция, и они не должны затереть новую запись.
  const remote = incoming
    .filter((r) => !(r.id.startsWith(LEGACY_ID_PREFIX) && r.deletedAt !== null))
    .map((r) => ({ ...r, id: renameLegacyIds(r.id), data: renameLegacyIds(r.data) }));
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
