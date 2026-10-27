import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { join } from 'node:path';
import pg from 'pg';
import * as schema from './schema.ts';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

export interface DbOptions {
  /** Строка подключения PostgreSQL. Если не задана — встроенный PGlite. */
  url?: string | undefined;
  /** Каталог данных PGlite; без него база живёт в памяти (тесты). */
  dataDir?: string | undefined;
}

const migrationsFolder = join(import.meta.dirname, '..', '..', 'drizzle');

/** Открывает базу и применяет миграции. Один и тот же SQL работает и на PGlite, и на PostgreSQL. */
export async function openDb({ url, dataDir }: DbOptions = {}): Promise<DbHandle> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
