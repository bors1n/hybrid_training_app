import type { ComplexQueueRecord, QueueRecord, SessionRecord } from '@splav/shared';
import { compareSessionsAsc } from './lastPerformance.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt' | 'finishedAt' | 'queueId' | 'queueSlot'>;

export interface QueueState {
  /** Номер слота (0-based) следующей тренировки. */
  position: number;
  templateId: string;
  /** Номер цикла, к которому относится следующая тренировка (с 1). */
  cycle: number;
  /** Сколько тренировок этой очереди завершено. */
  completed: number;
  /** Слот → дата завершения в текущем цикле (для подписи «23 окт» в очереди). */
  doneInCycle: Readonly<Record<number, string>>;
}

const byFinished = (a: S, b: S): number => (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || compareSessionsAsc(a, b);

/**
 * Состояние очереди шаблонов (Т1 → Т2 → Т3). Позиция не хранится, а вычисляется из завершённых
 * тренировок этой очереди: следующая — после слота последней завершённой. Поэтому свободные тренировки,
 * пробежки, незавершённые и удалённые тренировки очередь не двигают, а удаление последней — возвращает назад.
 * Ручной выбор («Новый цикл», «начать с…») действует, пока после него не завершена тренировка очереди.
 */
export function queueState(queue: Pick<QueueRecord, 'id' | 'templateIds' | 'override'>, sessions: readonly S[]): QueueState | null {
  const n = queue.templateIds.length;
  if (n === 0) return null;

  const completed = sessions
    .filter((s) => s.deletedAt === null && s.queueId === queue.id && s.finishedAt !== undefined && s.queueSlot !== undefined)
    .sort(byFinished);

  let cycle = 1;
  let prev: number | null = null;
  let done: Record<number, string> = {};
  for (const s of completed) {
    const slot = s.queueSlot! % n;
    // Слот не больше предыдущего — начался новый круг (в том числе после пропуска).
    if (prev !== null && slot <= prev) {
      cycle += 1;
      done = {};
    }
    done[slot] = s.date;
    prev = slot;
  }

  let position = prev === null ? 0 : (prev + 1) % n;
  const o = queue.override;
  if (o && !completed.some((s) => s.finishedAt! > o.setAt)) position = o.position % n;

  const wraps = prev !== null && position <= prev;
  return {
    position,
    templateId: queue.templateIds[position]!,
    cycle: wraps ? cycle + 1 : cycle,
    completed: completed.length,
    doneInCycle: wraps ? {} : done,
  };
}

export interface ComplexQueueState {
  position: number;
  /** Номер из библиотеки: '#005'. */
  complexId: string;
}

/**
 * Следующий комплекс: очередь сдвигается, когда завершена тренировка с блоком комплекса, равным ожидаемому
 * (в любой тренировке, не только из очереди). Другие комплексы очередь не двигают. Ручной выбор действует
 * от момента `setAt`: учитываются только тренировки, завершённые после него.
 */
export function complexQueueState(queue: Pick<ComplexQueueRecord, 'order' | 'override'>, sessions: readonly S[]): ComplexQueueState | null {
  const n = queue.order.length;
  if (n === 0) return null;
  const o = queue.override;
  let pos = o ? o.position % n : 0;
  const since = o?.setAt ?? -Infinity;

  const completed = sessions
    .filter((s) => s.deletedAt === null && s.finishedAt !== undefined && s.finishedAt > since)
    .sort(byFinished);
  for (const s of completed) {
    for (const b of s.blocks) {
      if (b.type === 'conditioning' && b.complexId === queue.order[pos]) pos = (pos + 1) % n;
    }
  }
  return { position: pos, complexId: queue.order[pos]! };
}
