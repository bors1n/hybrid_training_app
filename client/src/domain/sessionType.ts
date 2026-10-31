import type { Block, SessionType } from '@hybridlog/shared';

/**
 * Тип тренировки для статистики баланса — по блокам, без разминок, финишей и мобильности.
 * Один вид основной работы — он и есть тип, несколько — «смешанная». Если основной работы нет,
 * решает то, что есть: мобильность, затем кардио (разминка или финиш сами по себе), иначе «смешанная».
 */
export function deriveSessionType(blocks: readonly Block[]): SessionType {
  const main = new Set<SessionType>();
  let hasMobility = false;
  let hasCardio = false;
  for (const b of blocks) {
    if (b.type === 'strength') main.add('strength');
    else if (b.type === 'conditioning') main.add('conditioning');
    else if (b.type === 'cardio') {
      hasCardio = true;
      if (b.role === 'main') main.add('cardio');
    } else hasMobility = true;
  }
  if (main.size === 1) return [...main][0]!;
  if (main.size > 1) return 'mixed';
  if (hasMobility) return 'mobility';
  if (hasCardio) return 'cardio';
  return 'mixed';
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  strength: 'Сила',
  cardio: 'Кардио',
  conditioning: 'Комплекс',
  mobility: 'Мобильность',
  mixed: 'Смешанная',
};

/** Цвет типа: смешанная — цвет силы (основа программы). */
export function sessionTypeColorVar(type: SessionType): string {
  if (type === 'cardio') return 'var(--cardio)';
  if (type === 'conditioning') return 'var(--conditioning)';
  if (type === 'mobility') return 'var(--mobility)';
  return 'var(--strength)';
}
