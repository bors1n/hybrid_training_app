import type { SessionRecord } from '@hybridlog/shared';
import { exerciseSeries, trainedExercises } from './strengthMetrics.ts';
import { formatDecimal, formatWeightReps } from './units.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

export interface FrequentExercise {
  exerciseId: string;
  /** «1ПМ 104 кг», иначе последний лучший подход «80 × 8»; null — нечего показать. */
  headline: string | null;
}

/** Расчётный 1ПМ (лучший) обычного веса; нет — лучший подход последней тренировки; нет и его — null. */
export function exerciseHeadline(exerciseId: string, sessions: readonly S[]): string | null {
  const series = exerciseSeries(exerciseId, sessions);
  const normal = series.find((s) => s.load === 'normal');
  const best1rm = normal ? Math.max(0, ...normal.sessions.map((x) => x.e1rmKg ?? 0)) : 0;
  if (best1rm > 0) return `1ПМ ${formatDecimal(best1rm, 1)} кг`;
  const any = series[0];
  const last = any?.sessions.at(-1);
  if (!last) return null;
  const top = [...last.sets].filter((x) => x.weightKg !== undefined || x.reps !== undefined).sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
  return top ? formatWeightReps(top.weightKg, top.reps) : null;
}

/** Упражнения, которые делают чаще всего (число тренировок, затем свежесть). */
export function frequentExercises(sessions: readonly S[], limit = 5): FrequentExercise[] {
  return [...trainedExercises(sessions)]
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate) || a.exerciseId.localeCompare(b.exerciseId))
    .slice(0, limit)
    .map((t) => ({ exerciseId: t.exerciseId, headline: exerciseHeadline(t.exerciseId, sessions) }));
}
