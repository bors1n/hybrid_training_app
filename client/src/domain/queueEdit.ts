import type { ComplexQueueRecord, QueueRecord } from '@splav/shared';

/** Очередь в редакторе: без полей синхронизации. */
export type QueueDraft = Omit<QueueRecord, 'updatedAt' | 'deletedAt'>;
export type ComplexQueueDraft = Omit<ComplexQueueRecord, 'updatedAt' | 'deletedAt'>;

export function queueAddTemplate(q: QueueDraft, templateId: string): QueueDraft {
  return q.templateIds.includes(templateId) ? q : { ...q, templateIds: [...q.templateIds, templateId] };
}

/** В очереди остаётся хотя бы один шаблон. */
export function queueRemoveTemplate(q: QueueDraft, index: number): QueueDraft {
  if (q.templateIds.length <= 1) return q;
  return { ...q, templateIds: q.templateIds.filter((_, i) => i !== index) };
}

export function queueMoveTemplate(q: QueueDraft, index: number, direction: -1 | 1): QueueDraft {
  const j = index + direction;
  if (index < 0 || index >= q.templateIds.length || j < 0 || j >= q.templateIds.length) return q;
  const ids = [...q.templateIds];
  [ids[index], ids[j]] = [ids[j]!, ids[index]!];
  return { ...q, templateIds: ids };
}

/** «Начать с…» и «Новый цикл»: позиция задаётся вручную и действует до первой завершённой тренировки очереди. */
export function queueSetPosition(q: QueueDraft, position: number, now: number): QueueDraft {
  return { ...q, override: { position: Math.max(0, Math.min(position, q.templateIds.length - 1)), setAt: now } };
}

/** «Новый цикл» — следующая тренировка снова первая. */
export const queueNewCycle = (q: QueueDraft, now: number): QueueDraft => queueSetPosition(q, 0, now);

/**
 * «Сделать следующим» для комплекса. Комплекса нет в очереди (например, короткий #004) — он вставляется
 * на текущую позицию, чтобы стать следующим, не сбивая остальной порядок.
 */
export function complexMakeNext(q: ComplexQueueDraft, complexId: string, currentPosition: number, now: number): ComplexQueueDraft {
  const at = q.order.indexOf(complexId);
  if (at >= 0) return { ...q, override: { position: at, setAt: now } };
  const pos = Math.min(Math.max(currentPosition, 0), q.order.length);
  const order = [...q.order.slice(0, pos), complexId, ...q.order.slice(pos)];
  return { ...q, order, override: { position: pos, setAt: now } };
}
