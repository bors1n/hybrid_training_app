/** Цвета аватара — токены без оранжевого (он занят комплексами и рекордом). */
export const IDENTICON_COLORS = ['var(--cobalt)', 'var(--cardio)', 'var(--bodyweight)', 'var(--core)'] as const;

export const IDENTICON_SIZE = 5;

export interface Identicon {
  /** Строки сетки 5×5, зеркальной по вертикальной оси: `true` — закрашенная клетка. */
  cells: boolean[][];
  color: (typeof IDENTICON_COLORS)[number];
}

/** FNV-1a, 32 бита. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Аватар как на GitHub: 15 бит хэша задают три левые колонки, правые — их зеркало. Одинаковый id даёт
 * одну и ту же картинку на любом устройстве. Пустой рисунок невозможен: без единой клетки включается центр.
 */
export function identicon(seed: string): Identicon {
  const h = fnv1a(seed);
  const cells = Array.from({ length: IDENTICON_SIZE }, () => Array<boolean>(IDENTICON_SIZE).fill(false));
  const half = Math.ceil(IDENTICON_SIZE / 2);
  for (let bit = 0; bit < IDENTICON_SIZE * half; bit += 1) {
    if (((h >>> bit) & 1) === 0) continue;
    const row = bit % IDENTICON_SIZE;
    const col = Math.floor(bit / IDENTICON_SIZE);
    cells[row]![col] = true;
    cells[row]![IDENTICON_SIZE - 1 - col] = true;
  }
  if (!cells.some((r) => r.some(Boolean))) cells[2]![2] = true;
  // Цвет — из старших бит, не пересекающихся с рисунком (биты 0–14).
  return { cells, color: IDENTICON_COLORS[(h >>> 15) % IDENTICON_COLORS.length]! };
}
