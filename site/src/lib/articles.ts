/** Чистые функции для статей: рубрики, время чтения, даты, порядок. Здесь нет Astro — их можно проверять обычными тестами. */

export const RUBRICS = [
  { key: 'programs', label: 'Программы' },
  { key: 'running', label: 'Бег' },
  { key: 'strength', label: 'Силовые' },
  { key: 'complexes', label: 'Комплексы' },
  { key: 'recovery', label: 'Восстановление' },
] as const;

export type RubricKey = (typeof RUBRICS)[number]['key'];
export const RUBRIC_KEYS = RUBRICS.map((r) => r.key) as [RubricKey, ...RubricKey[]];

export function rubricLabel(key: RubricKey): string {
  return RUBRICS.find((r) => r.key === key)!.label;
}

export function rubricPath(key: RubricKey): string {
  return `/rubrics/${key}/`;
}

const WORDS_PER_MINUTE = 180;

/** Время чтения по тексту (русский — около 180 слов в минуту), не меньше минуты. Разметка Markdown в счёт не идёт. */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, ' ');
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 2026-10-28 → «28 октября 2026». */
export function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Дата для атрибута `datetime`. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface Dated {
  date: Date;
  title: string;
}

/** От новых к старым; при одной дате — по названию, чтобы порядок не зависел от порядка чтения файлов. */
export function newestFirst<T extends Dated>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.date.getTime() - a.date.getTime() || a.title.localeCompare(b.title, 'ru'));
}
