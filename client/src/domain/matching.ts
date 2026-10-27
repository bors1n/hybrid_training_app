/**
 * Сопоставление названий с упражнениями по псевдонимам: регистр, ё/е, лишние пробелы и знаки,
 * скобки («Тяга горизонтальная (seated row)» находится и по «Тяга горизонтальная», и по «seated row»).
 */

/** Нижний регистр, ё → е, всё кроме букв и цифр — пробел, пробелы схлопнуты. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Все ключи, по которым название должно находиться: целиком, без скобок и содержимое скобок. */
export function nameKeys(name: string): string[] {
  const keys = new Set<string>();
  keys.add(normalizeName(name));
  const inside = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? '');
  const outside = name.replace(/\([^)]*\)/g, ' ');
  keys.add(normalizeName(outside));
  for (const part of inside) keys.add(normalizeName(part));
  keys.delete('');
  return [...keys];
}

export interface Matchable {
  id: string;
  name: string;
  aliases?: readonly string[];
}

export type MatchResult =
  | { status: 'exact'; id: string }
  /** Одно нормализованное название у нескольких упражнений: нужен выбор человека. */
  | { status: 'ambiguous'; ids: string[] }
  | { status: 'none' };

export interface Matcher {
  match(input: string): MatchResult;
}

export interface MatcherOptions {
  /** Запомненные сопоставления (коллекция exerciseAliases): имеют приоритет над поиском. */
  remembered?: readonly { alias: string; exerciseId: string }[];
}

export function createMatcher(items: readonly Matchable[], { remembered = [] }: MatcherOptions = {}): Matcher {
  const index = new Map<string, Set<string>>();
  const add = (key: string, id: string): void => {
    const set = index.get(key) ?? new Set<string>();
    set.add(id);
    index.set(key, set);
  };
  for (const item of items) {
    for (const label of [item.name, ...(item.aliases ?? [])]) for (const key of nameKeys(label)) add(key, item.id);
  }
  const pinned = new Map(remembered.map((r) => [normalizeName(r.alias), r.exerciseId]));

  return {
    match(input) {
      const full = normalizeName(input);
      if (full === '') return { status: 'none' };

      const pin = pinned.get(full);
      if (pin !== undefined) return { status: 'exact', id: pin };

      // Сначала точное совпадение целой строки, и только потом упрощённые ключи (без скобок и т. п.).
      for (const key of [full, ...nameKeys(input).filter((k) => k !== full)]) {
        const ids = index.get(key);
        if (!ids) continue;
        if (ids.size === 1) return { status: 'exact', id: [...ids][0]! };
        return { status: 'ambiguous', ids: [...ids].sort() };
      }
      return { status: 'none' };
    },
  };
}
