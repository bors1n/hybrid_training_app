import { ComplexQueueRecordSchema, ComplexRecordSchema, QueueRecordSchema, TemplateRecordSchema } from '@splav/shared';
import { todayKey } from '../domain/history.ts';
import { complexQueueState } from '../domain/queue.ts';
import { queueRemoveTemplate } from '../domain/queueEdit.ts';
import { newTemplate } from '../domain/templateEdit.ts';
import { sessionFromTemplate } from '../domain/templateSession.ts';
import { deleteRecord, listRecords, saveRecord } from '../sync/records.ts';
import { db, type SplavDB } from './db.ts';
import { loadSessions } from './importService.ts';

/**
 * Создаёт тренировку из шаблона и возвращает её id. Если шаблон есть в очереди, тренировка помечается
 * очередью и слотом: её завершение сдвинет очередь. Шаблон вне очереди очередь не двигает.
 * Следующий комплекс для блока «комплекс из очереди» берётся из очереди комплексов.
 */
export async function startTemplateWorkout(
  templateId: string,
  { short = false, now = Date.now(), database = db }: { short?: boolean; now?: number; database?: SplavDB } = {},
): Promise<string> {
  const row = await database.rows('templates').get(templateId);
  const template = row && row.deletedAt === null ? TemplateRecordSchema.safeParse(row) : null;
  if (!template?.success) throw new Error('Шаблон не найден');

  const queues = (await listRecords('queues', database)).flatMap((r) => {
    const p = QueueRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const queue = queues.sort((a, b) => a.id.localeCompare(b.id)).find((q) => q.templateIds.includes(templateId));

  const sessions = await loadSessions(database);
  const cq = (await listRecords('complexQueue', database)).flatMap((r) => {
    const p = ComplexQueueRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  })[0];
  const next = cq ? complexQueueState(cq, sessions) : null;
  const complexes = (await listRecords('complexes', database)).flatMap((r) => {
    const p = ComplexRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const nextComplex = next ? (complexes.find((c) => c.id === next.complexId) ?? null) : null;

  const draft = sessionFromTemplate(template.data, {
    short,
    date: todayKey(new Date(now)),
    now,
    sessions,
    nextComplex,
    id: crypto.randomUUID(),
    ...(queue ? { queue: { id: queue.id, slot: queue.templateIds.indexOf(templateId) } } : {}),
  });
  await saveRecord('sessions', draft, { database });
  return draft.id;
}

/** Новый пустой шаблон; возвращает его id для редактора. */
export async function createTemplate(database: SplavDB = db): Promise<string> {
  const t = newTemplate();
  await saveRecord('templates', t, { database });
  return t.id;
}

export type DeleteTemplateResult = { ok: true } | { ok: false; reason: string };

/**
 * Удаляет шаблон и убирает его из очередей. Единственный шаблон очереди удалить нельзя:
 * очередь без шаблонов бессмысленна (сначала добавьте другой). Уже сделанные тренировки остаются.
 */
export async function deleteTemplate(templateId: string, database: SplavDB = db): Promise<DeleteTemplateResult> {
  const queues = (await listRecords('queues', database)).flatMap((r) => {
    const p = QueueRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const containing = queues.filter((q) => q.templateIds.includes(templateId));
  const blocking = containing.find((q) => q.templateIds.length <= 1);
  if (blocking) return { ok: false, reason: `Это единственный шаблон в очереди «${blocking.title}». Сначала добавьте в очередь другой.` };

  for (const q of containing) {
    const { updatedAt: _u, deletedAt: _d, ...draft } = q;
    await saveRecord('queues', queueRemoveTemplate(draft, q.templateIds.indexOf(templateId)), { database });
  }
  await deleteRecord('templates', templateId, { database });
  return { ok: true };
}
