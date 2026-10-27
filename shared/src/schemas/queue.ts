import { z } from 'zod';
import { ComplexFormatSchema } from './session.ts';
import { DurationSecSchema, syncFields } from './common.ts';

/**
 * Ручная установка позиции («Новый цикл», «начать с Т2»). Действует, пока после `setAt`
 * не завершена ни одна тренировка этой очереди; дальше позиция снова вычисляется из истории.
 */
export const QueueOverrideSchema = z.object({
  position: z.number().int().min(0).max(1000),
  setAt: z.number().int().nonnegative(),
});

/** Очередь шаблонов: Т1 → Т2 → Т3. Позиция не хранится, а вычисляется из завершённых тренировок. */
export const QueueRecordSchema = z.object({
  ...syncFields,
  title: z.string().trim().min(1).max(200),
  templateIds: z.array(z.string().min(1)).min(1).max(50),
  override: QueueOverrideSchema.optional(),
});
export type QueueRecord = z.infer<typeof QueueRecordSchema>;

/** Порядок комплексов из библиотеки: `['#001', '#002', …]`. */
export const ComplexQueueRecordSchema = z.object({
  ...syncFields,
  order: z.array(z.string().min(1)).min(1).max(200),
  override: QueueOverrideSchema.optional(),
});
export type ComplexQueueRecord = z.infer<typeof ComplexQueueRecordSchema>;

/** Комплекс библиотеки. id = '#001'. */
export const ComplexRecordSchema = z.object({
  ...syncFields,
  title: z.string().trim().min(1).max(200),
  format: ComplexFormatSchema,
  timeCapMin: z.number().min(0).max(600).optional(),
  /** Целевое время для форматов «на время» не хранится: результат — в тренировках. */
  description: z.string().max(4000),
  tags: z.array(z.string().max(50)).max(20).default([]),
});
export type ComplexRecord = z.infer<typeof ComplexRecordSchema>;

export const SettingsRecordSchema = z.object({
  ...syncFields,
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** Шаг изменения веса кнопками, кг. */
  weightStepKg: z.number().positive().max(100).optional(),
  defaultRestSec: DurationSecSchema.optional(),
});
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>;
