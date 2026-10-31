import type { SessionRecord } from '@hybridlog/shared';

export interface TabProps {
  /** Все тренировки без удалённых. */
  sessions: readonly SessionRecord[];
}
