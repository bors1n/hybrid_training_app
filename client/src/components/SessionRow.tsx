import type { SessionRecord } from '@splav/shared';
import type { ReactElement } from 'react';
import { todayKey } from '../domain/history.ts';
import { formatDateShort } from '../domain/lastPerformance.ts';
import { SESSION_TYPE_LABELS, sessionTypeColorVar } from '../domain/sessionType.ts';
import { sessionDurationMin } from '../domain/summary.ts';

const blocksWord = (n: number): string => (n === 1 ? 'блок' : n >= 2 && n <= 4 ? 'блока' : 'блоков');

const BLOCK_LABELS = { strength: 'сила', cardio: 'кардио', conditioning: 'комплекс', mobility: 'мобильность' } as const;
const BLOCK_COLOR = { strength: 'var(--strength)', cardio: 'var(--cardio)', conditioning: 'var(--conditioning)', mobility: 'var(--mobility)' } as const;

/**
 * Строка тренировки в списках: название, дата, длительность и тип.
 * `variant="dots"` (история) — вместо подписи типа цветные точки по видам блоков и RPE в подзаголовке.
 */
export function SessionRow({ session: s, onOpen, variant = 'chip' }: { session: SessionRecord; onOpen: () => void; variant?: 'chip' | 'dots' }): ReactElement {
  const duration = sessionDurationMin(s);
  const inProgress = s.finishedAt === undefined;
  const sub = [
    formatDateShort(s.date, todayKey()),
    duration !== null && !inProgress ? `${duration} мин` : null,
    variant === 'dots' ? (s.rpe !== undefined ? `RPE ${s.rpe}` : null) : `${s.blocks.length} ${blocksWord(s.blocks.length)}`,
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
      {variant === 'dots' ? (
        <span className="dots" role="img" aria-label={`Блоки: ${[...new Set(s.blocks.map((b) => b.type))].map((t) => BLOCK_LABELS[t]).join(', ') || 'нет'}`}>
          {[...new Set(s.blocks.map((b) => b.type))].map((t) => <span key={t} className="dot" style={{ background: BLOCK_COLOR[t] }} />)}
        </span>
      ) : (
        <span className="tag-pill">
          <span className="dot" style={{ background: sessionTypeColorVar(s.type) }} />
          {SESSION_TYPE_LABELS[s.type]}
        </span>
      )}
    </button>
  );
}
