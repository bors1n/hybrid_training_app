import { TemplateRecordSchema } from '@hybridlog/shared';
import { describe, expect, it } from 'vitest';
import { complexMakeNext, queueAddTemplate, queueMoveTemplate, queueRemoveTemplate, queueSetPosition, type QueueDraft } from './queueEdit.ts';
import {
  addCardio,
  addFixedComplex,
  addItemToBlock,
  addMobility,
  addMobilityItem,
  addQueuedComplex,
  addStrengthBlock,
  moveBlock,
  newTemplate,
  removeBlock,
  removeItem,
  removeMobilityItem,
  setItemNote,
  templateSummary,
  updateCardio,
  updateConditioning,
  updateItemPlan,
  updateMobility,
  updateTemplate,
  type TemplateDraft,
} from './templateEdit.ts';
import { TEMPLATES } from '../seed/templates.ts';

const valid = (t: TemplateDraft): boolean => TemplateRecordSchema.safeParse({ ...t, updatedAt: 1, deletedAt: null }).success;
const base = (): TemplateDraft => newTemplate('t', 'Т');
const withSquat = (): TemplateDraft => addStrengthBlock(base(), 'repdb:squat', false, 'b1');
const strength = (t: TemplateDraft, id = 'b1') => t.blocks.find((b) => b.id === id) as Extract<TemplateDraft['blocks'][number], { type: 'strength' }>;

