import { SessionRecordSchema, type Block } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import {
  addCardioBlock,
  addConditioningBlock,
  addItemToBlock,
  addMobilityItem,
  addSet,
  addStrengthBlock,
  addSupersetBlock,
  dropPendingSets,
  finishSession,
  markPendingDone,
  moveBlock,
  newSession,
  removeBlock,
  removeItem,
  removeMobilityItem,
  removeSet,
  reopenSession,
  setItemLoad,
  setItemNote,
  updateCardio,
  updateConditioning,
  updateMobilityItem,
  updateSession,
  updateSet,
  type SessionDraft,
} from './sessionEdit.ts';

const base = (): SessionDraft => newSession('2026-10-20', 1_000, 's1');
const withSquat = (): SessionDraft => addStrengthBlock(base(), { exerciseId: 'repdb:squat' }, 'b1');
const strength = (s: SessionDraft, id = 'b1') => s.blocks.find((b) => b.id === id) as Extract<Block, { type: 'strength' }>;
const cardio = (s: SessionDraft, id: string) => s.blocks.find((b) => b.id === id) as Extract<Block, { type: 'cardio' }>;

/** Любое состояние редактора должно проходить схему сохранения. */
const valid = (s: SessionDraft): boolean => SessionRecordSchema.safeParse({ ...s, updatedAt: 1, deletedAt: null }).success;

describe('новая тренировка', () => {
  it('пустая, с датой, временем начала и общим названием', () => {
    expect(base()).toEqual({ id: 's1', date: '2026-10-20', title: 'Тренировка', type: 'mixed', startedAt: 1000, blocks: [] });
    expect(valid(base())).toBe(true);
  });
  it('название, дата, заметка, RPE, длительность; пустые значения убираются', () => {
    let s = updateSession(base(), { title: 'Тренировка 1', date: '2026-10-19', rpe: 8, notes: 'спал 6 ч', durationMin: 66 });
    expect(s).toMatchObject({ title: 'Тренировка 1', date: '2026-10-19', rpe: 8, notes: 'спал 6 ч', durationMin: 66 });
    s = updateSession(s, { rpe: undefined, notes: undefined });
    expect(s).not.toHaveProperty('rpe');
    expect(s).not.toHaveProperty('notes');
    expect(valid(s)).toBe(true);
  });
});

