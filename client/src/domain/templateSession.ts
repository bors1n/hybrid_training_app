import type { Block, ComplexRecord, SessionRecord, SetEntry, TemplateBlock, TemplateRecord } from '@splav/shared';
import { lastPerformance } from './lastPerformance.ts';
import { MODALITY_LABELS, type SessionDraft } from './sessionEdit.ts';
import { deriveSessionType } from './sessionType.ts';

type TemplateLike = Pick<TemplateRecord, 'id' | 'title' | 'blocks'>;

export interface FromTemplateOptions {
  date: string;
  now: number;
  /** Очередь, из которой начата тренировка: завершение этой тренировки сдвигает её. */
  queue?: { id: string; slot: number };
  /** Журнал — для прошлых результатов. */
  sessions: readonly SessionRecord[];
  /** Следующий комплекс из очереди комплексов (для блока «комплекс из очереди»). */
  nextComplex?: Pick<ComplexRecord, 'id' | 'title' | 'format' | 'timeCapMin' | 'description'> | null;
  id: string;
}

/**
 * Тренировка из шаблона. Подходы предзаполняются прошлым результатом (копия того, что человек делал сам),
 * а если упражнения раньше не было — ориентиром из шаблона. Всё не отмечено выполненным: человек вносит
 * и подтверждает сам. Никаких рекомендаций: приложение ничего не прибавляет к прошлому весу.
 */
export function sessionFromTemplate(t: TemplateLike, o: FromTemplateOptions): SessionDraft {
  const blocks = t.blocks.map((b, i) => buildBlock(b, `${o.id}:${i}`, o));
  return {
    id: o.id,
    date: o.date,
    title: t.title,
    type: deriveSessionType(blocks),
    startedAt: o.now,
    templateId: t.id,
    ...(o.queue ? { queueId: o.queue.id, queueSlot: o.queue.slot } : {}),
    blocks,
  };
}

function buildBlock(b: TemplateBlock, id: string, o: FromTemplateOptions): Block {
  if (b.type === 'strength') {
    return {
      type: 'strength',
      id,
      superset: b.items.length > 1,
      items: b.items.map((item) => {
        const { plan } = item;
        const last = lastPerformance(item.exerciseId, o.sessions, { onOrBefore: o.date, excludeSessionId: o.id });
        const sets: SetEntry[] = Array.from({ length: plan.sets }, (_, i) => {
          const set: SetEntry = { done: false, load: plan.load };
          const prev = last ? (last.sets[i] ?? last.sets.at(-1)) : undefined;
          if (prev) {
            // Вес прошлого раза имеет смысл, только если нагрузка той же (отягощение и противовес не смешиваем).
            if (prev.weightKg !== undefined && prev.load === plan.load) set.weightKg = prev.weightKg;
            if (prev.reps !== undefined) set.reps = prev.reps;
            if (prev.durationSec !== undefined) set.durationSec = prev.durationSec;
          } else {
            if (plan.weightKg !== undefined) set.weightKg = plan.weightKg;
            if (plan.durationSec !== undefined) set.durationSec = plan.durationSec;
          }
          if (plan.perSide) set.perSide = true;
          return set;
        });
        return { exerciseId: item.exerciseId, sets, ...(item.note ? { note: item.note } : {}) };
      }),
    };
  }

  if (b.type === 'cardio') {
    return { type: 'cardio', id, modality: b.modality, role: b.role, name: b.name ?? MODALITY_LABELS[b.modality] };
  }

  if (b.type === 'conditioning') {
    if (b.fromQueue) {
      const c = o.nextComplex;
      return c
        ? {
            type: 'conditioning',
            id,
            complexId: c.id,
            name: c.title,
            format: c.format,
            ...(c.timeCapMin !== undefined ? { timeCapMin: c.timeCapMin } : {}),
            description: c.description,
            result: {},
          }
        : { type: 'conditioning', id, name: 'Комплекс', format: b.format ?? 'AMRAP', result: {} };
    }
    return {
      type: 'conditioning',
      id,
      format: b.format ?? 'OTHER',
      result: {},
      ...(b.complexId ? { complexId: b.complexId } : {}),
      ...(b.name ? { name: b.name } : {}),
      ...(b.timeCapMin !== undefined ? { timeCapMin: b.timeCapMin } : {}),
      ...(b.description ? { description: b.description } : {}),
    };
  }

  return {
    type: 'mobility',
    id,
    items: b.items.map((i) => ({ exerciseId: i.exerciseId, sets: [], ...(i.durationSec !== undefined ? { durationSec: i.durationSec } : {}), ...(i.note ? { note: i.note } : {}) })),
  };
}

/** Блок-заготовка, в который так ничего и не внесли: кардио без дистанции, времени и заметки; комплекс без результата. */
export function isEmptyBlock(b: Block): boolean {
  if (b.type === 'cardio') return b.distanceM === undefined && b.durationSec === undefined && !b.notes;
  if (b.type === 'conditioning') return Object.keys(b.result).length === 0 && b.rpe === undefined && !b.notes;
  return false;
}

/** Убрать заготовки, которые остались пустыми (разминка из шаблона, которую не делали). Возвращает и число убранных. */
export function dropEmptyBlocks(s: SessionDraft): { session: SessionDraft; dropped: number } {
  const blocks = s.blocks.filter((b) => !isEmptyBlock(b));
  const dropped = s.blocks.length - blocks.length;
  return dropped === 0 ? { session: s, dropped } : { session: { ...s, blocks, type: deriveSessionType(blocks) }, dropped };
}
