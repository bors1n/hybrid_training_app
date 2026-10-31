import type { ComplexRecord, ConditioningResult, SessionRecord } from '@hybridlog/shared';
import { attempts, bestAttempt, isTimeFormat, resultScore, type Attempt } from './complexResults.ts';
import { compareSessionsAsc } from './lastPerformance.ts';

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

export interface ComplexTotals {
  /** Выполнено комплексов: блоки с результатом, в том числе свои (без номера из библиотеки). */
  done: number;
  /** Повторы, которые записал человек: `totalReps`, а если его нет — добор `extraReps`. Из раундов повторы не выводятся. */
  reps: number;
  rounds: number;
}

export function complexTotals(sessions: readonly S[]): ComplexTotals {
  const totals = { done: 0, reps: 0, rounds: 0 };
  for (const s of sessions) {
    if (s.deletedAt !== null) continue;
    for (const b of s.blocks) {
      if (b.type !== 'conditioning' || resultScore(b.format, b.result) === null) continue;
      totals.done += 1;
      totals.reps += b.result.totalReps ?? b.result.extraReps ?? 0;
      totals.rounds += b.result.rounds ?? 0;
    }
  }
  return totals;
}

export interface ComplexFeedItem {
  sessionId: string;
  blockId: string;
  date: string;
  /** «#005 · Название», либо только название, либо «Комплекс». */
  title: string;
  format: Format;
  result: ConditioningResult;
  /** Лучшая из нескольких попыток одного комплекса библиотеки. */
  record: boolean;
}

/**
 * Лента выполненных комплексов, новые сверху. Каждая карточка — комплекс и одно его выполнение,
 * повторы одного комплекса идут отдельными карточками.
 */
export function complexFeed(sessions: readonly S[]): ComplexFeedItem[] {
  const ordered = sessions.filter((s) => s.deletedAt === null).sort((a, b) => compareSessionsAsc(b, a));
  const bests = new Map<string, Attempt | null>();
  const out: ComplexFeedItem[] = [];
  for (const s of ordered) {
    for (const b of [...s.blocks].reverse()) {
      if (b.type !== 'conditioning' || resultScore(b.format, b.result) === null) continue;
      let record = false;
      if (b.complexId) {
        if (!bests.has(b.complexId)) {
          const list = attempts(b.complexId, sessions);
          bests.set(b.complexId, list.length > 1 ? bestAttempt(list) : null);
        }
        const best = bests.get(b.complexId);
        record = best?.sessionId === s.id && best.block.id === b.id;
      }
      out.push({
        sessionId: s.id,
        blockId: b.id,
        date: s.date,
        title: [b.complexId, b.name].filter(Boolean).join(' · ') || 'Комплекс',
        format: b.format,
        result: b.result,
        record,
      });
    }
  }
  return out;
}
