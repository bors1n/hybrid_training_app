import type { Collection, RecordInput } from '@hybridlog/shared';
import { db, getMeta, setMeta, type HybridLogDB } from '../data/db.ts';
import { saveRecord } from '../sync/records.ts';
import { COMPLEX_QUEUE_ORDER, COMPLEXES } from './complexes.ts';
import { BASIC_PROGRAM_ID } from '../domain/programs.ts';
import { QUEUE, TEMPLATES } from './templates.ts';

/** Версия набора начальных данных. Повышается, когда в seed добавляются новые записи. */
export const SEED_VERSION = 2;
export const SEED_META_KEY = 'seedVersion';
/**
 * Время создания seed-записей. Минимальное: любая правка пользователя (updatedAt = «сейчас») новее,
 * а два устройства, засеявшие одно и то же, дают идентичные версии и не конфликтуют.
 */
export const SEED_UPDATED_AT = 1;

export const COMPLEX_QUEUE_ID = 'seed:complexQueue:main';

export interface SeedRecord {
  collection: Collection;
  data: { id: string } & Record<string, unknown>;
}

/** Начальные записи: шаблоны Т1–Т3, очередь, комплексы #001–#024, их очередь и «Базовая программа». */
export function seedRecords(): SeedRecord[] {
  return [
    ...TEMPLATES.map((data): SeedRecord => ({ collection: 'templates', data })),
    { collection: 'queues', data: QUEUE },
    ...COMPLEXES.map((data): SeedRecord => ({ collection: 'complexes', data })),
    { collection: 'complexQueue', data: { id: COMPLEX_QUEUE_ID, order: COMPLEX_QUEUE_ORDER } },
    { collection: 'programs', data: { id: BASIC_PROGRAM_ID, title: 'Базовая программа', description: 'Т1–Т3 и библиотека комплексов #001–#024', queueId: QUEUE.id, complexQueueId: COMPLEX_QUEUE_ID } },
  ];
}

/**
 * Создаёт начальные записи, которых ещё нет. Вызывать после первой синхронизации: тогда записи,
 * уже лежащие на сервере (в том числе изменённые или удалённые пользователем), не перезаписываются.
 * Удалённая запись остаётся в таблице с deletedAt, поэтому заново не создаётся.
 */
export async function ensureSeed(database: HybridLogDB = db): Promise<number> {
  if (((await getMeta<number>(SEED_META_KEY, database)) ?? 0) >= SEED_VERSION) return 0;
  let created = 0;
  for (const { collection, data } of seedRecords()) {
    if (await database.rows(collection).get(data.id)) continue;
    await saveRecord(collection, data as RecordInput<typeof collection>, { database, now: () => SEED_UPDATED_AT });
    created += 1;
  }
  await setMeta(SEED_META_KEY, SEED_VERSION, database);
  return created;
}