describe('силовые блоки', () => {
  it('блок с одним упражнением и одним пустым подходом', () => {
    const s = withSquat();
    expect(strength(s)).toMatchObject({ superset: false, items: [{ exerciseId: 'repdb:squat', sets: [{ done: false, load: 'normal' }] }] });
    expect(s.type).toBe('strength');
    expect(valid(s)).toBe(true);
  });
  it('можно начать с готовых подходов (копия прошлого результата) и с отметкой «на сторону»', () => {
    const s = addStrengthBlock(base(), { exerciseId: 'repdb:db-lunge', perSide: true, sets: [{ weightKg: 15, reps: 12, done: false, load: 'normal' }] }, 'b1');
    expect(strength(s).items[0]!.sets[0]).toMatchObject({ weightKg: 15, reps: 12, perSide: true, done: false });
  });
  it('«+ Подход» копирует предыдущий: вес и повторы, но не отметку и не RPE', () => {
    let s = withSquat();
    s = updateSet(s, 'b1', 0, 0, { weightKg: 85, reps: 8, rpe: 7 });
    s = addSet(s, 'b1', 0);
    expect(strength(s).items[0]!.sets[1]).toEqual({ weightKg: 85, reps: 8, done: false, load: 'normal' });
  });
  it('в первом подходе без значений новый подход берёт запасной вариант (прошлый результат)', () => {
    let s = addStrengthBlock(base(), { exerciseId: 'x', sets: [] }, 'b1');
    s = removeSet(s, 'b1', 0, 0);
    s = addSet(s, 'b1', 0, { weightKg: 80, reps: 8, done: true, load: 'normal' });
    expect(strength(s).items[0]!.sets).toEqual([{ weightKg: 80, reps: 8, done: false, load: 'normal' }]);
  });
  it('ввод значения отмечает подход выполненным; явная отметка важнее', () => {
    let s = withSquat();
    s = updateSet(s, 'b1', 0, 0, { weightKg: 85 });
    expect(strength(s).items[0]!.sets[0]!.done).toBe(true);
    s = updateSet(s, 'b1', 0, 0, { done: false });
    expect(strength(s).items[0]!.sets[0]!.done).toBe(false);
    s = updateSet(s, 'b1', 0, 0, { reps: 8, done: false });
    expect(strength(s).items[0]!.sets[0]!.done).toBe(false);
  });
  it('очистка поля удаляет его; очистка RPE допустима', () => {
    let s = updateSet(withSquat(), 'b1', 0, 0, { weightKg: 85, reps: 8, rpe: 7 });
    s = updateSet(s, 'b1', 0, 0, { rpe: undefined });
    expect(strength(s).items[0]!.sets[0]).not.toHaveProperty('rpe');
    expect(valid(s)).toBe(true);
  });
  it('RPE 8 у третьего подхода приседа сохраняется (критерий приёмки)', () => {
    let s = withSquat();
    s = updateSet(s, 'b1', 0, 0, { weightKg: 85, reps: 8 });
    s = addSet(s, 'b1', 0);
    s = addSet(s, 'b1', 0);
    s = updateSet(s, 'b1', 0, 2, { rpe: 8 });
    expect(strength(s).items[0]!.sets.map((x) => x.rpe)).toEqual([undefined, undefined, 8]);
    expect(valid(s)).toBe(true);
  });
  it('удаление подхода', () => {
    let s = addSet(updateSet(withSquat(), 'b1', 0, 0, { reps: 5 }), 'b1', 0);
    s = removeSet(s, 'b1', 0, 0);
    expect(strength(s).items[0]!.sets).toHaveLength(1);
  });
  it('тип нагрузки задаётся упражнению целиком: отягощение и противовес различаются', () => {
    let a = addStrengthBlock(base(), { exerciseId: 'repdb:pull-up' }, 'p1');
    a = setItemLoad(updateSet(a, 'p1', 0, 0, { weightKg: 10, reps: 8 }), 'p1', 0, 'added');
    let b = addStrengthBlock(a, { exerciseId: 'repdb:assisted-pull-ups' }, 'p2');
    b = setItemLoad(updateSet(b, 'p2', 0, 0, { weightKg: 18.5, reps: 12 }), 'p2', 0, 'assisted');
    expect(strength(b, 'p1').items[0]!.sets[0]).toMatchObject({ weightKg: 10, load: 'added' });
    expect(strength(b, 'p2').items[0]!.sets[0]).toMatchObject({ weightKg: 18.5, load: 'assisted' });
    expect(valid(b)).toBe(true);
    // Следующий подход наследует нагрузку.
    expect(strength(addSet(b, 'p1', 0), 'p1').items[0]!.sets[1]!.load).toBe('added');
  });
  it('заметка к упражнению в тренировке; пустая убирается', () => {
    let s = setItemNote(withSquat(), 'b1', 0, 'пауза внизу');
    expect(strength(s).items[0]!.note).toBe('пауза внизу');
    s = setItemNote(s, 'b1', 0, '  ');
    expect(strength(s).items[0]).not.toHaveProperty('note');
  });
});

describe('суперсет', () => {
  it('блок из нескольких упражнений', () => {
    const s = addSupersetBlock(base(), [{ exerciseId: 'a' }, { exerciseId: 'b' }], 'ss');
    expect(strength(s, 'ss')).toMatchObject({ superset: true });
    expect(strength(s, 'ss').items.map((i) => i.exerciseId)).toEqual(['a', 'b']);
  });
  it('добавление упражнения превращает блок в суперсет; удаление до одного — обратно', () => {
    let s = addItemToBlock(withSquat(), 'b1', { exerciseId: 'repdb:bench-press' });
    expect(strength(s).superset).toBe(true);
    s = removeItem(s, 'b1', 0);
    expect(strength(s)).toMatchObject({ superset: false });
    expect(strength(s).items.map((i) => i.exerciseId)).toEqual(['repdb:bench-press']);
  });
  it('удаление последнего упражнения убирает блок', () => {
    expect(removeItem(withSquat(), 'b1', 0).blocks).toEqual([]);
  });
});

