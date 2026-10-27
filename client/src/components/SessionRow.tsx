import type { SessionRecord } from '@splav/shared';
import type { ReactElement } from 'react';
import { todayKey } from '../domain/history.ts';
import { formatDateShort } from '../domain/lastPerformance.ts';
import { SESSION_TYPE_LABELS, sessionTypeColorVar } from '../domain/sessionType.ts';
import { sessionDurationMin } from '../domain/summary.ts';

const blocksWord = (n: number): string => (n === 1 ? 'блок' : n >= 2 && n <= 4 ? 'блока' : 'блоков');

/** Строка тренировки в списках: название, дата, длительность, тип. */
export function SessionRow({ session: s, onOpen }: { session: SessionRecord; onOpen: () => void }): ReactElement {
  const duration = sessionDurationMin(s);
  const inProgress = s.finishedAt === undefined;
  const sub = [
    formatDateShort(s.date, todayKey()),
    duration !== null && !inProgress ? `${duration} мин` : null,
    `${s.blocks.length} ${blocksWord(s.blocks.length)}`,
    inProgress ? 'не завершена' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button type="button" className="session-row" onClick={onOpen}>
      <span className="session-row__text">
        <span className="session-row__title">{s.title}</span>
        <span className="session-row__sub">{sub}</span>
      </span>
      <span className="tag-pill">
        <span className="dot" style={{ background: sessionTypeColorVar(s.type) }} />
        {SESSION_TYPE_LABELS[s.type]}
      </span>
    </button>
  );
}