describe('шаблон: редактирование', () => {
  it('новый шаблон пустой и валидный; название, подзаголовок и время; пустые значения убираются', () => {
    expect(base()).toEqual({ id: 't', title: 'Т', blocks: [] });
    expect(valid(base())).toBe(true);
    let t = updateTemplate(base(), { title: 'Всё тело A', subtitle: 'Силовая', durationHint: '65–70 мин' });
    expect(t).toMatchObject({ title: 'Всё тело A', subtitle: 'Силовая', durationHint: '65–70 мин' });
    t = updateTemplate(t, { subtitle: '' });
    expect(t).not.toHaveProperty('subtitle');
  });

  it('силовой блок: 3 подхода по умолчанию, валиден', () => {
    const t = withSquat();
    expect(strength(t)).toMatchObject({ superset: false, items: [{ exerciseId: 'repdb:squat', plan: { sets: 3, load: 'normal' } }] });
    expect(valid(t)).toBe(true);
  });
  it('упражнение «на сторону» помечается сразу', () => {
    expect(strength(addStrengthBlock(base(), 'lunge', true, 'b1')).items[0]!.plan.perSide).toBe(true);
  });

  it('плановые значения: подходы, диапазон повторов, вес и его верх; undefined очищает', () => {
    let t = updateItemPlan(withSquat(), 'b1', 0, { sets: 4, repsMin: 6, repsMax: 8, weightKg: 85 });
    expect(strength(t).items[0]!.plan).toEqual({ sets: 4, repsMin: 6, repsMax: 8, weightKg: 85, load: 'normal' });
    t = updateItemPlan(t, 'b1', 0, { weightKgMax: 90 });
    expect(strength(t).items[0]!.plan.weightKgMax).toBe(90);
    t = updateItemPlan(t, 'b1', 0, { weightKg: undefined, weightKgMax: undefined, repsMax: undefined });
    expect(strength(t).items[0]!.plan).toEqual({ sets: 4, repsMin: 6, load: 'normal' });
    expect(valid(t)).toBe(true);
  });
  it('диапазон не «переворачивается»: правишь нижнюю границу — верхняя подтягивается, и наоборот', () => {
    let t = updateItemPlan(withSquat(), 'b1', 0, { repsMin: 6, repsMax: 8 });
    t = updateItemPlan(t, 'b1', 0, { repsMin: 10 });
    expect(strength(t).items[0]!.plan).toMatchObject({ repsMin: 10, repsMax: 10 });
    t = updateItemPlan(t, 'b1', 0, { repsMax: 8 });
    expect(strength(t).items[0]!.plan).toMatchObject({ repsMin: 8, repsMax: 8 });
    t = updateItemPlan(updateItemPlan(t, 'b1', 0, { weightKg: 14, weightKgMax: 16 }), 'b1', 0, { weightKg: 20 });
    expect(strength(t).items[0]!.plan).toMatchObject({ weightKg: 20, weightKgMax: 20 });
  });
  it('число подходов не меньше одного; нагрузка и «на сторону» меняются', () => {
    let t = updateItemPlan(withSquat(), 'b1', 0, { sets: 0 });
    expect(strength(t).items[0]!.plan.sets).toBe(1);
    t = updateItemPlan(t, 'b1', 0, { load: 'added', weightKg: 5, perSide: true });
    expect(strength(t).items[0]!.plan).toMatchObject({ load: 'added', weightKg: 5, perSide: true });
  });
  it('заметка упражнения; пустая убирается', () => {
    let t = setItemNote(withSquat(), 'b1', 0, 'Нет пояса: строго 3 × 12–15');
    expect(strength(t).items[0]!.note).toBe('Нет пояса: строго 3 × 12–15');
    t = setItemNote(t, 'b1', 0, '  ');
    expect(strength(t).items[0]).not.toHaveProperty('note');
  });

  it('суперсет: добавление делает блок суперсетом, удаление до одного — обычным, до нуля — убирает блок', () => {
    let t = addItemToBlock(withSquat(), 'b1', 'repdb:bench-press');
    expect(strength(t)).toMatchObject({ superset: true });
    t = removeItem(t, 'b1', 0);
    expect(strength(t)).toMatchObject({ superset: false });
    expect(removeItem(t, 'b1', 0).blocks).toEqual([]);
  });

  it('кардио: вид, роль, диапазон времени; верх не меньше низа', () => {
    let t = addCardio(base(), 'treadmill', 'warmup', 'c1');
    expect(t.blocks[0]).toMatchObject({ modality: 'treadmill', role: 'warmup', name: 'Дорожка' });
    t = updateCardio(t, 'c1', { durationSec: 300, durationSecMax: 600, note: 'дорожка, гребля или лестница' });
    expect(t.blocks[0]).toMatchObject({ durationSec: 300, durationSecMax: 600, note: 'дорожка, гребля или лестница' });
    t = updateCardio(t, 'c1', { durationSec: 900 });
    expect(t.blocks[0]).toMatchObject({ durationSec: 900, durationSecMax: 900 });
    t = updateCardio(t, 'c1', { role: 'finisher', note: '', durationSecMax: undefined });
    expect(t.blocks[0]).toMatchObject({ role: 'finisher' });
    expect(t.blocks[0]).not.toHaveProperty('note');
    expect(valid(t)).toBe(true);
  });

  it('комплекс: из очереди, из библиотеки и свой', () => {
    let t = addQueuedComplex(base(), 'k1');
    expect(t.blocks[0]).toMatchObject({ type: 'conditioning', fromQueue: true });
    t = addFixedComplex(t, { id: '#007', title: 'Чиппер', format: 'FOR_TIME', timeCapMin: 20, description: '50 приседаний…' }, 'k2');
    t = addFixedComplex(t, { name: 'Спринты', format: 'INTERVALS', description: '6 × 40/40' }, 'k3');
    expect(t.blocks[1]).toMatchObject({ fromQueue: false, complexId: '#007', name: 'Чиппер', format: 'FOR_TIME', timeCapMin: 20 });
    expect(t.blocks[2]).toMatchObject({ fromQueue: false, name: 'Спринты', format: 'INTERVALS' });
    expect(t.blocks[2]).not.toHaveProperty('complexId');
    t = updateConditioning(t, 'k3', { timeCapMin: 8, description: '' });
    expect(t.blocks[2]).toMatchObject({ timeCapMin: 8 });
    expect(t.blocks[2]).not.toHaveProperty('description');
    t = updateConditioning(t, 'k1', { fromQueue: false, name: 'Свой', format: 'AMRAP' });
    expect(t.blocks[0]).toMatchObject({ fromQueue: false, name: 'Свой' });
    expect(valid(t)).toBe(true);
  });

  it('мобильность: блок, упражнения, время с диапазоном', () => {
    let t = addMobility(base(), 'hybridlog:core-complex', 'm1');
    t = addMobilityItem(t, 'm1', 'repdb:dead-bug');
    t = updateMobility(t, 'm1', { durationSec: 480, durationSecMax: 600 });
    expect(t.blocks[0]).toMatchObject({ items: [{ exerciseId: 'hybridlog:core-complex' }, { exerciseId: 'repdb:dead-bug' }], durationSec: 480, durationSecMax: 600 });
    t = updateMobility(t, 'm1', { durationSec: 720 });
    expect(t.blocks[0]).toMatchObject({ durationSecMax: 720 });
    t = removeMobilityItem(removeMobilityItem(t, 'm1', 0), 'm1', 0);
    expect(t.blocks).toEqual([]);
  });

  it('порядок блоков и удаление', () => {
    let t = addMobility(addCardio(withSquat(), 'run', 'main', 'c1'), 'x', 'm1');
    t = moveBlock(t, 'm1', -1);
    expect(t.blocks.map((b) => b.id)).toEqual(['b1', 'm1', 'c1']);
    expect(moveBlock(t, 'b1', -1)).toBe(t);
    expect(moveBlock(t, 'c1', 1)).toBe(t);
    expect(removeBlock(t, 'm1').blocks.map((b) => b.id)).toEqual(['b1', 'c1']);
  });
  it('подпись для очереди: «7 упражнений · кардио · комплекс»', () => {
    expect(templateSummary(TEMPLATES[0]!)).toBe('7 упражнений · кардио · мобильность');
    expect(templateSummary(TEMPLATES[1]!)).toBe('7 упражнений · кардио');
    expect(templateSummary(TEMPLATES[2]!)).toBe('кардио · комплекс · мобильность');
    expect(templateSummary(base())).toBe('пусто');
    expect(templateSummary(withSquat())).toBe('1 упражнение');
    expect(templateSummary(addItemToBlock(withSquat(), 'b1', 'x'))).toBe('2 упражнения');
  });
});

