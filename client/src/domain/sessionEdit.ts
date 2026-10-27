import type {
  Block,
  CardioBlock,
  ConditioningBlock,
  ConditioningResult,
  MobilityBlock,
  SessionRecord,
  SetEntry,
  StrengthBlock,
} from '@splav/shared';
import { deriveSessionType } from './sessionType.ts';
import { paceFromDistanceTime } from './units.ts';

/** Тренировка в редакторе: без полей синхронизации, их добавляет saveRecord. */
export type SessionDraft = Omit<SessionRecord, 'updatedAt' | 'deletedAt'>;

type Modality = CardioBlock['modality'];
type Role = CardioBlock['role'];
type Load = SetEntry['load'];

const uuid = (): string => crypto.randomUUID();

export const MODALITY_LABELS: Record<Modality, string> = {
  run: 'Бег',
  treadmill: 'Дорожка',
  bike: 'Велосипед',
  indoor_bike: 'Велотренажёр',
  skierg: 'SkiErg',
  row: 'Гребля',
  stairs: 'Лестница',
  walk: 'Ходьба',
  other: 'Другое',
};

export const ROLE_LABELS: Record<Role, string> = { main: 'Основное', warmup: 'Разминка', finisher: 'Финиш' };
export const LOAD_LABELS: Record<Load, string> = { normal: 'Обычный вес', added: 'С отягощением', assisted: 'Противовес' };

/** Любая правка пересчитывает тип тренировки: он всегда согласован с блоками. */
function withType(s: SessionDraft): SessionDraft {
  return { ...s, type: deriveSessionType(s.blocks) };
}

function mapBlock(s: SessionDraft, blockId: string, fn: (b: Block) => Block): SessionDraft {
  return withType({ ...s, blocks: s.blocks.map((b) => (b.id === blockId ? fn(b) : b)) });
}

/** Новая тренировка. Название по умолчанию общее; шаблоны и очередь задают своё (этап 4). */
export function newSession(date: string, now: number, id: string = uuid()): SessionDraft {
  return { id, date, title: 'Тренировка', type: 'mixed', startedAt: now, blocks: [] };
}

export function updateSession(
  s: SessionDraft,
  patch: Partial<Pick<SessionDraft, 'title' | 'date' | 'notes' | 'rpe' | 'durationMin'>>,
): SessionDraft {
  const next = { ...s, ...patch };
  // Пустые значения убираем из записи, а не храним как undefined.
  for (const k of ['notes', 'rpe', 'durationMin'] as const) if (next[k] === undefined) delete next[k];
  return next;
}

/* ---------------------------------- силовые ---------------------------------- */

export const emptySet = (load: Load = 'normal'): SetEntry => ({ done: false, load });

/** Копия подхода для «+ Подход»: вес, повторы, время и нагрузка; отметка и RPE не переносятся. */
export function copySet(prev: SetEntry): SetEntry {
  const next: SetEntry = { done: false, load: prev.load };
  if (prev.weightKg !== undefined) next.weightKg = prev.weightKg;
  if (prev.reps !== undefined) next.reps = prev.reps;
  if (prev.durationSec !== undefined) next.durationSec = prev.durationSec;
  if (prev.perSide !== undefined) next.perSide = prev.perSide;
  return next;
}

export interface NewItem {
  exerciseId: string;
  /** Подходы, с которых начинаем (например, копия прошлого результата). По умолчанию — один пустой. */
  sets?: SetEntry[];
  perSide?: boolean;
}

const makeItem = ({ exerciseId, sets, perSide }: NewItem) => ({
  exerciseId,
  sets: (sets && sets.length > 0 ? sets : [emptySet()]).map((x) => (perSide !== undefined && x.perSide === undefined ? { ...x, perSide } : x)),
});

export function addStrengthBlock(s: SessionDraft, item: NewItem, id: string = uuid()): SessionDraft {
  const block: StrengthBlock = { type: 'strength', id, superset: false, items: [makeItem(item)] };
  return withType({ ...s, blocks: [...s.blocks, block] });
}

/** Суперсет: несколько упражнений в общей карточке. */
export function addSupersetBlock(s: SessionDraft, items: NewItem[], id: string = uuid()): SessionDraft {
  const block: StrengthBlock = { type: 'strength', id, superset: true, items: items.map(makeItem) };
  return withType({ ...s, blocks: [...s.blocks, block] });
}

/** Добавить упражнение в силовой блок; блок из одного упражнения становится суперсетом. */
export function addItemToBlock(s: SessionDraft, blockId: string, item: NewItem): SessionDraft {
  return mapBlock(s, blockId, (b) =>
    b.type === 'strength' ? { ...b, superset: true, items: [...b.items, makeItem(item)] } : b,
  );
}

