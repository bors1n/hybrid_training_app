import { z } from 'zod';

/** Поля, которые есть у каждой синхронизируемой записи. Время — миллисекунды Unix. */
export const syncFields = {
  id: z.string().min(1).max(200),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
};

/** Дата тренировки: YYYY-MM-DD в часовом поясе пользователя. */
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД').refine(
  (s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  },
  'Такой даты нет',
);

/** RPE: целое 1–10; пустое значение допустимо (поле просто отсутствует). */
export const RpeSchema = z.number().int().min(1).max(10);

export const WeightKgSchema = z.number().min(0).max(1000);
export const RepsSchema = z.number().int().min(0).max(10_000);
export const DurationSecSchema = z.number().int().min(0).max(48 * 3600);

/** Единицы хранения: кг, метры, секунды, с/км. Форматирование — только на экране. */
export const NoteSchema = z.string().max(2000);
