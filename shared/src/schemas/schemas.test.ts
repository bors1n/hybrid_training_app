import { describe, expect, it } from 'vitest';
import { sessionData, templateData } from '../fixtures.ts';
import {
  BlockSchema,
  CardioBlockSchema,
  checkRecord,
  ConditioningBlockSchema,
  DateStringSchema,
  ExerciseContentSchema,
  ExerciseRecordSchema,
  RECORD_SCHEMAS,
  SessionRecordSchema,
  SetSchema,
  StrengthBlockSchema,
  TemplateRecordSchema,
} from './index.ts';
import { COLLECTIONS } from '../sync.ts';

describe('DateStringSchema', () => {
  it('принимает настоящие даты', () => {
    for (const d of ['2026-10-20', '2024-02-29', '2026-12-31']) expect(DateStringSchema.safeParse(d).success).toBe(true);
  });
  it.each(['20.10.2026', '2026-13-01', '2026-02-30', '2025-02-29', '2026-1-5', '', 'вчера'])('отклоняет «%s»', (d) => {
    expect(DateStringSchema.safeParse(d).success).toBe(false);
  });
});

describe('SetSchema', () => {
  it('значения по умолчанию: done=false, load=normal', () => {
    expect(SetSchema.parse({ weightKg: 85, reps: 8 })).toEqual({ weightKg: 85, reps: 8, done: false, load: 'normal' });
  });
  it('RPE — целое от 1 до 10, пустое допустимо', () => {
    expect(SetSchema.safeParse({ reps: 8, rpe: 8 }).success).toBe(true);
    expect(SetSchema.safeParse({ reps: 8 }).success).toBe(true);
    for (const rpe of [0, 11, 7.5, -1]) expect(SetSchema.safeParse({ reps: 8, rpe }).success).toBe(false);
  });
  it('подтягивания с отягощением и с противовесом различаются полем load', () => {
    const added = SetSchema.parse({ weightKg: 10, reps: 8, load: 'added' });
    const assisted = SetSchema.parse({ weightKg: 18.5, reps: 12, load: 'assisted' });
    expect(added.load).not.toBe(assisted.load);
    expect(SetSchema.safeParse({ weightKg: 10, load: 'other' }).success).toBe(false);
  });
  it('отрицательные и нечисловые значения отклоняются', () => {
    expect(SetSchema.safeParse({ weightKg: -1 }).success).toBe(false);
    expect(SetSchema.safeParse({ reps: 1.5 }).success).toBe(false);
    expect(SetSchema.safeParse({ reps: '8' }).success).toBe(false);
  });
});

