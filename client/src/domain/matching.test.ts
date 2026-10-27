import { describe, expect, it } from 'vitest';
import { createMatcher, nameKeys, normalizeName } from './matching.ts';

describe('normalizeName', () => {
  it('регистр, ё/е, пробелы и знаки', () => {
    expect(normalizeName('  Подтягивания   в ТРЕНАЖЁРЕ ')).toBe('подтягивания в тренажере');
    expect(normalizeName('Жим-лёжа!')).toBe('жим лежа');
    expect(normalizeName('SkiErg 500 + гребля 500')).toBe('skierg 500 гребля 500');
    expect(normalizeName('   ')).toBe('');
  });
});

describe('nameKeys', () => {
  it('скобки дают три ключа', () => {
    expect(nameKeys('Тяга горизонтальная (seated row)').sort()).toEqual(
      ['seated row', 'тяга горизонтальная', 'тяга горизонтальная seated row'].sort(),
    );
  });
  it('без скобок — один ключ', () => {
    expect(nameKeys('Присед')).toEqual(['присед']);
  });
});

const items = [
  { id: 'squat', name: 'Присед со штангой', aliases: ['Присед', 'Back squat'] },
  { id: 'row', name: 'Тяга горизонтальная', aliases: ['Тяга горизонтальная (seated row)'] },
  { id: 'pullup', name: 'Подтягивания', aliases: [] },
  { id: 'pullup-assist', name: 'Подтягивания в тренажёре', aliases: ['Гравитрон'] },
  { id: 'a', name: 'Планка', aliases: ['Доска'] },
  { id: 'b', name: 'Доска', aliases: [] },
];
const matcher = createMatcher(items);

describe('createMatcher', () => {
  it('находит по названию независимо от регистра и ё/е', () => {
    expect(matcher.match('присед со штангой')).toEqual({ status: 'exact', id: 'squat' });
    expect(matcher.match('ПОДТЯГИВАНИЯ В ТРЕНАЖЕРЕ')).toEqual({ status: 'exact', id: 'pullup-assist' });
  });
  it('находит по псевдониму', () => {
    expect(matcher.match('Присед')).toEqual({ status: 'exact', id: 'squat' });
    expect(matcher.match('гравитрон')).toEqual({ status: 'exact', id: 'pullup-assist' });
    expect(matcher.match('back squat')).toEqual({ status: 'exact', id: 'squat' });
  });
  it('скобки: целиком, без скобок и по содержимому', () => {
    expect(matcher.match('Тяга горизонтальная (seated row)')).toEqual({ status: 'exact', id: 'row' });
    expect(matcher.match('Тяга горизонтальная (в тренажёре)')).toEqual({ status: 'exact', id: 'row' });
    expect(matcher.match('Seated row')).toEqual({ status: 'exact', id: 'row' });
  });
  it('«Подтягивания» и «Подтягивания в тренажёре» — разные упражнения', () => {
    expect(matcher.match('Подтягивания')).toEqual({ status: 'exact', id: 'pullup' });
  });
  it('неизвестное название и пустая строка', () => {
    expect(matcher.match('Становая')).toEqual({ status: 'none' });
    expect(matcher.match('  ')).toEqual({ status: 'none' });
  });
  it('одно название у двух упражнений — неоднозначность', () => {
    expect(matcher.match('Доска')).toEqual({ status: 'ambiguous', ids: ['a', 'b'] });
  });
  it('запомненное сопоставление важнее поиска', () => {
    const m = createMatcher(items, { remembered: [{ alias: 'доска', exerciseId: 'b' }, { alias: 'Мой присед', exerciseId: 'squat' }] });
    expect(m.match('Доска')).toEqual({ status: 'exact', id: 'b' });
    expect(m.match('мой  ПРИСЕД')).toEqual({ status: 'exact', id: 'squat' });
  });
});
