import { ProgramRecordSchema, SettingsRecordSchema, type ComplexRecord } from '@splav/shared';
import { complexQueueAdd, complexQueueRemove } from '../domain/programs.ts';
import { deleteRecord, listRecords, saveRecord } from '../sync/records.ts';
import { db, type SplavDB } from './db.ts';

export const SETTINGS_ID = 'settings';

/** Новая пустая программа: своя очередь шаблонов и своя очередь комплексов. Возвращает id программы. */
export async function createProgram(title: string, database: SplavDB = db): Promise<string> {
  const uid = crypto.randomUUID();
  const program = { id: `own:program:${uid}`, title: title.trim() || 'Новая программа', queueId: `own:queue:${uid}`, complexQueueId: `own:complexQueue:${uid}` };
  await saveRecord('queues', { id: program.queueId, title: program.title, templateIds: [] }, { database });
  await saveRecord('complexQueue', { id: program.complexQueueId, order: [] }, { database });
  await saveRecord('programs', program, { database });
  return program.id;
}

async function settingsRest(database: SplavDB): Promise<Record<string, unknown>> {
  const row = (await listRecords('settings', database)).find((r) => r.id === SETTINGS_ID);
  const parsed = row ? SettingsRecordSchema.safeParse(row) : null;
  const { updatedAt: _u, deletedAt: _d, ...rest } = parsed?.success ? parsed.data : { id: SETTINGS_ID, updatedAt: 0, deletedAt: null };
  return rest;
}

/** Выбор активной программы: её очередь показывает «Сегодня». */
export async function setActiveProgram(programId: string, database: SplavDB = db): Promise<void> {
  await saveRecord('settings', { ...(await settingsRest(database)), id: SETTINGS_ID, activeProgramId: programId } as never, { database });
}

/** Название и описание программы. */
export async function updateProgram(programId: string, patch: { title: string; description: string }, database: SplavDB = db): Promise<void> {
  const row = await database.rows('programs').get(programId);
  const parsed = row && row.deletedAt === null ? ProgramRecordSchema.safeParse(row) : null;
  if (!parsed?.success) throw new Error('Программа не найдена');
  const { updatedAt: _u, deletedAt: _d, description: _old, ...rest } = parsed.data;
  const description = patch.description.trim();
  await saveRecord('programs', { ...rest, title: patch.title.trim(), ...(description ? { description } : {}) }, { database });
}

/**
 * Мягко удаляет программу вместе с её очередями. Шаблоны, комплексы и записанные тренировки остаются.
 * Если удалена активная, активной считается базовая (или первая оставшаяся): см. `activeProgram`.
 */
export async function deleteProgram(programId: string, database: SplavDB = db): Promise<void> {
  const row = await database.rows('programs').get(programId);
  const parsed = row && row.deletedAt === null ? ProgramRecordSchema.safeParse(row) : null;
  if (!parsed?.success) return;
  await deleteRecord('programs', programId, { database });
  await deleteRecord('queues', parsed.data.queueId, { database });
  await deleteRecord('complexQueue', parsed.data.complexQueueId, { database });
}

async function editComplexOrder(complexQueueId: string, fn: (q: { order: string[] }) => { order: string[] }, database: SplavDB): Promise<void> {
  const row = await database.rows('complexQueue').get(complexQueueId);
  if (!row || row.deletedAt !== null) throw new Error('Очередь комплексов не найдена');
  const { updatedAt: _u, deletedAt: _d, ...draft } = row as typeof row & { order: string[] };
  await saveRecord('complexQueue', fn(draft) as never, { database });
}

export const addComplexToProgram = (complexQueueId: string, complexId: string, database: SplavDB = db): Promise<void> =>
  editComplexOrder(complexQueueId, (q) => complexQueueAdd(q, complexId), database);

export const removeComplexFromProgram = (complexQueueId: string, complexId: string, database: SplavDB = db): Promise<void> =>
  editComplexOrder(complexQueueId, (q) => complexQueueRemove(q, complexId), database);

export type OwnComplexInput = Pick<ComplexRecord, 'title' | 'format' | 'description'> & { timeCapMin?: number };

/** Свой комплекс (`own:<uuid>`). Если задана очередь комплексов, сразу попадает в программу. */
export async function createOwnComplex(input: OwnComplexInput, complexQueueId?: string, database: SplavDB = db): Promise<string> {
  const id = `own:${crypto.randomUUID()}`;
  await saveRecord('complexes', { id, title: input.title.trim(), format: input.format, description: input.description.trim(), tags: [], ...(input.timeCapMin !== undefined ? { timeCapMin: input.timeCapMin } : {}) }, { database });
  if (complexQueueId) await addComplexToProgram(complexQueueId, id, database);
  return id;
}
