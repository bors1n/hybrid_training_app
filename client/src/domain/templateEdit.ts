import type { ComplexRecord, PlanSets, TemplateBlock, TemplateRecord } from '@splav/shared';
import { MODALITY_LABELS } from './sessionEdit.ts';

/** Шаблон в редакторе: без полей синхронизации, их добавляет saveRecord. */
export type TemplateDraft = Omit<TemplateRecord, 'updatedAt' | 'deletedAt'>;
type Strength = Extract<TemplateBlock, { type: 'strength' }>;
type Cardio = Extract<TemplateBlock, { type: 'cardio' }>;
type Conditioning = Extract<TemplateBlock, { type: 'conditioning' }>;
type Mobility = Extract<TemplateBlock, { type: 'mobility' }>;

const uuid = (): string => crypto.randomUUID();

export function newTemplate(id: string = uuid(), title = 'Новый шаблон'): TemplateDraft {
  return { id, title, blocks: [] };
}

export function updateTemplate(t: TemplateDraft, patch: Partial<Pick<TemplateDraft, 'title' | 'subtitle' | 'durationHint'>>): TemplateDraft {
  const next = { ...t, ...patch };
  for (const k of ['subtitle', 'durationHint'] as const) if (next[k] === undefined || next[k] === '') delete next[k];
  return next;
}

function mapBlock(t: TemplateDraft, blockId: string, fn: (b: TemplateBlock) => TemplateBlock): TemplateDraft {
  return { ...t, blocks: t.blocks.map((b) => (b.id === blockId ? fn(b) : b)) };
}

/** Диапазоны не должны быть «перевёрнутыми»: верх не меньше низа. Править можно любую границу. */
function normalizePlan(p: PlanSets, changed: Partial<PlanSets>): PlanSets {
  const next = { ...p };
  if (next.repsMin !== undefined && next.repsMax !== undefined && next.repsMax < next.repsMin) {
    if ('repsMin' in changed) next.repsMax = next.repsMin;
    else next.repsMin = next.repsMax;
  }
  if (next.weightKg !== undefined && next.weightKgMax !== undefined && next.weightKgMax < next.weightKg) {
    if ('weightKg' in changed) next.weightKgMax = next.weightKg;
    else next.weightKg = next.weightKgMax;
  }
  return next;
}

/* ---------------------------------- силовые ---------------------------------- */

export const DEFAULT_PLAN: PlanSets = { sets: 3, load: 'normal' };

export function addStrengthBlock(t: TemplateDraft, exerciseId: string, perSide = false, id: string = uuid()): TemplateDraft {
  const block: Strength = {
    type: 'strength', id, superset: false,
    items: [{ exerciseId, plan: { ...DEFAULT_PLAN, ...(perSide ? { perSide: true } : {}) } }],
  };
  return { ...t, blocks: [...t.blocks, block] };
}

/** Добавить упражнение в силовой блок; блок из одного упражнения становится суперсетом. */
export function addItemToBlock(t: TemplateDraft, blockId: string, exerciseId: string, perSide = false): TemplateDraft {
  return mapBlock(t, blockId, (b) =>
    b.type === 'strength'
      ? { ...b, superset: true, items: [...b.items, { exerciseId, plan: { ...DEFAULT_PLAN, ...(perSide ? { perSide: true } : {}) } }] }
      : b,
  );
}

export type PlanPatch = { [K in keyof PlanSets]?: PlanSets[K] | undefined };

/** Правка плановых значений; `undefined` очищает поле, число подходов не меньше одного. */
export function updateItemPlan(t: TemplateDraft, blockId: string, itemIndex: number, patch: PlanPatch): TemplateDraft {
  return mapBlock(t, blockId, (b) => {
    if (b.type !== 'strength') return b;
    return {
      ...b,
      items: b.items.map((item, i) => {
        if (i !== itemIndex) return item;
        const merged: PlanSets = { ...item.plan, ...(patch as Partial<PlanSets>) };
        for (const k of Object.keys(patch) as (keyof PlanSets)[]) if (patch[k] === undefined) delete merged[k];
        if (merged.sets < 1) merged.sets = 1;
        return { ...item, plan: normalizePlan(merged, patch as Partial<PlanSets>) };
      }),
    };
  });
}

export function setItemNote(t: TemplateDraft, blockId: string, itemIndex: number, note: string): TemplateDraft {
  return mapBlock(t, blockId, (b) =>
    b.type === 'strength'
      ? {
          ...b,
          items: b.items.map((item, i) => {
            if (i !== itemIndex) return item;
            const { note: _old, ...rest } = item;
            return note.trim() === '' ? rest : { ...rest, note };
          }),
        }
      : b,
  );
}

/** Убрать упражнение; блок без упражнений удаляется, суперсет из одного упражнения становится обычным блоком. */
export function removeItem(t: TemplateDraft, blockId: string, itemIndex: number): TemplateDraft {
  const blocks = t.blocks.flatMap((b): TemplateBlock[] => {
    if (b.id !== blockId || b.type !== 'strength') return [b];
    const items = b.items.filter((_, i) => i !== itemIndex);
    return items.length === 0 ? [] : [{ ...b, items, superset: items.length > 1 }];
  });
  return { ...t, blocks };
}

/* ----------------------------------- кардио ----------------------------------- */

export function addCardio(t: TemplateDraft, modality: Cardio['modality'], role: Cardio['role'] = 'main', id: string = uuid()): TemplateDraft {
  const block: Cardio = { type: 'cardio', id, modality, role, name: MODALITY_LABELS[modality] };
  return { ...t, blocks: [...t.blocks, block] };
}

export type CardioPatch = { [K in 'modality' | 'role' | 'name' | 'durationSec' | 'durationSecMax' | 'note']?: Cardio[K] | undefined };