function mapItem(
  s: SessionDraft,
  blockId: string,
  itemIndex: number,
  fn: (item: StrengthBlock['items'][number]) => StrengthBlock['items'][number],
): SessionDraft {
  return mapBlock(s, blockId, (b) =>
    b.type === 'strength' ? { ...b, items: b.items.map((it, i) => (i === itemIndex ? fn(it) : it)) } : b,
  );
}

/** Новый подход копирует предыдущий подход этого упражнения; если подходов нет — `fallback`. */
export function addSet(s: SessionDraft, blockId: string, itemIndex: number, fallback?: SetEntry): SessionDraft {
  return mapItem(s, blockId, itemIndex, (it) => {
    const prev = it.sets.at(-1);
    const next = prev ? copySet(prev) : fallback ? copySet(fallback) : emptySet();
    return { ...it, sets: [...it.sets, next] };
  });
}

const VALUE_KEYS = ['weightKg', 'reps', 'durationSec', 'rpe'] as const;

/**
 * Изменение подхода. Ввод значения считается выполнением подхода (done = true), если отметку
 * не меняют явно: так при внесении тренировки задним числом не нужно жать галочку у каждого подхода.
 * Значение `undefined` очищает поле.
 */
export function updateSet(s: SessionDraft, blockId: string, itemIndex: number, setIndex: number, patch: Partial<SetEntry>): SessionDraft {
  return mapItem(s, blockId, itemIndex, (it) => ({
    ...it,
    sets: it.sets.map((cur, i) => {
      if (i !== setIndex) return cur;
      const next: SetEntry = { ...cur, ...patch };
      for (const k of VALUE_KEYS) if (next[k] === undefined) delete next[k];
      if (patch.done === undefined && VALUE_KEYS.some((k) => k in patch && patch[k] !== undefined)) next.done = true;
      return next;
    }),
  }));
}

export function removeSet(s: SessionDraft, blockId: string, itemIndex: number, setIndex: number): SessionDraft {
  return mapItem(s, blockId, itemIndex, (it) => ({ ...it, sets: it.sets.filter((_, i) => i !== setIndex) }));
}

/** Тип нагрузки задаётся для упражнения целиком: все его подходы либо с отягощением, либо с противовесом. */
export function setItemLoad(s: SessionDraft, blockId: string, itemIndex: number, load: Load): SessionDraft {
  return mapItem(s, blockId, itemIndex, (it) => ({ ...it, sets: it.sets.map((x) => ({ ...x, load })) }));
}

export function setItemNote(s: SessionDraft, blockId: string, itemIndex: number, note: string): SessionDraft {
  return mapItem(s, blockId, itemIndex, (it) => {
    const { note: _old, ...rest } = it;
    return note.trim() === '' ? rest : { ...rest, note };
  });
}

/** Убрать упражнение; пустой блок удаляется целиком, из суперсета из одного упражнения остаётся обычный блок. */
export function removeItem(s: SessionDraft, blockId: string, itemIndex: number): SessionDraft {
  const blocks = s.blocks.flatMap((b): Block[] => {
    if (b.id !== blockId || b.type !== 'strength') return [b];
    const items = b.items.filter((_, i) => i !== itemIndex);
    if (items.length === 0) return [];
    return [{ ...b, items, superset: items.length > 1 }];
  });
  return withType({ ...s, blocks });
}

/* ----------------------------------- кардио ----------------------------------- */

export function addCardioBlock(s: SessionDraft, modality: Modality, role: Role = 'main', id: string = uuid()): SessionDraft {
  const block: CardioBlock = { type: 'cardio', id, modality, name: MODALITY_LABELS[modality], role };
  return withType({ ...s, blocks: [...s.blocks, block] });
}

export type CardioPatch = Partial<Omit<CardioBlock, 'type' | 'id' | 'paceSecPerKm'>>;

/** Расчётный темп хранится всегда, когда есть дистанция и время; темп с часов — отдельное поле. */
export function updateCardio(s: SessionDraft, blockId: string, patch: CardioPatch): SessionDraft {
  return mapBlock(s, blockId, (b) => {
    if (b.type !== 'cardio') return b;
    const next: CardioBlock = { ...b, ...patch };
    for (const k of ['distanceM', 'durationSec', 'recordedPace', 'avgHr', 'floors', 'inclinePct', 'rpe', 'notes'] as const) {
      if (next[k] === undefined) delete next[k];
    }
    const pace = next.distanceM !== undefined && next.durationSec !== undefined ? paceFromDistanceTime(next.distanceM, next.durationSec) : null;
    if (pace !== null) next.paceSecPerKm = pace;
    else delete next.paceSecPerKm;
    return next;
  });
}

/* ---------------------------------- комплексы ---------------------------------- */

