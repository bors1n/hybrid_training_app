import type { SessionRecord } from '@hybridlog/shared';
import { cardioEntries, type CardioEntry } from './cardioMetrics.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/** Последнее кардио любого вида: основная часть (не разминка и не финиш) с дистанцией или временем. */
export function lastCardioEntry(sessions: readonly S[]): CardioEntry | null {
  const main = cardioEntries(sessions).filter((e) => e.block.role === 'main');
  return main.at(-1) ?? null;
}
