// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectFormat, parseWodPage } from './wodParse.ts';

const item = (n: number, title: string, desc: string, tags = 'Гимнастика') =>
  `<a href="/Wod/Complex/${n}/" class="WodBlock WodItemsItem"><div class="letters" title="${tags}">G</div><div class="title">${title}</div><div class="desc">${desc}</div></a>`;

describe('detectFormat', () => {
  it.each([
    ['ЗКМБР/AMRAP 23 МИНУТЫ:\n- 9 бурпи', 'AMRAP', 23],
    ['Выполнить на время:\n- 100 махов', 'FOR_TIME', undefined],
    ['Выполнить 3 раунда на время:\n- 20 бурпи', 'ROUNDS', undefined],
    ['Выполнить на время:\n50-40-30-20-10\n- отжимания', 'LADDER', undefined],
    ['EMOM 12 минут:\n- 5 подтягиваний', 'EMOM', 12],
    ['Табата 8 раундов', 'TABATA', undefined],
    ['Работа в своём темпе', 'OTHER', undefined],
  ] as const)('%s → %s', (text, format, cap) => {
    const r = detectFormat(text);
    expect(r.format).toBe(format);
    expect(r.timeCapMin).toBe(cap);
  });
});

describe('parseWodPage', () => {
  it('разбирает карточки: номер, название, состав с переносами, теги, ссылка на источник', () => {
    document.body.innerHTML =
      item(426, 'Ellen (Эллен)', '<strong>Выполнить 3 раунда на время:</strong><br />- 20 бурпи<br />- 12 трастеры', 'Работа с отягощением, Гимнастика') +
      item(427, 'Hotel Workout 3', 'Выполнить на время:<br />50-40-30-20-10<br />- отжимания<br /> ');
    const list = parseWodPage(document);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      id: 'wod:426',
      title: 'Ellen (Эллен)',
      format: 'ROUNDS',
      description: 'Выполнить 3 раунда на время:\n- 20 бурпи\n- 12 трастеры',
      tags: ['Работа с отягощением', 'Гимнастика'],
      sourceUrl: 'https://sportkuznica.com/Wod/Complex/426/',
    });
    expect(list[1]).toMatchObject({ id: 'wod:427', format: 'LADDER', description: 'Выполнить на время:\n50-40-30-20-10\n- отжимания' });
  });

  it('карточки без номера, названия или состава пропускаются', () => {
    document.body.innerHTML = '<a class="WodItemsItem" href="/x/"><div class="title">Без номера</div><div class="desc">a</div></a><a class="WodItemsItem" href="/Wod/Complex/5/"><div class="desc">нет названия</div></a>';
    expect(parseWodPage(document)).toEqual([]);
  });
});
