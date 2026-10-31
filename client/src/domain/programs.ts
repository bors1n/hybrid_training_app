import type { ComplexQueueRecord, ProgramRecord, QueueRecord, SettingsRecord } from '@hybridlog/shared';

export const BASIC_PROGRAM_ID = 'seed:program:basic';

/**
 * Активная программа: выбранная в настройках, а если её нет (не выбрана или удалена) — базовая,
 * а если и её нет — первая по id. Без программ — null.
 */
export function activeProgram<P extends Pick<ProgramRecord, 'id'>>(programs: readonly P[], settings: Pick<SettingsRecord, 'activeProgramId'> | null | undefined): P | null {
  const picked = settings?.activeProgramId;
  return programs.find((p) => p.id === picked) ?? programs.find((p) => p.id === BASIC_PROGRAM_ID) ?? programs[0] ?? null;
}

export interface ProgramSummary {
  templates: number;
  complexes: number;
}

/** Размер программы для карточки списка. */
export function programSummary(queue: Pick<QueueRecord, 'templateIds'> | undefined, complexQueue: Pick<ComplexQueueRecord, 'order'> | undefined): ProgramSummary {
  return { templates: queue?.templateIds.length ?? 0, complexes: complexQueue?.order.length ?? 0 };
}

/** Добавляет комплекс в конец очереди комплексов; повтор не создаёт дубля. */
export function complexQueueAdd<Q extends { order: string[] }>(q: Q, complexId: string): Q {
  return q.order.includes(complexId) ? q : { ...q, order: [...q.order, complexId] };
}

/** Убирает комплекс из очереди; ручная позиция сбрасывается, чтобы не указывала мимо. */
export function complexQueueRemove<Q extends { order: string[]; override?: unknown }>(q: Q, complexId: string): Q {
  if (!q.order.includes(complexId)) return q;
  const { override: _o, ...rest } = q;
  return { ...rest, order: q.order.filter((id) => id !== complexId) } as unknown as Q;
}
