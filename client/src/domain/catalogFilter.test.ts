import type { CatalogExercise } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { defaultMetrics, EMPTY_FILTER, filterCatalog, kindColorVar, muscleGroups, rankByQuery } from './catalogFilter.ts';

const ex = (id: string, name: string, over: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id,
  name,
  aliases: [],
  kind: 'strength',
  equipment: 'barbell',
  muscles: { primary: [], secondary: [] },
  perSide: false,
  metrics: 'weight_reps',
  isCustom: false,
  ...over,
});

const items = [
  ex('squat', 'Присед со штангой', { aliases: ['Back squat', 'Присед'], muscles: { primary: ['quadriceps', 'gluteus_maximus'], secondary: [] } }),
  ex('bench', 'Жим лёжа', { muscles: { primary: ['pectoralis_major'], secondary: ['triceps_brachii'] } }),
  ex('row', 'Тяга горизонтального блока', { equipment: 'cable', muscles: { primary: ['latissimus_dorsi'], secondary: [] } }),
  ex('run', 'Бег', { kind: 'cardio', equipment: 'none', metrics: 'distance_time' }),
  ex('own', 'Фермерская прогулка 2 × 24', { kind: 'strength', equipment: 'dumbbell', isCustom: true }),
  ex('plank', 'Планка', { kind: 'core', equipment: 'bodyweight', muscles: { primary: ['rectus_abdominis'], secondary: [] } }),
];
const ids = (r: CatalogExercise[]) => r.map((e) => e.id);

describe('filterCatalog', () => {
  it('без фильтров — всё', () => {
    expect(filterCatalog(items, EMPTY_FILTER)).toHaveLength(items.length);
  });
  it('поиск: ё/е, регистр и псевдонимы', () => {
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, query: 'ЖИМ лежа' }))).toEqual(['bench']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, query: 'back squat' }))).toEqual(['squat']);
  });
  it('поиск: все слова запроса должны найтись, порядок не важен', () => {
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, query: 'штангой присед' }))).toEqual(['squat']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, query: 'присед гантели' }))).toEqual([]);
  });
  it('поиск: слова из разных псевдонимов не складываются', () => {
    const list = [ex('a', 'Мобильность таза', { aliases: ['Мобильность ТБС, Кор', 'Мобильность таза, комплекс'] }), ex('b', 'Кор-комплекс')];
    expect(ids(filterCatalog(list, { ...EMPTY_FILTER, query: 'кор комплекс' }))).toEqual(['b']);
    expect(ids(filterCatalog(list, { ...EMPTY_FILTER, query: 'таза комплекс' }))).toEqual(['a']);
  });
  it('тип, оборудование, свои', () => {
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, kind: 'cardio' }))).toEqual(['run']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, equipment: 'cable' }))).toEqual(['row']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, onlyCustom: true }))).toEqual(['own']);
  });
  it('группа мышц — по основным мышцам, а не по вспомогательным', () => {
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, group: 'chest' }))).toEqual(['bench']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, group: 'arms' }))).toEqual([]);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, group: 'legs' }))).toEqual(['squat']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, group: 'glutes' }))).toEqual(['squat']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, group: 'core' }))).toEqual(['plank']);
  });
  it('фильтры комбинируются', () => {
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, kind: 'strength', equipment: 'barbell', query: 'жим' }))).toEqual(['bench']);
    expect(ids(filterCatalog(items, { ...EMPTY_FILTER, kind: 'cardio', equipment: 'barbell' }))).toEqual([]);
  });
});

describe('rankByQuery', () => {
  const list = [ex('a', 'Тяга штанги в наклоне'), ex('b', 'Становая тяга'), ex('c', 'Тяга')];
  it('точное совпадение, потом начало названия, потом начало слова, потом остальное', () => {
    expect(ids(rankByQuery(list, 'тяга'))).toEqual(['c', 'a', 'b']);
  });
  it('пустой запрос не меняет порядок', () => {
    expect(rankByQuery(list, '  ')).toBe(list);
  });
});

describe('вспомогательные', () => {
  it('muscleGroups без повторов и неизвестных мышц', () => {
    expect(muscleGroups({ muscles: { primary: ['gluteus_maximus', 'gluteus_medius', 'неизвестная'], secondary: [] } })).toEqual(['glutes']);
  });
  it('цвет типа: сила — cobalt, кардио и мобильность — свои', () => {
    expect(kindColorVar('strength')).toBe('var(--strength)');
    expect(kindColorVar('core')).toBe('var(--core)');
    expect(kindColorVar('bodyweight')).toBe('var(--bodyweight)');
    expect(kindColorVar('complex')).toBe('var(--conditioning)');
    expect(kindColorVar('cardio')).toBe('var(--cardio)');
    expect(kindColorVar('mobility')).toBe('var(--mobility)');
  });
  it('режим ввода по типу', () => {
    expect(defaultMetrics('cardio')).toBe('distance_time');
    expect(defaultMetrics('mobility')).toBe('time');
    expect(defaultMetrics('bodyweight')).toBe('reps');
    expect(defaultMetrics('strength')).toBe('weight_reps');
  });
});
