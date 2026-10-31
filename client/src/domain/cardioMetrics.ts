import type { CardioBlock, SessionRecord } from '@hybridlog/shared';
import { compareSessionsAsc } from './lastPerformance.ts';
import { paceFromDistanceTime } from './units.ts';
import { lastWeeks, weekStart } from './weeks.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

export const CARDIO_GROUPS = ['run', 'bike', 'other'] as const;
export type CardioGroup = (typeof CARDIO_GROUPS)[number];

export const CARDIO_GROUP_LABELS: Record<CardioGroup, string> = { run: 'Бег', bike: 'Вело', other: 'Другое' };

/** «Бег» — улица и дорожка, «Вело» — велосипед и велотренажёр, остальное — «Другое». */
export function cardioGroup(modality: CardioBlock['modality']): CardioGroup {
  if (modality === 'run' || modality === 'treadmill') return 'run';
  if (modality === 'bike' || modality === 'indoor_bike') return 'bike';
  return 'other';
}

export interface CardioEntry {
  sessionId: string;
  date: string;
  block: CardioBlock;
  group: CardioGroup;
  /** Темп, с/км: с часов, если он записан, иначе расчётный. */
  paceSecPerKm: number | null;
  /** Скорость, км/ч. */
  speedKmh: number | null;
}

/** Показанный темп: с часов, иначе сохранённый расчётный, иначе считаем по дистанции и времени. */
export function shownPace(b: Pick<CardioBlock, 'recordedPace' | 'paceSecPerKm' | 'distanceM' | 'durationSec'>): number | null {
  if (b.recordedPace !== undefined) return b.recordedPace;
  if (b.paceSecPerKm !== undefined) return b.paceSecPerKm;
  return b.distanceM !== undefined && b.durationSec !== undefined ? paceFromDistanceTime(b.distanceM, b.durationSec) : null;
}

/** Все кардио-блоки с дистанцией или временем, от старых к новым. */
export function cardioEntries(sessions: readonly S[]): CardioEntry[] {
  const out: CardioEntry[] = [];
  for (const s of [...sessions].filter((x) => x.deletedAt === null).sort(compareSessionsAsc)) {
    for (const b of s.blocks) {
      if (b.type !== 'cardio') continue;
      if (b.distanceM === undefined && b.durationSec === undefined) continue;
      const pace = shownPace(b);
      const speed = b.distanceM && b.durationSec ? b.distanceM / 1000 / (b.durationSec / 3600) : null;
      out.push({ sessionId: s.id, date: s.date, block: b, group: cardioGroup(b.modality), paceSecPerKm: pace, speedKmh: speed });
    }
  }
  return out;
}

/** Фильтр вкладки «Выносливость»: «Все» или одна группа. */
export type CardioFilter = CardioGroup | 'all';

const inFilter = (e: CardioEntry, filter: CardioFilter): boolean => filter === 'all' || e.group === filter;

export interface WeeklyCardio {
  week: string;
  km: number;
  minutes: number;
}

/**
 * Км и минуты по неделям. В объёмы входят все роли (разминка и финиш тоже время на ногах),
 * в темп — только main (см. {@link paceSeries}). Недели без кардио пропускаются.
 */
export function weeklyCardio(entries: readonly CardioEntry[], group: CardioFilter): WeeklyCardio[] {
  const map = new Map<string, { m: number; sec: number }>();
  for (const e of entries) {
    if (!inFilter(e, group)) continue;
    const w = weekStart(e.date);
    const cur = map.get(w) ?? { m: 0, sec: 0 };
    cur.m += e.block.distanceM ?? 0;
    cur.sec += e.block.durationSec ?? 0;
    map.set(w, cur);
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, km: Math.round(v.m / 10) / 100, minutes: Math.round(v.sec / 60) }));
}

/** Те же объёмы на сетке из `count` последних недель: недели без кардио — нули (для графиков с линией). */
export function weeklyCardioFilled(entries: readonly CardioEntry[], group: CardioFilter, today: string, count = 12): WeeklyCardio[] {
  const byWeek = new Map(weeklyCardio(entries, group).map((w) => [w.week, w]));
  return lastWeeks(today, count).map((week) => byWeek.get(week) ?? { week, km: 0, minutes: 0 });
}

export interface CardioTotals {
  km: number;
  minutes: number;
  /** Число кардио-записей (блоков, в которых есть дистанция или время). */
  count: number;
}

/** Итоги по выбранной группе за всё время; в объём входят все роли, как в {@link weeklyCardio}. */
export function cardioTotals(entries: readonly CardioEntry[], group: CardioFilter): CardioTotals {
  let m = 0;
  let sec = 0;
  let count = 0;
  for (const e of entries) {
    if (!inFilter(e, group)) continue;
    m += e.block.distanceM ?? 0;
    sec += e.block.durationSec ?? 0;
    count += 1;
  }
  return { km: Math.round(m / 10) / 100, minutes: Math.round(sec / 60), count };
}

export interface PacePoint {
  sessionId: string;
  date: string;
  distanceM: number;
  durationSec: number;
  paceSecPerKm: number;
  speedKmh: number;
}

/** Темп по тренировкам: только основная часть (role = main) с дистанцией и временем. */
export function paceSeries(entries: readonly CardioEntry[], group: CardioGroup): PacePoint[] {
  return entries.flatMap((e) => {
    const { block } = e;
    if (e.group !== group || block.role !== 'main' || !block.distanceM || !block.durationSec || e.paceSecPerKm === null) return [];
    return [{ sessionId: e.sessionId, date: e.date, distanceM: block.distanceM, durationSec: block.durationSec, paceSecPerKm: e.paceSecPerKm, speedKmh: e.speedKmh ?? 0 }];
  });
}

export interface CardioBests {
  longestDistance: PacePoint | null;
  longestTime: PacePoint | null;
  /** Лучший темп на дистанции от 1 км: короткий рывок темпом не считается. */
  bestPace: PacePoint | null;
  fastestSpeed: PacePoint | null;
}

export const MIN_PACE_DISTANCE_M = 1000;

/** Лучшие результаты по основной части; при равенстве — более ранний. */
export function cardioBests(points: readonly PacePoint[]): CardioBests {
  const pick = (better: (a: PacePoint, b: PacePoint) => boolean, pool: readonly PacePoint[] = points): PacePoint | null =>
    pool.reduce<PacePoint | null>((best, p) => (best === null || better(p, best) ? p : best), null);
  const long = points.filter((p) => p.distanceM >= MIN_PACE_DISTANCE_M);
  return {
    longestDistance: pick((a, b) => a.distanceM > b.distanceM),
    longestTime: pick((a, b) => a.durationSec > b.durationSec),
    bestPace: pick((a, b) => a.paceSecPerKm < b.paceSecPerKm, long),
    fastestSpeed: pick((a, b) => a.speedKmh > b.speedKmh, long),
  };
}
