import type { ComplexRecord, ConditioningResult, SessionRecord } from '@splav/shared';
import { attempts, bestAttempt, isTimeFormat, type Attempt } from './complexResults.ts';

type Format = ComplexRecord['format'];
type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/**
 * Число для графика результатов. «На время» — секунды (меньше лучше), AMRAP и остальные — раунды
 * (без добора: он не имеет общей меры у разных комплексов), иначе общее число повторов. Нет числа — null.
 */
export function chartValue(format: Format, r: ConditioningResult): number | null {
  if (isTimeFormat(format)) return r.timeSec !== undefined && r.finished !== false ? r.timeSec : null;
  return r.rounds ?? r.totalReps ?? null;
}

export interface ComplexSummary {
  complexId: string;
  title: string;
  format: Format;
  attempts: number;
  lastDate: string | null;
  best: Attempt | null;
}

/** Комплексы библиотеки с числом попыток; сделанные — первыми (недавние выше), потом остальные по номеру. */
export function complexSummaries(complexes: readonly Pick<ComplexRecord, 'id' | 'title' | 'format'>[], sessions: readonly S[]): ComplexSummary[] {
  return complexes
    .map((c) => {
      const list = attempts(c.id, sessions);
      return { complexId: c.id, title: c.title, format: c.format, attempts: list.length, lastDate: list[0]?.date ?? null, best: bestAttempt(list) };
    })
    .sort((a, b) => {
      if ((a.attempts > 0) !== (b.attempts > 0)) return a.attempts > 0 ? -1 : 1;
      return (b.lastDate ?? '').localeCompare(a.lastDate ?? '') || a.complexId.localeCompare(b.complexId);
    });
}