export function updateCardio(t: TemplateDraft, blockId: string, patch: CardioPatch): TemplateDraft {
  return mapBlock(t, blockId, (b) => {
    if (b.type !== 'cardio') return b;
    const next: Cardio = { ...b, ...(patch as Partial<Cardio>) };
    for (const k of ['name', 'durationSec', 'durationSecMax', 'note'] as const) if (next[k] === undefined || next[k] === '') delete next[k];
    if (next.durationSec !== undefined && next.durationSecMax !== undefined && next.durationSecMax < next.durationSec) {
      if ('durationSec' in patch) next.durationSecMax = next.durationSec;
      else next.durationSec = next.durationSecMax;
    }
    return next;
  });
}

/* ---------------------------------- комплексы ---------------------------------- */

/** Блок «следующий комплекс из очереди». */
export function addQueuedComplex(t: TemplateDraft, id: string = uuid()): TemplateDraft {
  const block: Conditioning = { type: 'conditioning', id, fromQueue: true };
  return { ...t, blocks: [...t.blocks, block] };
}

/** Блок с конкретным комплексом из библиотеки или своим (без номера). */
export function addFixedComplex(
  t: TemplateDraft,
  c: Pick<ComplexRecord, 'id' | 'title' | 'format' | 'timeCapMin' | 'description'> | { name: string; format: NonNullable<Conditioning['format']>; description?: string },
  id: string = uuid(),
): TemplateDraft {
  const block: Conditioning =
    'title' in c
      ? { type: 'conditioning', id, fromQueue: false, complexId: c.id, name: c.title, format: c.format, ...(c.timeCapMin !== undefined ? { timeCapMin: c.timeCapMin } : {}), description: c.description }
      : { type: 'conditioning', id, fromQueue: false, name: c.name, format: c.format, ...(c.description ? { description: c.description } : {}) };
  return { ...t, blocks: [...t.blocks, block] };
}

export function updateConditioning(t: TemplateDraft, blockId: string, patch: { name?: string | undefined; complexId?: string | undefined; format?: Conditioning['format'] | undefined; timeCapMin?: number | undefined; description?: string | undefined; fromQueue?: boolean }): TemplateDraft {
  return mapBlock(t, blockId, (b) => {
    if (b.type !== 'conditioning') return b;
    const next: Conditioning = { ...b, ...(patch as Partial<Conditioning>) };
    for (const k of ['name', 'complexId', 'format', 'timeCapMin', 'description'] as const) if (next[k] === undefined || next[k] === '') delete next[k];
    return next;
  });
}

/* --------------------------------- мобильность --------------------------------- */

export function addMobility(t: TemplateDraft, exerciseId: string, id: string = uuid()): TemplateDraft {
  const block: Mobility = { type: 'mobility', id, items: [{ exerciseId }] };
  return { ...t, blocks: [...t.blocks, block] };
}

export function addMobilityItem(t: TemplateDraft, blockId: string, exerciseId: string): TemplateDraft {
  return mapBlock(t, blockId, (b) => (b.type === 'mobility' ? { ...b, items: [...b.items, { exerciseId }] } : b));
}

export function removeMobilityItem(t: TemplateDraft, blockId: string, itemIndex: number): TemplateDraft {
  const blocks = t.blocks.flatMap((b): TemplateBlock[] => {
    if (b.id !== blockId || b.type !== 'mobility') return [b];
    const items = b.items.filter((_, i) => i !== itemIndex);
    return items.length === 0 ? [] : [{ ...b, items }];
  });
  return { ...t, blocks };
}

export function updateMobility(t: TemplateDraft, blockId: string, patch: { durationSec?: number | undefined; durationSecMax?: number | undefined }): TemplateDraft {
  return mapBlock(t, blockId, (b) => {
    if (b.type !== 'mobility') return b;
    const next: Mobility = { ...b, ...(patch as Partial<Mobility>) };
    for (const k of ['durationSec', 'durationSecMax'] as const) if (next[k] === undefined) delete next[k];
    if (next.durationSec !== undefined && next.durationSecMax !== undefined && next.durationSecMax < next.durationSec) {
      if ('durationSec' in patch) next.durationSecMax = next.durationSec;
      else next.durationSec = next.durationSecMax;
    }
    return next;
  });
}

/* ------------------------------------ блоки ------------------------------------ */

export function removeBlock(t: TemplateDraft, blockId: string): TemplateDraft {
  return { ...t, blocks: t.blocks.filter((b) => b.id !== blockId) };
}

export function moveBlock(t: TemplateDraft, blockId: string, direction: -1 | 1): TemplateDraft {
  const i = t.blocks.findIndex((b) => b.id === blockId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= t.blocks.length) return t;
  const blocks = [...t.blocks];
  [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  return { ...t, blocks };
}

/** «7 упражнений · кардио · комплекс» для строки очереди. */
export function templateSummary(t: Pick<TemplateDraft, 'blocks'>): string {
  const exercises = t.blocks.reduce((n, b) => n + (b.type === 'strength' ? b.items.length : 0), 0);
  const cardio = t.blocks.some((b) => b.type === 'cardio');
  const complex = t.blocks.some((b) => b.type === 'conditioning');
  const mobility = t.blocks.some((b) => b.type === 'mobility');
  const word = exercises % 10 === 1 && exercises % 100 !== 11 ? 'упражнение' : exercises % 10 >= 2 && exercises % 10 <= 4 && (exercises % 100 < 12 || exercises % 100 > 14) ? 'упражнения' : 'упражнений';
  return [exercises > 0 ? `${exercises} ${word}` : null, cardio ? 'кардио' : null, complex ? 'комплекс' : null, mobility ? 'мобильность' : null].filter(Boolean).join(' · ') || 'пусто';
}