describe('блоки', () => {
  it('силовой блок: нужен хотя бы один элемент', () => {
    const ok = { type: 'strength', id: 'b1', items: [{ exerciseId: 'repdb:squat', sets: [{ weightKg: 85, reps: 8 }] }] };
    expect(StrengthBlockSchema.safeParse(ok).success).toBe(true);
    expect(StrengthBlockSchema.parse(ok).superset).toBe(false);
    expect(StrengthBlockSchema.safeParse({ ...ok, items: [] }).success).toBe(false);
  });

  it('кардио: пробежка 3,09 км за 24:08 с темпом часов и расчётным', () => {
    const run = CardioBlockSchema.parse({
      type: 'cardio',
      id: 'c1',
      modality: 'run',
      distanceM: 3090,
      durationSec: 1448,
      paceSecPerKm: 469,
      recordedPace: 466,
    });
    expect(run.role).toBe('main');
    expect(run.paceSecPerKm).toBe(469);
    expect(run.recordedPace).toBe(466);
  });
  it('кардио: неизвестный вид, пульс вне диапазона, RPE', () => {
    const base = { type: 'cardio', id: 'c', modality: 'run' };
    expect(CardioBlockSchema.safeParse({ ...base, modality: 'swim' }).success).toBe(false);
    expect(CardioBlockSchema.safeParse({ ...base, avgHr: 400 }).success).toBe(false);
    expect(CardioBlockSchema.safeParse({ ...base, rpe: 11 }).success).toBe(false);
    expect(CardioBlockSchema.safeParse({ ...base, role: 'warmup', floors: 80, durationSec: 600 }).success).toBe(true);
  });

  it('комплекс: результат «9 раундов» и «3 раунда + 7»', () => {
    const base = { type: 'conditioning', id: 'k', complexId: '#005', format: 'AMRAP', timeCapMin: 15 };
    expect(ConditioningBlockSchema.parse({ ...base, result: { rounds: 9 } }).result).toEqual({ rounds: 9 });
    expect(ConditioningBlockSchema.parse({ ...base, result: { rounds: 3, extraReps: 7 }, rpe: 8 }).rpe).toBe(8);
    expect(ConditioningBlockSchema.parse(base).result).toEqual({});
    expect(ConditioningBlockSchema.safeParse({ ...base, format: 'SPRINT' }).success).toBe(false);
  });

  it('дискриминатор: тип блока обязателен и известен', () => {
    expect(BlockSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(BlockSchema.safeParse({ type: 'swim', id: 'x' }).success).toBe(false);
    expect(BlockSchema.safeParse({ type: 'mobility', id: 'm', items: [{ exerciseId: 'hybridlog:core-complex', durationSec: 600 }] }).success).toBe(true);
  });
});

describe('SessionRecordSchema', () => {
  it('минимальная тренировка валидна', () => {
    expect(SessionRecordSchema.safeParse(sessionData('s1')).success).toBe(true);
  });
  it('тренировка из import_template: смешанная, с разминкой, силой и финишем', () => {
    const s = sessionData('2026-10-20-t1', 5, {
      title: 'Тренировка 1',
      type: 'mixed',
      rpe: 8,
      blocks: [
        { type: 'cardio', id: 'b0', modality: 'stairs', name: 'Лестница', role: 'warmup', durationSec: 600 },
        { type: 'strength', id: 'b1', superset: false, items: [{ exerciseId: 'repdb:squat', sets: [{ weightKg: 85, reps: 8, rpe: 7, done: true, load: 'normal' }] }] },
        { type: 'cardio', id: 'b7', modality: 'indoor_bike', name: 'Велотренажёр', role: 'finisher', durationSec: 900, notes: 'зона 2' },
      ],
    });
    expect(SessionRecordSchema.safeParse(s).success).toBe(true);
  });
  it.each([
    ['дата не по формату', { date: '20.10.2026' }],
    ['пустое название', { title: '  ' }],
    ['неизвестный тип', { type: 'yoga' }],
    ['RPE тренировки 12', { rpe: 12 }],
    ['слот очереди отрицательный', { queueSlot: -1 }],
  ])('отклоняет: %s', (_name, patch) => {
    expect(SessionRecordSchema.safeParse(sessionData('s', 1, patch as never)).success).toBe(false);
  });
});

describe('упражнения', () => {
  const base = { name: 'Присед', kind: 'strength', equipment: 'barbell', muscles: { primary: ['quadriceps'], secondary: [] }, metrics: 'weight_reps' };
  it('значения по умолчанию', () => {
    const e = ExerciseContentSchema.parse(base);
    expect(e).toMatchObject({ aliases: [], perSide: false, isCustom: false });
  });
  it('пользовательское упражнение: isCustom обязательно true', () => {
    const rec = { ...base, id: 'u1', updatedAt: 1, deletedAt: null, isCustom: true };
    expect(ExerciseRecordSchema.safeParse(rec).success).toBe(true);
    expect(ExerciseRecordSchema.safeParse({ ...rec, isCustom: false }).success).toBe(false);
  });
  it('отклоняет неизвестное оборудование и метрику', () => {
    expect(ExerciseContentSchema.safeParse({ ...base, equipment: 'rocket' }).success).toBe(false);
    expect(ExerciseContentSchema.safeParse({ ...base, metrics: 'speed' }).success).toBe(false);
  });
});

describe('шаблоны', () => {
  it('старое поле inShort в записи не мешает', () => {
    const legacyBlock = { type: 'strength', id: 's', superset: false, inShort: true, items: [{ exerciseId: 'repdb:squat', plan: { sets: 3, repsMin: 6, repsMax: 8, weightKg: 85, load: 'normal' } }] };
    const t = TemplateRecordSchema.parse({ ...templateData('t', 1, { blocks: [] }), blocks: [legacyBlock] });
    expect(t.blocks[0]).not.toHaveProperty('inShort');
  });
  it('нулевое число подходов не допускается', () => {
    const bad = templateData('t', 1, {
      blocks: [{ type: 'strength', id: 's', superset: false, items: [{ exerciseId: 'x', plan: { sets: 0, load: 'normal' } }] }],
    });
    expect(TemplateRecordSchema.safeParse(bad).success).toBe(false);
  });
});

describe('checkRecord', () => {
  it('в каждой коллекции есть схема', () => {
    expect(Object.keys(RECORD_SCHEMAS).sort()).toEqual([...COLLECTIONS].sort());
  });
  it('согласованность с конвертом', () => {
    const data = sessionData('s1', 10);
    expect(checkRecord('sessions', { id: 's1', updatedAt: 10, deletedAt: null }, data).ok).toBe(true);
    expect(checkRecord('sessions', { id: 'other', updatedAt: 10, deletedAt: null }, data).ok).toBe(false);
    expect(checkRecord('sessions', { id: 's1', updatedAt: 11, deletedAt: null }, data).ok).toBe(false);
    expect(checkRecord('sessions', { id: 's1', updatedAt: 10, deletedAt: 10 }, data).ok).toBe(false);
  });
  it('причина отказа указывает путь к полю', () => {
    const res = checkRecord('sessions', { id: 's1', updatedAt: 1, deletedAt: null }, sessionData('s1', 1, { date: 'вчера' }));
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? '' : res.reason).toContain('date');
  });
  it('неизвестные поля отбрасываются, значения по умолчанию добавляются', () => {
    const res = checkRecord('sessions', { id: 's1', updatedAt: 1, deletedAt: null }, { ...sessionData('s1', 1), secret: 'x', blocks: [{ type: 'cardio', id: 'c', modality: 'run', secret: 1 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).not.toHaveProperty('secret');
      expect((res.data['blocks'] as { role: string }[])[0]!.role).toBe('main');
    }
  });
});
