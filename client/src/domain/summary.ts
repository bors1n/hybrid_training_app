import type { SessionRecord } from '@splav/shared';

export interface SessionSummary {
  /** Тоннаж, кг: сумма вес × повторы по выполненным подходам с обычным весом. */
  tonnageKg: number;
  /** Дистанция всех кардио-блоков, м (разминки и финиши входят). */
  distanceM: number;
  /** Время всех кардио-блоков, с. */
  cardioSec: number;
  doneSets: number;
  totalSets: number;
  blocks: number;
}

type SessionLike = Pick<SessionRecord, 'blocks'>;

/**
 * Итоги тренировки. Считаются только выполненные подходы (done): «+ Подход» копирует прошлый,
 * а невыполненная копия не должна попадать в статистику. Подходы с отягощением (added) и противовесом
 * (assisted) в тоннаж не входят — собственный вес неизвестен. Если повторы на сторону — считаем обе.
 */
export function summarize(session: SessionLike): SessionSummary {
  let tonnageKg = 0;
  let distanceM = 0;
  let cardioSec = 0;
  let doneSets = 0;
  let totalSets = 0;

  for (const b of session.blocks) {
    if (b.type === 'strength') {
      for (const item of b.items) {
        for (const s of item.sets) {
          totalSets += 1;
          if (!s.done) continue;
          doneSets += 1;
          if (s.load === 'normal' && s.weightKg !== undefined && s.reps !== undefined) {
            tonnageKg += s.weightKg * s.reps * (s.perSide ? 2 : 1);
          }
        }
      }
    } else if (b.type === 'cardio') {
      distanceM += b.distanceM ?? 0;
      cardioSec += b.durationSec ?? 0;
    }
  }
  return { tonnageKg: Math.round(tonnageKg * 100) / 100, distanceM, cardioSec, doneSets, totalSets, blocks: session.blocks.length };
}

/** Длительность тренировки, мин: введённая вручную, иначе по часам, если тренировка шла в один день. */
export function sessionDurationMin(s: Pick<SessionRecord, 'durationMin' | 'startedAt' | 'finishedAt'>): number | null {
  if (s.durationMin !== undefined) return s.durationMin;
  if (s.startedAt !== undefined && s.finishedAt !== undefined && s.finishedAt >= s.startedAt) {
    const min = (s.finishedAt - s.startedAt) / 60_000;
    if (min < 12 * 60) return Math.max(1, Math.round(min));
  }
  return null;
}

/** Число невыполненных подходов с введёнными значениями (то, о чём спросим при завершении). */
export function countPendingSets(session: SessionLike): number {
  let n = 0;
  for (const b of session.blocks) {
    if (b.type !== 'strength') continue;
    for (const item of b.items) for (const s of item.sets) if (!s.done) n += 1;
  }
  return n;
}
