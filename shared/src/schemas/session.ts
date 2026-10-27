import { z } from 'zod';
import { DateStringSchema, DurationSecSchema, NoteSchema, RepsSchema, RpeSchema, WeightKgSchema, syncFields } from './common.ts';

export const LOADS = ['normal', 'added', 'assisted'] as const;
/** normal — обычный вес; added — отягощение (+10 кг на поясе); assisted — противовес (гравитрон). */
export const LoadSchema = z.enum(LOADS);

export const SetSchema = z.object({
  weightKg: WeightKgSchema.optional(),
  reps: RepsSchema.optional(),
  durationSec: DurationSecSchema.optional(),
  perSide: z.boolean().optional(),
  rpe: RpeSchema.optional(),
  done: z.boolean().default(false),
  load: LoadSchema.default('normal'),
});
export type SetEntry = z.infer<typeof SetSchema>;

export const StrengthItemSchema = z.object({
  exerciseId: z.string().min(1),
  sets: z.array(SetSchema).max(100),
  note: NoteSchema.optional(),
});
export type StrengthItem = z.infer<typeof StrengthItemSchema>;

export const StrengthBlockSchema = z.object({
  type: z.literal('strength'),
  id: z.string().min(1),
  /** Суперсет: несколько упражнений в общей карточке с кругами. */
  superset: z.boolean().default(false),
  items: z.array(StrengthItemSchema).min(1).max(10),
});

export const MODALITIES = ['run', 'treadmill', 'bike', 'indoor_bike', 'skierg', 'row', 'stairs', 'walk', 'other'] as const;
export const ModalitySchema = z.enum(MODALITIES);
export const CARDIO_ROLES = ['main', 'warmup', 'finisher'] as const;
export const CardioRoleSchema = z.enum(CARDIO_ROLES);

export const CardioBlockSchema = z.object({
  type: z.literal('cardio'),
  id: z.string().min(1),
  modality: ModalitySchema,
  /** Название для экспорта (колонка `exercise`): «Бег», «Велотренажёр». */
  name: z.string().trim().min(1).max(200).optional(),
  distanceM: z.number().min(0).max(1_000_000).optional(),
  durationSec: DurationSecSchema.optional(),
  /** Расчётный темп, с/км. Хранится всегда, когда есть дистанция и время. */
  paceSecPerKm: z.number().positive().max(7200).optional(),
  /** Темп с часов, если отличается от расчётного. На экране показывается он. */
  recordedPace: z.number().positive().max(7200).optional(),
  avgHr: z.number().int().min(30).max(250).optional(),
  floors: z.number().int().min(0).max(10_000).optional(),
  inclinePct: z.number().min(0).max(40).optional(),
  rpe: RpeSchema.optional(),
  /** Разминка не смешивается с пробежкой: темп считается только по main. */
  role: CardioRoleSchema.default('main'),
  notes: NoteSchema.optional(),
});
export type CardioBlock = z.infer<typeof CardioBlockSchema>;

export const FORMATS = ['AMRAP', 'EMOM', 'FOR_TIME', 'TABATA', 'INTERVALS', 'LADDER', 'ROUNDS', 'OTHER'] as const;
export const ComplexFormatSchema = z.enum(FORMATS);

export const ConditioningResultSchema = z.object({
  rounds: z.number().int().min(0).max(1000).optional(),
  extraReps: z.number().int().min(0).max(10_000).optional(),
  totalReps: z.number().int().min(0).max(100_000).optional(),
  timeSec: DurationSecSchema.optional(),
  finished: z.boolean().optional(),
});
export type ConditioningResult = z.infer<typeof ConditioningResultSchema>;

export const ConditioningBlockSchema = z.object({
  type: z.literal('conditioning'),
  id: z.string().min(1),
  /** Ссылка на библиотеку: '#005'. */
  complexId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  format: ComplexFormatSchema,
  timeCapMin: z.number().min(0).max(600).optional(),
  description: z.string().max(4000).optional(),
  result: ConditioningResultSchema.default({}),
  rpe: RpeSchema.optional(),
  notes: NoteSchema.optional(),
});
export type ConditioningBlock = z.infer<typeof ConditioningBlockSchema>;

export const MobilityItemSchema = z.object({
  exerciseId: z.string().min(1),
  sets: z.array(SetSchema).max(100).default([]),
  durationSec: DurationSecSchema.optional(),
  note: NoteSchema.optional(),
});

export const MobilityBlockSchema = z.object({
  type: z.literal('mobility'),
  id: z.string().min(1),
  items: z.array(MobilityItemSchema).min(1).max(30),
  /** Общее время блока, если оно записано отдельно от упражнений. */
  durationSec: DurationSecSchema.optional(),
});
export type MobilityBlock = z.infer<typeof MobilityBlockSchema>;

export const BlockSchema = z.discriminatedUnion('type', [
  StrengthBlockSchema,
  CardioBlockSchema,
  ConditioningBlockSchema,
  MobilityBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;
export type StrengthBlock = z.infer<typeof StrengthBlockSchema>;

export const SESSION_TYPES = ['strength', 'cardio', 'conditioning', 'mobility', 'mixed'] as const;
export const SessionTypeSchema = z.enum(SESSION_TYPES);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const SessionRecordSchema = z.object({
  ...syncFields,
  date: DateStringSchema,
  title: z.string().trim().min(1).max(200),
  type: SessionTypeSchema,
  /** Начало и конец по часам телефона; завершённой считается тренировка с finishedAt. */
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  durationMin: z.number().min(0).max(1440).optional(),
  /** RPE всей тренировки. */
  rpe: RpeSchema.optional(),
  notes: NoteSchema.optional(),
  /** Если тренировка начата из шаблона очереди: сдвигает очередь только она. */
  templateId: z.string().min(1).optional(),
  queueId: z.string().min(1).optional(),
  queueSlot: z.number().int().min(0).max(1000).optional(),
  blocks: z.array(BlockSchema).max(50),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
