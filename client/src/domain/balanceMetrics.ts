import type { SessionRecord, SessionType } from '@hybridlog/shared';
import { resultScore } from './complexResults.ts';
import { sessionDurationMin } from './summary.ts';
import { addDays, addWeeks, lastWeeks, weekStart } from './weeks.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'type' | 'blocks' | 'durationMin' | 'startedAt' | 'finishedAt' | 'deletedAt'>;

const live = <T extends Pick<SessionRecord, 'deletedAt'>>(sessions: readonly T[]): T[] => sessions.filter((s) => s.deletedAt === null);

export interface SessionMinutes {
  strength: number;
  cardio: number;
  conditioning: number;
  mobility: number;
}

/**
 * Минуты тренировки по видам. Кардио, комплекс и мобильность берутся из своих блоков.
 * Силовые минуты — остаток: длительность тренировки (введённая или по часам) минус известные минуты
 * остальных блоков. Нет длительности — силовые минуты неизвестны и не считаются (0), а не выдумываются.
 */
export function sessionMinutes(s: S): SessionMinutes {
  let cardioSec = 0;
  let conditioningSec = 0;
  let mobilitySec = 0;
  let hasStrength = false;
  for (const b of s.blocks) {
    if (b.type === 'strength') hasStrength ||= b.items.some((i) => i.sets.some((x) => x.done));
    else if (b.type === 'cardio') cardioSec += b.durationSec ?? 0;
    else if (b.type === 'conditioning') conditioningSec += b.result.timeSec ?? (b.timeCapMin ?? 0) * 60;
    else mobilitySec += b.durationSec ?? b.items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0);
  }
  const cardio = Math.round(cardioSec / 60);
  const conditioning = Math.round(conditioningSec / 60);
  const mobility = Math.round(mobilitySec / 60);
  const total = sessionDurationMin(s);
  const strength = hasStrength && total !== null ? Math.max(0, Math.round(total) - cardio - conditioning - mobility) : 0;
  return { strength, cardio, conditioning, mobility };
}

export interface WeekBalance {
  week: string;
  /** Тренировки по типам. */
  sessions: Record<SessionType, number>;
  sessionsTotal: number;
  minutes: SessionMinutes;
}

const emptyTypes = (): Record<SessionType, number> => ({ strength: 0, cardio: 0, conditioning: 0, mobility: 0, mixed: 0 });

/** Баланс по неделям за последние `count` недель (включая текущую); пустые недели остаются нулями. */
export function weeklyBalance(sessions: readonly S[], today: string, count = 12): WeekBalance[] {
  const weeks = lastWeeks(today, count);
  const map = new Map<string, WeekBalance>(
    weeks.map((week) => [week, { week, sessions: emptyTypes(), sessionsTotal: 0, minutes: { strength: 0, cardio: 0, conditioning: 0, mobility: 0 } }]),
  );
  for (const s of live(sessions)) {
    const w = map.get(weekStart(s.date));
    if (!w) continue;
    w.sessions[s.type] += 1;
    w.sessionsTotal += 1;
    const m = sessionMinutes(s);
    w.minutes.strength += m.strength;
    w.minutes.cardio += m.cardio;
    w.minutes.conditioning += m.conditioning;
    w.minutes.mobility += m.mobility;
  }
  return weeks.map((w) => map.get(w)!);
}

/** Окно баланса «сила — выносливость»: последние четыре недели, включая текущую. */
export const BALANCE_WEEKS = 4;

export interface StrengthEnduranceBalance {
  /** Тренировки с выполненными силовыми подходами. */
  strength: number;
  /** Тренировки с кардио (есть дистанция или время) или комплексом с результатом. */
  endurance: number;
  /** С какого дня (понедельник) считается окно. */
  from: string;
}

export const hasStrengthWork = (s: Pick<S, 'blocks'>): boolean =>
  s.blocks.some((b) => b.type === 'strength' && b.items.some((i) => i.sets.some((x) => x.done)));

export const hasEnduranceWork = (s: Pick<S, 'blocks'>): boolean =>
  s.blocks.some(
    (b) =>
      (b.type === 'cardio' && (b.distanceM !== undefined || b.durationSec !== undefined)) ||
      (b.type === 'conditioning' && resultScore(b.format, b.result) !== null),
  );

/**
 * Баланс по числу тренировок, не по минутам: сила против выносливости (кардио + комплексы).
 * Смешанная тренировка (сила и кардио) идёт в обе стороны; мобильность не учитывается.
 */
export function strengthEnduranceBalance(sessions: readonly S[], today: string): StrengthEnduranceBalance {
  const from = lastWeeks(today, BALANCE_WEEKS)[0]!;
  let strength = 0;
  let endurance = 0;
  for (const s of live(sessions)) {
    if (s.date < from || s.date > today) continue;
    if (hasStrengthWork(s)) strength += 1;
    if (hasEnduranceWork(s)) endurance += 1;
  }
  return { strength, endurance, from };
}

export interface HeatDay {
  date: string;
  /** Число тренировок в этот день. */
  count: number;
  /** Дата позже сегодняшней: клетка рисуется пустой. */
  future: boolean;
}

/** Теплокарта показывает полгода: 26 недель. */
export const HEATMAP_WEEKS = 26;

/**
 * Теплокарта: колонки — недели (от старых к новым), в каждой семь дней с понедельника.
 * Последняя колонка — текущая неделя.
 */
export function heatmap(sessions: readonly S[], today: string, weeks = HEATMAP_WEEKS): HeatDay[][] {
  const counts = new Map<string, number>();
  for (const s of live(sessions)) counts.set(s.date, (counts.get(s.date) ?? 0) + 1);
  return lastWeeks(today, weeks).map((monday) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, count: counts.get(date) ?? 0, future: date > today };
    }),
  );
}

/** Уровень насыщенности клетки теплокарты: 0 — пусто, 1 — одна тренировка, 2 — две, 3 — три и больше. */
export const heatLevel = (count: number): 0 | 1 | 2 | 3 => (count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3);

export interface Streak {
  /** Недель подряд с тренировками, считая назад от текущей. */
  current: number;
  longest: number;
}

/**
 * Недели подряд, в которых была хотя бы одна тренировка. Если на текущей неделе тренировок ещё нет,
 * серия не обрывается: неделя не закончилась, считаем от прошлой.
 */
export function weekStreak(sessions: readonly S[], today: string): Streak {
  const trained = new Set(live(sessions).map((s) => weekStart(s.date)));
  if (trained.size === 0) return { current: 0, longest: 0 };

  const thisWeek = weekStart(today);
  let current = 0;
  for (let w = trained.has(thisWeek) ? thisWeek : addWeeks(thisWeek, -1); trained.has(w); w = addWeeks(w, -1)) current += 1;

  let longest = 0;
  let run = 0;
  const sorted = [...trained].sort();
  for (let i = 0; i < sorted.length; i += 1) {
    run = i > 0 && addWeeks(sorted[i - 1]!, 1) === sorted[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}