describe('кардио', () => {
  it('блок с названием по виду и ролью', () => {
    const s = addCardioBlock(base(), 'stairs', 'warmup', 'c1');
    expect(cardio(s, 'c1')).toMatchObject({ modality: 'stairs', name: 'Лестница', role: 'warmup' });
    expect(valid(s)).toBe(true);
  });
  it('пробежка 3,09 км за 24:08: хранится расчётный 7:49 (469), темп часов 7:46 (466) — отдельно', () => {
    let s = addCardioBlock(base(), 'run', 'main', 'c1');
    s = updateCardio(s, 'c1', { distanceM: 3090, durationSec: 1448 });
    expect(cardio(s, 'c1').paceSecPerKm).toBe(469);
    s = updateCardio(s, 'c1', { recordedPace: 466 });
    expect(cardio(s, 'c1')).toMatchObject({ paceSecPerKm: 469, recordedPace: 466 });
    expect(valid(s)).toBe(true);
  });
  it('темп пропадает, когда стирают дистанцию или время', () => {
    let s = updateCardio(addCardioBlock(base(), 'run', 'main', 'c1'), 'c1', { distanceM: 3000, durationSec: 1500 });
    expect(cardio(s, 'c1').paceSecPerKm).toBe(500);
    s = updateCardio(s, 'c1', { distanceM: undefined });
    expect(cardio(s, 'c1')).not.toHaveProperty('paceSecPerKm');
    expect(cardio(s, 'c1')).not.toHaveProperty('distanceM');
  });
  it('пульс, этажи, наклон, RPE; смена вида и роли', () => {
    const s = updateCardio(addCardioBlock(base(), 'stairs', 'main', 'c1'), 'c1', { avgHr: 142, floors: 80, inclinePct: 1, rpe: 6, role: 'finisher' });
    expect(cardio(s, 'c1')).toMatchObject({ avgHr: 142, floors: 80, inclinePct: 1, rpe: 6, role: 'finisher' });
  });
  it('только кардио — тип «кардио»; разминка не делает тренировку кардио-тренировкой', () => {
    expect(addCardioBlock(base(), 'run').type).toBe('cardio');
    const lifting = addCardioBlock(addStrengthBlock(base(), { exerciseId: 'x' }), 'stairs', 'warmup');
    expect(lifting.type).toBe('strength');
  });
});

describe('комплексы', () => {
  it('блок из библиотеки с результатом «9 раундов»', () => {
    let s = addConditioningBlock(base(), { complexId: '#005', format: 'AMRAP', timeCapMin: 15, description: '6 подтягиваний…' }, 'k1');
    s = updateConditioning(s, 'k1', { result: { rounds: 9 }, rpe: 8 });
    expect(s.blocks[0]).toMatchObject({ type: 'conditioning', complexId: '#005', result: { rounds: 9 }, rpe: 8 });
    expect(s.type).toBe('conditioning');
    expect(valid(s)).toBe(true);
  });
  it('результат дополняется, а не заменяется; undefined очищает поле', () => {
    let s = addConditioningBlock(base(), { format: 'AMRAP' }, 'k1');
    s = updateConditioning(s, 'k1', { result: { rounds: 3 } });
    s = updateConditioning(s, 'k1', { result: { extraReps: 7 } });
    expect((s.blocks[0] as { result: object }).result).toEqual({ rounds: 3, extraReps: 7 });
    s = updateConditioning(s, 'k1', { result: { extraReps: undefined } });
    expect((s.blocks[0] as { result: object }).result).toEqual({ rounds: 3 });
  });
  it('комплекс не из библиотеки: своё название и формат', () => {
    const s = addConditioningBlock(base(), { name: 'SkiErg 500 + гребля 500', format: 'AMRAP', timeCapMin: 20 }, 'k1');
    expect(s.blocks[0]).toMatchObject({ name: 'SkiErg 500 + гребля 500', format: 'AMRAP' });
    expect(valid(s)).toBe(true);
  });
});

