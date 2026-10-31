import type { CardioBlock, SessionRecord } from '@hybridlog/shared';
import { compareSessionsAsc } from './lastPerformance.ts';

type S = Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>;

/** Упражнения из последних тренировок, от свежих к давним, без повторов. */
export function recentExerciseIds(sessions: readonly S[], limit = 12): string[] {
  const seen = new Set<string>();
  const ordered = sessions.filter((s) => s.deletedAt === null).sort(compareSessionsAsc).reverse();
  for (const s of ordered) {
    for (const b of s.blocks) {
      const ids = b.type === 'strength' ? b.items.map((i) => i.exerciseId) : b.type === 'mobility' ? b.items.map((i) => i.exerciseId) : [];
      for (const id of ids) {
        seen.add(id);
        if (seen.size >= limit) return [...seen];
      }
    }
  }
  return [...seen];
}

export interface PastCardio {
  date: string;
  block: CardioBlock;
}

/** Прошлая запись того же вида кардио и с той же ролью, не позже `onOrBefore`. */
export function lastCardio(
  modality: CardioBlock['modality'],
  role: CardioBlock['role'],
  sessions: readonly S[],
  opts: { excludeSessionId?: string; onOrBefore?: string } = {},
): PastCardio | null {
  const ordered = sessions
    .filter((s) => s.deletedAt === null && s.id !== opts.excludeSessionId && (!opts.onOrBefore || s.date <= opts.onOrBefore))
    .sort(compareSessionsAsc)
    .reverse();
  for (const s of ordered) {
    const block = [...s.blocks]
      .reverse()
      .find((b): b is CardioBlock => b.type === 'cardio' && b.modality === modality && b.role === role && (b.distanceM !== undefined || b.durationSec !== undefined));
    if (block) return { date: s.date, block };
  }
  return null;
}
