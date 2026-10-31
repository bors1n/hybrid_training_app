import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Collection } from '@hybridlog/shared';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Общая форма синхронизируемой записи; остальные поля зависят от коллекции (схемы — этап 1). */
export interface Row {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  [field: string]: unknown;
}

/** Очередь неотправленных изменений. Ключ `collection:id` схлопывает повторные правки одной записи. */
export interface OutboxRow {
  key: string;
  collection: Collection;
  id: string;
}

export const outboxKey = (collection: Collection, id: string): string => `${collection}:${id}`;

export class HybridLogDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  outbox!: EntityTable<OutboxRow, 'key'>;

  constructor(name = 'hybridlog') {
    super(name);
    this.version(1).stores({ meta: 'key' });
    this.version(2).stores({
      meta: 'key',
      outbox: 'key',
      sessions: 'id, updatedAt',
      templates: 'id, updatedAt',
      queues: 'id, updatedAt',
      complexQueue: 'id, updatedAt',
      complexes: 'id, updatedAt',
      exercises: 'id, updatedAt',
      exerciseNotes: 'id, updatedAt',
      exerciseAliases: 'id, updatedAt',
      settings: 'id, updatedAt',
    });
    // Поля deletedAt не индексируются: null не может быть ключом Dexie, удалённые отсеиваются в коде.
    this.version(3).stores({
      sessions: 'id, date, updatedAt',
      exerciseNotes: 'id, exerciseId, updatedAt',
      exerciseAliases: 'id, exerciseId, updatedAt',
    });
    this.version(4).stores({ programs: 'id, updatedAt' });
  }

  rows(collection: Collection): Table<Row, string> {
    return this.table(collection);
  }
}

export const db = new HybridLogDB();

export async function getMeta<T>(key: string, database: HybridLogDB = db): Promise<T | undefined> {
  return (await database.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown, database: HybridLogDB = db): Promise<void> {
  await database.meta.put({ key, value });
}

export async function deleteMeta(key: string, database: HybridLogDB = db): Promise<void> {
  await database.meta.delete(key);
}

/** Полная очистка локальных данных (выход из аккаунта, смена пользователя). */
export async function clearLocalData(database: HybridLogDB = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()));
  });
}
