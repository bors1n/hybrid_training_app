import { z } from 'zod';
import { NoteSchema, syncFields } from './common.ts';

export const EXERCISE_KINDS = ['strength', 'bodyweight', 'cardio', 'core', 'mobility'] as const;
export const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'smith', 'bodyweight', 'band', 'erg', 'none'] as const;
export const METRICS = ['weight_reps', 'reps', 'time', 'distance_time'] as const;

export const ExerciseKindSchema = z.enum(EXERCISE_KINDS);
export const EquipmentSchema = z.enum(EQUIPMENT);
export const MetricsSchema = z.enum(METRICS);

/** Картинка из каталога; источник и лицензия хранятся, чтобы слой медиа можно было заменить. */
export const ExerciseMediaSchema = z.object({
  /** Путь относительно корня приложения, например `/media/repdb/flat/arnold-press-peak.webp`. */
  image: z.string().min(1),
  /** Вторая поза (начало движения), если есть. */
  imageStart: z.string().min(1).optional(),
  source: z.string().min(1),
  license: z.string().min(1),
});

/** Содержимое упражнения. Каталог (RepDB и встроенные свои) статичен и в базе не хранится. */
export const ExerciseContentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Другие написания: «Тяга горизонтальная (seated row)», «Присед», английское название. */
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  kind: ExerciseKindSchema,
  equipment: EquipmentSchema,
  muscles: z.object({
    primary: z.array(z.string()).default([]),
    secondary: z.array(z.string()).default([]),
  }),
  /** Выпады, тяга одной рукой: повторы считаются на каждую сторону. */
  perSide: z.boolean().default(false),
  metrics: MetricsSchema,
  media: ExerciseMediaSchema.optional(),
  /** Постоянная заметка автора: настройка тренажёра, угол и т. п. */
  note: NoteSchema.optional(),
  isCustom: z.boolean().default(false),
});
export type ExerciseContent = z.infer<typeof ExerciseContentSchema>;

/** Элемент каталога: упражнение с идентификатором (`repdb:*`, `hybridlog:*`). */
export const CatalogExerciseSchema = ExerciseContentSchema.extend({ id: z.string().min(1) });
export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;

/** Созданное пользователем упражнение: синхронизируется. */
export const ExerciseRecordSchema = ExerciseContentSchema.extend({ ...syncFields, isCustom: z.literal(true) });
export type ExerciseRecord = z.infer<typeof ExerciseRecordSchema>;

/** Постоянная заметка к упражнению каталога. id записи = id упражнения. */
export const ExerciseNoteRecordSchema = z.object({
  ...syncFields,
  exerciseId: z.string().min(1),
  text: NoteSchema,
});
export type ExerciseNoteRecord = z.infer<typeof ExerciseNoteRecordSchema>;

/** Запомненное при импорте сопоставление «моё название → упражнение». id = `alias:` + нормализованное название. */
export const ExerciseAliasRecordSchema = z.object({
  ...syncFields,
  alias: z.string().trim().min(1).max(200),
  exerciseId: z.string().min(1),
});
export type ExerciseAliasRecord = z.infer<typeof ExerciseAliasRecordSchema>;
