import type { SessionRecord, SetEntry } from '@splav/shared';
import { formatDecimal, formatDuration, formatWeightReps } from './units.ts';

export interface Performance {
  sessionId: string;
  date: string;
  sets: SetEntry[];
}

type SessionForHistory = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/** Хронологический порядок: дата, затем время начала, затем время правки. */
export function compareSessionsAsc(a: SessionForHistory, b: SessionForHistory): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.startedAt ?? a.updatedAt) - (b.startedAt ?? b.updatedAt) ||
    a.updatedAt - b.updatedAt
  );
}

/**
 * Прошлый результат упражнения: выполненные подходы из последней тренировки, где оно было.
 * `onOrBefore` ограничивает дату: при внесении тренировки задним числом «прошлым» считается то,
 * что было до неё, а не после. Саму редактируемую тренировку исключаем.
 */
export function lastPerformance(
  exerciseId: string,
  sessions: readonly SessionForHistory[],
  opts: { excludeSessionId?: string; onOrBefore?: string } = {},
): Performance | null {
  const candidates = sessions
    .filter((s) => s.deletedAt === null && s.id !== opts.excludeSessionId && (!opts.onOrBefore || s.date <= opts.onOrBefore))
    .sort(compareSessionsAsc)
    .reverse();

  for (const s of candidates) {
    const sets: SetEntry[] = [];
    for (const b of s.blocks) {
      if (b.type !== 'strength') continue;
      for (const item of b.items) {
        if (item.exerciseId !== exerciseId) continue;
        sets.push(...item.sets.filter((x) => x.done && (x.reps !== undefined || x.durationSec !== undefined)));
      }
    }
    if (sets.length > 0) return { sessionId: s.id, date: s.date, sets };
  }
  return null;
}

/** «85 кг × 8», «+10 кг × 8», «18,5 кг (противовес) × 12», «1:30». */
export function formatSet(s: Pick<SetEntry, 'weightKg' | 'reps' | 'durationSec' | 'load'>): string {
  if (s.weightKg === undefined && s.reps === undefined && s.durationSec !== undefined) return formatDuration(s.durationSec);
  if (s.weightKg !== undefined && s.load === 'added') {
    return `+${formatDecimal(s.weightKg)} кг${s.reps !== undefined ? ` × ${s.reps}` : ''}`;
  }
  if (s.weightKg !== undefined && s.load === 'assisted') {
    return `${formatDecimal(s.weightKg)} кг (противовес)${s.reps !== undefined ? ` × ${s.reps}` : ''}`;
  }
  return formatWeightReps(s.weightKg, s.reps);
}

/** «85 × 8 · 85 × 8 · 85 × 7»: подряд идущие одинаковые подходы не сворачиваем — важен порядок. */
export function formatPerformance(sets: readonly SetEntry[]): string {
  return sets.map(formatSet).join(' · ');
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «20 окт»; год добавляется, если он не текущий. */
export function formatDateShort(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return String(y) === today.slice(0, 4) ? base : `${base} ${y}`;
}