export type ConditioningInit = Pick<ConditioningBlock, 'format'> &
  Partial<Pick<ConditioningBlock, 'complexId' | 'name' | 'timeCapMin' | 'description'>>;

export function addConditioningBlock(s: SessionDraft, init: ConditioningInit, id: string = uuid()): SessionDraft {
  const block: ConditioningBlock = { type: 'conditioning', id, result: {}, ...init };
  return withType({ ...s, blocks: [...s.blocks, block] });
}

export function updateConditioning(
  s: SessionDraft,
  blockId: string,
  patch: Partial<Omit<ConditioningBlock, 'type' | 'id' | 'result'>> & { result?: Partial<ConditioningResult> },
): SessionDraft {
  return mapBlock(s, blockId, (b) => {
    if (b.type !== 'conditioning') return b;
    const { result, ...rest } = patch;
    const next: ConditioningBlock = { ...b, ...rest };
    if (result) {
      const merged: ConditioningResult = { ...b.result, ...result };
      for (const k of Object.keys(merged) as (keyof ConditioningResult)[]) if (merged[k] === undefined) delete merged[k];
      next.result = merged;
    }
    for (const k of ['rpe', 'notes', 'timeCapMin', 'complexId', 'name', 'description'] as const) if (next[k] === undefined) delete next[k];
    return next;
  });
}

/* --------------------------------- мобильность --------------------------------- */

export function addMobilityItem(s: SessionDraft, exerciseId: string, durationSec?: number, blockId?: string, id: string = uuid()): SessionDraft {
  const item = { exerciseId, sets: [], ...(durationSec !== undefined ? { durationSec } : {}) };
  if (blockId) {
    return mapBlock(s, blockId, (b) => (b.type === 'mobility' ? { ...b, items: [...b.items, item] } : b));
  }
  const block: MobilityBlock = { type: 'mobility', id, items: [item] };
  return withType({ ...s, blocks: [...s.blocks, block] });
}

export function updateMobilityItem(s: SessionDraft, blockId: string, itemIndex: number, patch: { durationSec?: number | undefined }): SessionDraft {
  return mapBlock(s, blockId, (b) => {
    if (b.type !== 'mobility') return b;
    return {
      ...b,
      items: b.items.map((it, i) => {
        if (i !== itemIndex) return it;
        const { durationSec: _d, ...rest } = it;
        return patch.durationSec === undefined ? rest : { ...rest, durationSec: patch.durationSec };
      }),
    };
  });
}

export function removeMobilityItem(s: SessionDraft, blockId: string, itemIndex: number): SessionDraft {
  const blocks = s.blocks.flatMap((b): Block[] => {
    if (b.id !== blockId || b.type !== 'mobility') return [b];
    const items = b.items.filter((_, i) => i !== itemIndex);
    return items.length === 0 ? [] : [{ ...b, items }];
  });
  return withType({ ...s, blocks });
}

/* ------------------------------------ блоки ------------------------------------ */

export function removeBlock(s: SessionDraft, blockId: string): SessionDraft {
  return withType({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) });
}

export function moveBlock(s: SessionDraft, blockId: string, direction: -1 | 1): SessionDraft {
  const i = s.blocks.findIndex((b) => b.id === blockId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= s.blocks.length) return s;
  const blocks = [...s.blocks];
  [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  return { ...s, blocks };
}

/* --------------------------------- завершение --------------------------------- */

/** Отметить все невыполненные подходы с введёнными значениями выполненными. */
export function markPendingDone(s: SessionDraft): SessionDraft {
  return {
    ...s,
    blocks: s.blocks.map((b) =>
      b.type === 'strength' ? { ...b, items: b.items.map((it) => ({ ...it, sets: it.sets.map((x) => (x.done ? x : { ...x, done: true })) })) } : b,
    ),
  };
}

/** Убрать невыполненные подходы; упражнения и блоки, оставшиеся без подходов, тоже убираются. */
export function dropPendingSets(s: SessionDraft): SessionDraft {
  const blocks = s.blocks.flatMap((b): Block[] => {
    if (b.type !== 'strength') return [b];
    const items = b.items.map((it) => ({ ...it, sets: it.sets.filter((x) => x.done) })).filter((it) => it.sets.length > 0);
    return items.length === 0 ? [] : [{ ...b, items, superset: items.length > 1 }];
  });
  return withType({ ...s, blocks });
}

/** Завершение: время конца и тип. Длительность по часам берётся, только если её не вписали вручную. */
export function finishSession(s: SessionDraft, now: number): SessionDraft {
  return withType({ ...s, finishedAt: now });
}

export function reopenSession(s: SessionDraft): SessionDraft {
  const { finishedAt: _f, ...rest } = s;
  return rest;
}

export const isFinished = (s: Pick<SessionDraft, 'finishedAt'>): boolean => s.finishedAt !== undefined;
