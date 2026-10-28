import type { SessionRecord, SetEntry } from '@splav/shared';
import { compareSessionsAsc } from './lastPerformance.ts';
import { weekStart } from './weeks.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/** Расчётный 1ПМ только по подходам не длиннее 12 повторов: дальше формула врёт. */
export const E1RM_MAX_REPS = 12;

/** Формула Эпли: вес × (1 + повторы / 30). Один повтор — сам вес. */
export function epley(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Тип нагрузки как отдельная серия: «+10 кг» и «−18,5 кг в гравитроне» нельзя смешивать. */
export type LoadKind = SetEntry['load'];

export interface ExerciseSession {
  sessionId: string;
  date: string;
  /** Выполненные подходы этого типа нагрузки. */
  sets: SetEntry[];
  /** Рабочий вес: наибольший вес подхода. */
  topWeightKg: number | null;
  /** Расчётный 1ПМ, только обычный вес и ≤ 12 повторов. */
  e1rmKg: number | null;
  tonnageKg: number;
  /** Средний RPE подходов, где он указан. */
  avgRpe: number | null;
}

export interface BestByReps {
  reps: number;
  weightKg: number;
  date: string;
}

export interface ExerciseSeries {
  load: LoadKind;
  sessions: ExerciseSession[];
  /** Лучший вес на каждое число повторов, по возрастанию повторов. */
  bestByReps: BestByReps[];
  avgRpe: number | null;
  setsCount: number;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : round1(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Прогресс одного упражнения, по сериям: обычный вес, отягощение (added), противовес (assisted).
 * Считаются только выполненные подходы. Тоннаж — только у обычного веса: вес тела неизвестен.
 * Серии без подходов не возвращаются; сессии внутри серии — от старых к новым.
 */
export function exerciseSeries(exerciseId: string, sessions: readonly S[]): ExerciseSeries[] {
  const sorted = sessions.filter((s) => s.deletedAt === null).sort(compareSessionsAsc);
  const byLoad = new Map<LoadKind, ExerciseSession[]>();

  for (const s of sorted) {
    const perLoad = new Map<LoadKind, SetEntry[]>();
    for (const b of s.blocks) {
      if (b.type !== 'strength') continue;
      for (const item of b.items) {
        if (item.exerciseId !== exerciseId) continue;
        for (const set of item.sets) {
          if (!set.done) continue;
          perLoad.set(set.load, [...(perLoad.get(set.load) ?? []), set]);
        }
      }
    }
    for (const [load, sets] of perLoad) {
      const weights = sets.flatMap((x) => (x.weightKg !== undefined ? [x.weightKg] : []));
      const e1rms =
        load === 'normal'
          ? sets.flatMap((x) =>
              x.weightKg !== undefined && x.reps !== undefined && x.reps >= 1 && x.reps <= E1RM_MAX_REPS ? [epley(x.weightKg, x.reps)] : [],
            )
          : [];
      const tonnage =
        load === 'normal'
          ? sets.reduce((sum, x) => sum + (x.weightKg !== undefined && x.reps !== undefined ? x.weightKg * x.reps * (x.perSide ? 2 : 1) : 0), 0)
          : 0;
      const entry: ExerciseSession = {
        sessionId: s.id,
        date: s.date,
        sets,
        topWeightKg: weights.length ? Math.max(...weights) : null,
        e1rmKg: e1rms.length ? round1(Math.max(...e1rms)) : null,
        tonnageKg: Math.round(tonnage * 100) / 100,
        avgRpe: mean(sets.flatMap((x) => (x.rpe !== undefined ? [x.rpe] : []))),
      };
      byLoad.set(load, [...(byLoad.get(load) ?? []), entry]);
    }
  }

  const order: LoadKind[] = ['normal', 'added', 'assisted'];
  return order.flatMap((load) => {
    const list = byLoad.get(load);
    if (!list) return [];
    const best = new Map<number, BestByReps>();
    const rpes: number[] = [];
    let setsCount = 0;
    for (const entry of list) {
      for (const set of entry.sets) {
        setsCount += 1;
        if (set.rpe !== undefined) rpes.push(set.rpe);
        if (set.weightKg === undefined || set.reps === undefined) continue;
        const cur = best.get(set.reps);
        if (!cur || set.weightKg > cur.weightKg) best.set(set.reps, { reps: set.reps, weightKg: set.weightKg, date: entry.date });
      }
    }
    return [{ load, sessions: list, bestByReps: [...best.values()].sort((a, b) => a.reps - b.reps), avgRpe: mean(rpes), setsCount }];
  });
}

export interface WeeklyTonnage {
  week: string;
  tonnageKg: number;
}

/** Тоннаж упражнения по неделям (обычный вес); недели без работы пропускаются. */
export function weeklyTonnage(series: ExerciseSeries): WeeklyTonnage[] {
  const map = new Map<string, number>();
  for (const s of series.sessions) {
    const w = weekStart(s.date);
    map.set(w, (map.get(w) ?? 0) + s.tonnageKg);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([week, tonnageKg]) => ({ week, tonnageKg: Math.round(tonnageKg * 100) / 100 }));
}

export interface ExerciseUsage {
  exerciseId: string;
  sessions: number;
  lastDate: string;
}

/** Упражнения, по которым есть выполненные подходы: сначала те, что делали недавно. */
export function trainedExercises(sessions: readonly S[]): ExerciseUsage[] {
  const map = new Map<string, { ids: Set<string>; last: string }>();
  for (const s of sessions) {
    if (s.deletedAt !== null) continue;
    for (const b of s.blocks) {
      if (b.type !== 'strength') continue;
      for (const item of b.items) {
        if (!item.sets.some((x) => x.done)) continue;
        const cur = map.get(item.exerciseId) ?? { ids: new Set(), last: '' };
        cur.ids.add(s.id);
        if (s.date > cur.last) cur.last = s.date;
        map.set(item.exerciseId, cur);
      }
    }
  }
  return [...map]
    .map(([exerciseId, v]) => ({ exerciseId, sessions: v.ids.size, lastDate: v.last }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.sessions - a.sessions || a.exerciseId.localeCompare(b.exerciseId));
}

export interface SetRef {
  weightKg: number;
  reps: number;
  date: string;
}

/** Рекордный подход серии: наибольший расчётный 1ПМ (≤ 12 повторов), иначе наибольший вес. Ничья — более ранний. */
export function recordSet(series: ExerciseSeries): SetRef | null {
  let best: { ref: SetRef; score: number } | null = null;
  for (const s of series.sessions) {
    for (const x of s.sets) {
      if (x.weightKg === undefined || x.reps === undefined) continue;
      const score = series.load === 'normal' && x.reps >= 1 && x.reps <= E1RM_MAX_REPS ? epley(x.weightKg, x.reps) : x.weightKg;
      if (best === null || score > best.score) best = { ref: { weightKg: x.weightKg, reps: x.reps, date: s.date }, score };
    }
  }
  return best?.ref ?? null;
}

/** Главный подход последней тренировки серии: самый тяжёлый, при равенстве — с большим числом повторов. */
export function lastTopSet(series: ExerciseSeries): SetRef | null {
  const last = series.sessions.at(-1);
  if (!last) return null;
  const sets = last.sets.filter((x): x is SetEntry & { weightKg: number; reps: number } => x.weightKg !== undefined && x.reps !== undefined);
  const top = sets.sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0];
  return top ? { weightKg: top.weightKg, reps: top.reps, date: last.date } : null;
}
