import type { ConditioningBlock, ConditioningResult, SessionRecord } from '@splav/shared';
import { compareSessionsAsc } from './lastPerformance.ts';
import { formatDuration } from './units.ts';

type Format = ConditioningBlock['format'];

const TIME_FORMATS: ReadonlySet<Format> = new Set(['FOR_TIME', 'ROUNDS', 'LADDER']);

/** Форматы, где результат — время: чем меньше, тем лучше. */
export const isTimeFormat = (f: Format): boolean => TIME_FORMATS.has(f);

/**
 * Число для сравнения результатов: больше — лучше. null — результата нет.
 * AMRAP и остальные — раунды и повторы сверху; «на время» — время (завершённый всегда лучше незавершённого).
 */
export function resultScore(format: Format, r: ConditioningResult): number | null {
  if (isTimeFormat(format)) {
    if (r.timeSec !== undefined && r.finished !== false) return 1e8 - r.timeSec;
    // Не уложился: сравниваем по тому, сколько успел.
    const done = r.totalReps ?? (r.rounds !== undefined ? r.rounds * 1000 + (r.extraReps ?? 0) : undefined);
    return done === undefined ? null : done;
  }
  if (r.rounds !== undefined) return r.rounds * 10_000 + (r.extraReps ?? 0);
  if (r.totalReps !== undefined) return r.totalReps;
  return null;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «9 раундов», «7 + 14», «12:35», «не уложился», «184 повтора». */
export function formatResult(format: Format, r: ConditioningResult): string {
  if (isTimeFormat(format) && r.timeSec !== undefined) {
    return r.finished === false ? `не уложился · ${formatDuration(r.timeSec)}` : formatDuration(r.timeSec);
  }
  if (isTimeFormat(format) && r.finished === false) return 'не уложился';
  if (r.rounds !== undefined) {
    return r.extraReps ? `${r.rounds} + ${r.extraReps}` : `${r.rounds} ${plural(r.rounds, 'раунд', 'раунда', 'раундов')}`;
  }
  if (r.totalReps !== undefined) return `${r.totalReps} ${plural(r.totalReps, 'повтор', 'повтора', 'повторов')}`;
  return '—';
}

export interface Attempt {
  sessionId: string;
  date: string;
  block: ConditioningBlock;
  score: number | null;
}

type SessionForAttempts = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/** Попытки комплекса из библиотеки, от новых к старым. Незавершённые тренировки и пустые результаты не считаются. */
export function attempts(complexId: string, sessions: readonly SessionForAttempts[], opts: { excludeSessionId?: string } = {}): Attempt[] {
  const out: (Attempt & { s: SessionForAttempts })[] = [];
  for (const s of sessions) {
    if (s.deletedAt !== null || s.id === opts.excludeSessionId) continue;
    for (const b of s.blocks) {
      if (b.type !== 'conditioning' || b.complexId !== complexId) continue;
      const score = resultScore(b.format, b.result);
      if (score === null) continue;
      out.push({ sessionId: s.id, date: s.date, block: b, score, s });
    }
  }
  return out.sort((a, b) => compareSessionsAsc(b.s, a.s)).map(({ s: _s, ...a }) => a);
}

/** Последний выполненный комплекс: любой блок с результатом, в том числе свой (без номера из библиотеки). */
export function lastComplexAttempt(sessions: readonly SessionForAttempts[]): Attempt | null {
  const ordered = sessions.filter((s) => s.deletedAt === null).sort((a, b) => compareSessionsAsc(b, a));
  for (const s of ordered) {
    for (const b of [...s.blocks].reverse()) {
      if (b.type !== 'conditioning') continue;
      const score = resultScore(b.format, b.result);
      if (score !== null) return { sessionId: s.id, date: s.date, block: b, score };
    }
  }
  return null;
}

/** Лучшая попытка; при равенстве — более ранняя (рекорд поставлен тогда). */
export function bestAttempt(list: readonly Attempt[]): Attempt | null {
  let best: Attempt | null = null;
  for (const a of [...list].reverse()) {
    if (a.score !== null && (best === null || (best.score !== null && a.score > best.score))) best = a;
  }
  return best;
}
