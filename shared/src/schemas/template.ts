import { z } from 'zod';
import { NoteSchema, RepsSchema, WeightKgSchema, DurationSecSchema, syncFields } from './common.ts';
import { CardioRoleSchema, ComplexFormatSchema, LoadSchema, ModalitySchema } from './session.ts';

/** Плановые значения подходов. Это ориентир, а не требование: приложение ничего не предписывает. */
export const PlanSetsSchema = z.object({
  sets: z.number().int().min(1).max(30),
  repsMin: RepsSchema.optional(),
  /** Верх диапазона, если он есть: «6–8» → repsMin 6, repsMax 8. */
  repsMax: RepsSchema.optional(),
  weightKg: WeightKgSchema.optional(),
  weightKgMax: WeightKgSchema.optional(),
  perSide: z.boolean().optional(),
  durationSec: DurationSecSchema.optional(),
  load: LoadSchema.default('normal'),
});
export type PlanSets = z.infer<typeof PlanSetsSchema>;

export const PlanItemSchema = z.object({
  exerciseId: z.string().min(1),
  plan: PlanSetsSchema,
  note: NoteSchema.optional(),
});

/** Входит ли блок в короткую версию тренировки (кнопка «Короткая»). */
const inShort = z.boolean().default(true);

export const TemplateStrengthBlockSchema = z.object({
  type: z.literal('strength'),
  id: z.string().min(1),
  superset: z.boolean().default(false),
  items: z.array(PlanItemSchema).min(1).max(10),
  inShort,
});

export const TemplateCardioBlockSchema = z.object({
  type: z.literal('cardio'),
  id: z.string().min(1),
  modality: ModalitySchema,
  role: CardioRoleSchema.default('main'),
  name: z.string().trim().min(1).max(200).optional(),
  durationSec: DurationSecSchema.optional(),
  durationSecMax: DurationSecSchema.optional(),
  note: NoteSchema.optional(),
  inShort,
});

export const TemplateConditioningBlockSchema = z.object({
  type: z.literal('conditioning'),
  id: z.string().min(1),
  /** true — подставляется следующий комплекс из очереди комплексов. */
  fromQueue: z.boolean().default(false),
  complexId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  format: ComplexFormatSchema.optional(),
  timeCapMin: z.number().min(0).max(600).optional(),
  description: z.string().max(4000).optional(),
  inShort,
});

export const TemplateMobilityBlockSchema = z.object({
  type: z.literal('mobility'),
  id: z.string().min(1),
  items: z
    .array(z.object({ exerciseId: z.string().min(1), durationSec: DurationSecSchema.optional(), note: NoteSchema.optional() }))
    .min(1)
    .max(30),
  durationSec: DurationSecSchema.optional(),
  durationSecMax: DurationSecSchema.optional(),
  inShort,
});

export const TemplateBlockSchema = z.discriminatedUnion('type', [
  TemplateStrengthBlockSchema,
  TemplateCardioBlockSchema,
  TemplateConditioningBlockSchema,
  TemplateMobilityBlockSchema,
]);
export type TemplateBlock = z.infer<typeof TemplateBlockSchema>;

export const TemplateRecordSchema = z.object({
  ...syncFields,
  title: z.string().trim().min(1).max(200),
  /** «Всё тело A». */
  subtitle: z.string().max(200).optional(),
  /** «около 65–70 мин». */
  durationHint: z.string().max(200).optional(),
  blocks: z.array(TemplateBlockSchema).max(50),
});
export type TemplateRecord = z.infer<typeof TemplateRecordSchema>;
