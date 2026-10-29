import type { ComplexRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { buildComplexLibrary, complexSource, complexSourceUrl, isReadOnlyComplex } from './complexLibrary.ts';

const rec = (id: string, title = id): ComplexRecord => ({ id, updatedAt: 5, deletedAt: null, title, format: 'AMRAP', description: '', tags: [] });
const wod = (n: number) => ({ id: `wod:${n}`, title: `W${n}`, format: 'FOR_TIME' as const, description: 'd', tags: ['Гимнастика'], sourceUrl: '' });

describe('complexLibrary', () => {
  it('источник по id; библиотека только для чтения; ссылка на сайт', () => {
    expect([complexSource('#001'), complexSource('own:x'), complexSource('wod:7')]).toEqual(['author', 'own', 'library']);
    expect(isReadOnlyComplex('wod:7')).toBe(true);
    expect(isReadOnlyComplex('#001')).toBe(false);
    expect(complexSourceUrl('wod:7')).toBe('https://sportkuznica.com/Wod/Complex/7/');
    expect(complexSourceUrl('#001')).toBeNull();
  });

  it('склеивает записи и библиотеку: автор → свои → библиотека; без wods.json — только записи', () => {
    const list = buildComplexLibrary([rec('own:b', 'Яблоко'), rec('#002'), rec('own:a', 'Арбуз'), rec('#001')], [wod(10), wod(2)]);
    expect(list.map((c) => c.id)).toEqual(['#001', '#002', 'own:a', 'own:b', 'wod:2', 'wod:10']);
    expect(buildComplexLibrary([rec('#001')], []).map((c) => c.id)).toEqual(['#001']);
  });

  it('запись пользователя с тем же id побеждает статичную', () => {
    const mine = rec('wod:2', 'Моя версия');
    expect(buildComplexLibrary([mine], [wod(2)]).find((c) => c.id === 'wod:2')?.title).toBe('Моя версия');
  });
});
