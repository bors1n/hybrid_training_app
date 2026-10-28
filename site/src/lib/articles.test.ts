import { describe, expect, it } from 'vitest';
import { RUBRICS, formatDate, isoDate, newestFirst, readingMinutes, rubricLabel, rubricPath } from './articles.ts';

describe('рубрики', () => {
  it('пять рубрик из плана, у каждой своя страница', () => {
    expect(RUBRICS.map((r) => r.label)).toEqual(['Программы', 'Бег', 'Силовые', 'Комплексы', 'Восстановление']);
    expect(rubricLabel('running')).toBe('Бег');
    expect(rubricPath('complexes')).toBe('/rubrics/complexes/');
  });
});

describe('время чтения', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'слово').join(' ');
  it('180 слов в минуту, но не меньше минуты', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes(words(50))).toBe(1);
    expect(readingMinutes(words(540))).toBe(3);
    expect(readingMinutes(words(1440))).toBe(8);
  });
  it('разметка, ссылки, картинки и код в счёт не идут', () => {
    const text = `## Заголовок\n\n![обложка](/a.jpg)\n\n[ссылка](https://example.com/очень/длинный/адрес) ${words(178)}\n\n\`\`\`\n${words(900)}\n\`\`\``;
    expect(readingMinutes(text)).toBe(1);
  });
  it('знаки разметки отдельными «словами» не считаются', () => {
    expect(readingMinutes(`${words(179)}\n\n- - - - - - - - - -\n\n| | | |`)).toBe(1);
  });
});

describe('даты и порядок', () => {
  it('русская дата', () => {
    expect(formatDate(new Date('2026-10-28T00:00:00Z'))).toBe('28 октября 2026');
    expect(formatDate(new Date('2027-03-01T00:00:00Z'))).toBe('1 марта 2027');
    expect(isoDate(new Date('2026-10-28T00:00:00Z'))).toBe('2026-10-28');
  });
  it('от новых к старым, при одной дате — по названию; исходный массив не меняется', () => {
    const items = [
      { title: 'Б', date: new Date('2026-10-01') },
      { title: 'Я', date: new Date('2026-10-20') },
      { title: 'А', date: new Date('2026-10-20') },
    ];
    expect(newestFirst(items).map((i) => i.title)).toEqual(['А', 'Я', 'Б']);
    expect(items.map((i) => i.title)).toEqual(['Б', 'Я', 'А']);
  });
});
