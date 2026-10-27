import Dexie, { type EntityTable } from 'dexie';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class SplavDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'splav') {
    super(name);
    this.version(1).stores({ meta: 'key' });
  }
}

export const db = new SplavDB();

export async function getMeta<T>(key: string, database: SplavDB = db): Promise<T | undefined> {
  return (await database.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown, database: SplavDB = db): Promise<void> {
  await database.meta.put({ key, value });
}