describe('очередь: редактирование', () => {
  const q = (): QueueDraft => ({ id: 'q', title: 'Цикл', templateIds: ['t1', 't2', 't3'] });

  it('добавить шаблон (без повторов), убрать (можно до пустой), переставить', () => {
    expect(queueAddTemplate(q(), 't4').templateIds).toEqual(['t1', 't2', 't3', 't4']);
    expect(queueAddTemplate(q(), 't2')).toEqual(q());
    expect(queueRemoveTemplate(q(), 1).templateIds).toEqual(['t1', 't3']);
    expect(queueRemoveTemplate({ ...q(), templateIds: ['t1'] }, 0).templateIds).toEqual([]);
    expect(queueMoveTemplate(q(), 2, -1).templateIds).toEqual(['t1', 't3', 't2']);
    const same = q();
    expect(queueMoveTemplate(same, 0, -1)).toBe(same);
    expect(queueMoveTemplate(same, 2, 1)).toBe(same);
  });
  it('«начать с…» задаёт позицию с отметкой времени', () => {
    expect(queueSetPosition(q(), 2, 5).override).toEqual({ position: 2, setAt: 5 });
    expect(queueSetPosition(q(), 10, 5).override!.position).toBe(2);
    expect(queueSetPosition(q(), -3, 5).override!.position).toBe(0);
  });
  it('«сделать комплекс следующим»: в очереди — позиция; вне очереди (#004) — вставка на текущую позицию', () => {
    const cq = { id: 'main', order: ['#001', '#002', '#003', '#005'] };
    expect(complexMakeNext(cq, '#003', 1, 7).override).toEqual({ position: 2, setAt: 7 });
    const inserted = complexMakeNext(cq, '#004', 3, 7);
    expect(inserted.order).toEqual(['#001', '#002', '#003', '#004', '#005']);
    expect(inserted.override).toEqual({ position: 3, setAt: 7 });
    expect(complexMakeNext(cq, '#009', 99, 7).order.at(-1)).toBe('#009');
  });
});
