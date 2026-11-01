import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import * as schema from './schema.ts';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

export interface DbOptions {
  /** Путь к файлу базы SQLite; без него база живёт в памяти (тесты). */
  file?: string | undefined;
}

const migrationsFolder = join(import.meta.dirname, '..', '..', 'drizzle');

/** Открывает базу и применяет миграции. */
export async function openDb({ file }: DbOptions = {}): Promise<DbHandle> {
  const sqlite = new Database(file ?? ':memory:');
  // WAL: читатели не блокируют запись, а копия файла через `.backup` остаётся целой.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, close: async () => void sqlite.close() };
}
