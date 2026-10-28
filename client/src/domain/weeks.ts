/** Даты ГГГГ-ММ-ДД как календарные дни, без часовых поясов: арифметика идёт через UTC. */

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const DAY = 86_400_000;

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY);
}

/** Понедельник недели, в которую попадает дата. Неделя — с понедельника по воскресенье. */
export function weekStart(date: string): string {
  const dow = (new Date(toUtc(date)).getUTCDay() + 6) % 7; // пн = 0
  return addDays(date, -dow);
}

export function addWeeks(week: string, weeks: number): string {
  return addDays(week, weeks * 7);
}

/** Понедельники последних `count` недель, заканчивая неделей даты `today`; от старых к новым. */
export function lastWeeks(today: string, count: number): string[] {
  const last = weekStart(today);
  return Array.from({ length: count }, (_, i) => addWeeks(last, i - count + 1));
}

/** Разница в днях: b − a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «20 окт». */
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]}`;
}
