import { describe, expect, it } from 'vitest';
import { formatMinutesRange, formatPlan, shortResult } from './planFormat.ts';

describe('formatPlan', () => {
  const p = (over: object) => ({ sets: 3, load: 'normal' as const, ...over });
  it('подходы, диапазон повторов и вес', () => {
    expect(formatPlan(p({ repsMin: 6, repsMax: 8, weightKg: 85 }))).toBe('3 × 6–8 · 85 кг');
    expect(formatPlan(p({ repsMin: 8, repsMax: 8, weightKg: 85 }))).toBe('3 × 8 · 85 кг');
    expect(formatPlan(p({ repsMin: 12 }))).toBe('3 × 12');
  });
  it('диапазон веса, на сторону, отягощение и противовес', () => {
    expect(formatPlan(p({ repsMin: 10, repsMax: 12, weightKg: 14, weightKgMax: 16, perSide: true }))).toBe('3 × 10–12 на сторону · 14–16 кг');
    expect(formatPlan(p({ repsMin: 6, repsMax: 8, weightKg: 5, weightKgMax: 10, load: 'added' }))).toBe('3 × 6–8 · +5–10 кг');
    expect(formatPlan(p({ repsMin: 12, weightKg: 18.5, load: 'assisted' }))).toBe('3 × 12 · −18,5 кг (противовес)');
  });
  it('время вместо повторов; только подходы', () => {
    expect(formatPlan(p({ durationSec: 90 }))).toBe('3 × 1:30');
    expect(formatPlan(p({}))).toBe('3 подх.');
  });
});

describe('вспомогательные', () => {
  it('диапазон минут', () => {
    expect(formatMinutesRange(300, 600)).toBe('5–10 мин');
    expect(formatMinutesRange(900, undefined)).toBe('15 мин');
    expect(formatMinutesRange(600, 600)).toBe('10 мин');
    expect(formatMinutesRange(undefined, undefined)).toBe('');
  });
  it('короткий результат комплекса для плитки', () => {
    expect(shortResult('AMRAP', { rounds: 9 })).toBe('9');
    expect(shortResult('AMRAP', { rounds: 9, extraReps: 12 })).toBe('9+12');
    expect(shortResult('FOR_TIME', { timeSec: 755 })).toBe('12:35');
    expect(shortResult('FOR_TIME', { timeSec: 720, finished: false })).toBe('не уложился');
    expect(shortResult('EMOM', { totalReps: 184 })).toBe('184');
    expect(shortResult('AMRAP', {})).toBe('—');
  });
});
