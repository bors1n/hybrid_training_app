import type { CardioBlock, SessionRecord } from '@splav/shared';
import { lastCardio } from './recent.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

export interface LastRun {
  date: string;
  block: CardioBlock;
}

/** Последняя пробежка: бег на улице или по дорожке, основная часть (не разминка), с дистанцией. */
export function lastRun(sessions: readonly S[]): LastRun | null {
  const runs = [lastCardio('run', 'main', sessions), lastCardio('treadmill', 'main', sessions)].flatMap((r) =>
    r && r.block.distanceM !== undefined ? [r] : [],
  );
  if (runs.length === 0) return null;
  return runs.sort((a, b) => b.date.localeCompare(a.date))[0]!;
}