describe('мобильность', () => {
  it('блок с упражнением и временем, добавление и правка', () => {
    let s = addMobilityItem(base(), 'hybridlog:core-complex', 600, undefined, 'm1');
    expect(s.blocks[0]).toMatchObject({ type: 'mobility', items: [{ exerciseId: 'hybridlog:core-complex', durationSec: 600 }] });
    expect(s.type).toBe('mobility');
    s = addMobilityItem(s, 'repdb:dead-bug', undefined, 'm1');
    s = updateMobilityItem(s, 'm1', 1, { durationSec: 90 });
    s = updateMobilityItem(s, 'm1', 0, { durationSec: undefined });
    const items = (s.blocks[0] as { items: { durationSec?: number }[] }).items;
    expect(items[0]).not.toHaveProperty('durationSec');
    expect(items[1]!.durationSec).toBe(90);
    expect(valid(s)).toBe(true);
  });
  it('последнее упражнение убирает блок', () => {
    expect(removeMobilityItem(addMobilityItem(base(), 'x', 60, undefined, 'm1'), 'm1', 0).blocks).toEqual([]);
  });
});

describe('порядок блоков и тип', () => {
  const three = (): SessionDraft => {
    let s = addCardioBlock(base(), 'treadmill', 'warmup', 'w');
    s = addStrengthBlock(s, { exerciseId: 'x' }, 'st');
    return addMobilityItem(s, 'y', 300, undefined, 'mob');
  };
  it('перемещение вверх и вниз, границы не нарушаются', () => {
    const s = three();
    expect(moveBlock(s, 'st', -1).blocks.map((b) => b.id)).toEqual(['st', 'w', 'mob']);
    expect(moveBlock(s, 'st', 1).blocks.map((b) => b.id)).toEqual(['w', 'mob', 'st']);
    expect(moveBlock(s, 'w', -1)).toBe(s);
    expect(moveBlock(s, 'mob', 1)).toBe(s);
    expect(moveBlock(s, 'нет', 1)).toBe(s);
  });
  it('удаление блока пересчитывает тип', () => {
    expect(three().type).toBe('strength');
    // Остались разминка и мобильность: основной работы нет, решает мобильность.
    expect(removeBlock(three(), 'st').type).toBe('mobility');
  });
  it('силовая + комплекс = смешанная', () => {
    const s = addConditioningBlock(addStrengthBlock(base(), { exerciseId: 'x' }), { format: 'AMRAP' });
    expect(s.type).toBe('mixed');
  });
});

describe('завершение', () => {
  const draft = (): SessionDraft => {
    let s = withSquat();
    s = updateSet(s, 'b1', 0, 0, { weightKg: 85, reps: 8 });
    s = addSet(s, 'b1', 0); // копия, не выполнена
    s = addStrengthBlock(s, { exerciseId: 'repdb:bench-press' }, 'b2'); // пустой невыполненный подход
    return s;
  };
  it('отметить невыполненные выполненными', () => {
    const s = markPendingDone(draft());
    expect(s.blocks.every((b) => b.type !== 'strength' || b.items.every((i) => i.sets.every((x) => x.done)))).toBe(true);
  });
  it('убрать невыполненные: пустые упражнения и блоки исчезают', () => {
    const s = dropPendingSets(draft());
    expect(s.blocks.map((b) => b.id)).toEqual(['b1']);
    expect(strength(s).items[0]!.sets).toHaveLength(1);
    expect(valid(s)).toBe(true);
  });
  it('завершение ставит время конца, повторное открытие снимает', () => {
    const done = finishSession(draft(), 5_000_000);
    expect(done.finishedAt).toBe(5_000_000);
    expect(reopenSession(done)).not.toHaveProperty('finishedAt');
  });
});
