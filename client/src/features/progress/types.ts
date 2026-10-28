import type { SessionRecord } from '@splav/shared';

export interface TabProps {
  /** Все тренировки без удалённых. */
  sessions: readonly SessionRecord[];
}
