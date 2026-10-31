import type { ComplexRecord } from '@hybridlog/shared';
import { WOD_SITE, type WodRecord } from '../seed/wodParse.ts';

/** Откуда комплекс: автор программы (#001…), общая библиотека (wod:…) или свой (own:…). */
export type ComplexSource = 'author' | 'library' | 'own';

export function complexSource(id: string): ComplexSource {
  if (id.startsWith('#')) return 'author';
  if (id.startsWith('wod:')) return 'library';
  return 'own';
}

/** Комплексы общей библиотеки только для чтения: их можно добавить в программу или тренировку, но не править. */
export const isReadOnlyComplex = (id: string): boolean => complexSource(id) === 'library';

/** Ссылка на комплекс на сайте-источнике (только для `wod:`). */
export function complexSourceUrl(id: string): string | null {
  const n = /^wod:(\d+)$/.exec(id)?.[1];
  return n ? `${WOD_SITE}/Wod/Complex/${n}/` : null;
}

const RANK: Record<ComplexSource, number> = { author: 0, own: 1, library: 2 };

/**
 * Одна карта комплексов: записи пользователя (комплексы автора и свои, синхронизируются) и статичная
 * библиотека. При совпадении id побеждает запись пользователя. Порядок: автор, свои, библиотека.
 */
export function buildComplexLibrary(records: readonly ComplexRecord[], wods: readonly WodRecord[]): ComplexRecord[] {
  const byId = new Map<string, ComplexRecord>();
  for (const w of wods) {
    byId.set(w.id, { id: w.id, updatedAt: 0, deletedAt: null, title: w.title, format: w.format, description: w.description, tags: w.tags, ...(w.timeCapMin !== undefined ? { timeCapMin: w.timeCapMin } : {}) });
  }
  for (const r of records) byId.set(r.id, r);
  const num = (id: string): number => Number(/\d+/.exec(id)?.[0] ?? 0);
  return [...byId.values()].sort((a, b) => {
    const ra = RANK[complexSource(a.id)];
    const rb = RANK[complexSource(b.id)];
    if (ra !== rb) return ra - rb;
    return ra === 1 ? a.title.localeCompare(b.title, 'ru') : num(a.id) - num(b.id) || a.id.localeCompare(b.id);
  });
}
