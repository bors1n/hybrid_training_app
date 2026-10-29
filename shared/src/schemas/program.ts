import { z } from 'zod';
import { syncFields } from './common.ts';

/**
 * Программа тренировок: набор шаблонов (очередь Т1 → Т2 → Т3) и набор комплексов (очередь комплексов).
 * Ссылается на существующие записи `queues` и `complexQueue`, а не встраивает их: так `queueId`
 * в уже записанных тренировках остаётся верным.
 */
export const ProgramRecordSchema = z.object({
  ...syncFields,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  queueId: z.string().min(1),
  complexQueueId: z.string().min(1),
});
export type ProgramRecord = z.infer<typeof ProgramRecordSchema>;
