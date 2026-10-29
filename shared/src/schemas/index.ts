import type { z } from 'zod';
import type { Collection } from '../sync.ts';
import { ExerciseAliasRecordSchema, ExerciseNoteRecordSchema, ExerciseRecordSchema } from './exercise.ts';
import { ComplexQueueRecordSchema, ComplexRecordSchema, QueueRecordSchema, SettingsRecordSchema } from './queue.ts';
import { ProgramRecordSchema } from './program.ts';
import { SessionRecordSchema } from './session.ts';
import { TemplateRecordSchema } from './template.ts';

export * from './common.ts';
export * from './exercise.ts';
export * from './program.ts';
export * from './queue.ts';
export * from './session.ts';
export * from './template.ts';

/** Схема содержимого записи для каждой синхронизируемой коллекции. */
export const RECORD_SCHEMAS = {
  sessions: SessionRecordSchema,
  templates: TemplateRecordSchema,
  queues: QueueRecordSchema,
  complexQueue: ComplexQueueRecordSchema,
  complexes: ComplexRecordSchema,
  programs: ProgramRecordSchema,
  exercises: ExerciseRecordSchema,
  exerciseNotes: ExerciseNoteRecordSchema,
  exerciseAliases: ExerciseAliasRecordSchema,
  settings: SettingsRecordSchema,
} as const satisfies Record<Collection, z.ZodType>;

export type RecordOf<C extends Collection> = z.infer<(typeof RECORD_SCHEMAS)[C]>;
/** Входной тип (до подстановки значений по умолчанию) — то, что принимает saveRecord. */
export type RecordInput<C extends Collection> = z.input<(typeof RECORD_SCHEMAS)[C]>;

export type RecordCheck = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Проверяет запись целиком: форму по схеме коллекции и согласованность с конвертом
 * (id, updatedAt, deletedAt). Неизвестные поля отбрасываются: новые клиенты не ломают старый сервер.
 */
export function checkRecord(
  collection: Collection,
  envelope: { id: string; updatedAt: number; deletedAt: number | null },
  data: Record<string, unknown>,
): RecordCheck {
  const parsed = RECORD_SCHEMAS[collection].safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `${issue?.path.join('.') || '(корень)'}: ${issue?.message ?? 'неверные данные'}` };
  }
  const row = parsed.data as { id: string; updatedAt: number; deletedAt: number | null };
  if (row.id !== envelope.id) return { ok: false, reason: 'id записи не совпадает с конвертом' };
  if (row.updatedAt !== envelope.updatedAt) return { ok: false, reason: 'updatedAt записи не совпадает с конвертом' };
  if (row.deletedAt !== envelope.deletedAt) return { ok: false, reason: 'deletedAt записи не совпадает с конвертом' };
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
