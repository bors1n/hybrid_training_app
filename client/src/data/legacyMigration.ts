import Dexie from 'dexie';
import { RECORD_SCHEMAS, type Collection } from '@hybridlog/shared';
import { db, outboxKey, type HybridLogDB, type OutboxRow, type Row } from './db.ts';

/** До переименования в HybridLog база называлась `splav`, а id упражнений автора начинались с `splav:`. */
export const LEGACY_DB_NAME = 'splav';
export const LEGACY_ID_PREFIX = 'splav:';
const ID_PREFIX = 'hybridlog:';

/** Заменяет префикс `splav:` на `hybridlog:` во всех строках значения (id, exerciseId, вложенные блоки). */
export function renameLegacyIds<T>(value: T): T {
  if (typeof value === 'string') {
    return (value.startsWith(LEGACY_ID_PREFIX) ? ID_PREFIX + value.slice(LEGACY_ID_PREFIX.length) : value) as T;
  }
  if (Array.isArray(value)) return value.map(renameLegacyIds) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameLegacyIds(v)])) as T;
  }
  return value;
}

/** `indexedDB.databases()` не открывает базу; `Dexie.exists` открывает и в браузере может зависнуть на отсутствующей. */
async function legacyDbExists(): Promise<boolean> {
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
  if (typeof idb.databases === 'function') return (await idb.databases()).some((d) => d.name === LEGACY_DB_NAME);
  return Dexie.exists(LEGACY_DB_NAME);
}

/**
 * Переносит данные из базы `splav` в `hybridlog` и удаляет старую базу. Безопасно запускать повторно:
 * записи, которые уже есть в новой базе, не перезаписываются.
 * Записи с переименованными id получают новый updatedAt и уходят в очередь отправки; если поменялся сам id,
 * старая запись помечается удалённой, чтобы на сервере не остался двойник.
 */
export async function migrateLegacyDb(database: HybridLogDB = db, now: () => number = Date.now): Promise<boolean> {
  if (!(await legacyDbExists())) return false;
  const legacy = new Dexie(LEGACY_DB_NAME);
  await legacy.open();
  try {
    const have = new Set(legacy.tables.map((t) => t.name));
    for (const collection of Object.keys(RECORD_SCHEMAS) as Collection[]) {
      if (!have.has(collection)) continue;
      const table = database.rows(collection);
      for (const old of (await legacy.table(collection).toArray()) as Row[]) {
        const next = renameLegacyIds(old);
        if (await table.get(next.id)) continue;
        if (JSON.stringify(next) === JSON.stringify(old)) {
          await table.put(old);
          continue;
        }
        const at = Math.max(now(), old.updatedAt + 1);
        await database.transaction('rw', [table, database.outbox], async () => {
          await table.put({ ...next, updatedAt: at });
          await database.outbox.put({ key: outboxKey(collection, next.id), collection, id: next.id });
          if (next.id !== old.id) {
            await table.put({ ...old, updatedAt: at, deletedAt: at });
            await database.outbox.put({ key: outboxKey(collection, old.id), collection, id: old.id });
          }
        });
      }
    }
    if (have.has('outbox')) {
      for (const row of (await legacy.table('outbox').toArray()) as OutboxRow[]) {
        const id = renameLegacyIds(row.id);
        await database.outbox.put({ key: outboxKey(row.collection, id), collection: row.collection, id });
      }
    }
    if (have.has('meta')) {
      for (const row of (await legacy.table('meta').toArray()) as { key: string; value: unknown }[]) {
        if (!(await database.meta.get(row.key))) await database.meta.put({ key: row.key, value: renameLegacyIds(row.value) });
      }
    }
  } finally {
    legacy.close();
  }
  await Dexie.delete(LEGACY_DB_NAME);
  return true;
}
