import { useMemo, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { formatResult } from '../../domain/complexResults.ts';
import { complexFeed, complexTotals } from '../../domain/complexMetrics.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { FORMAT_SHORT } from '../../domain/planFormat.ts';
import { Stat } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

/** Вкладка «Комплексы»: итоги и лента выполнений, новые сверху. Одна карточка — комплекс и одно его выполнение. */
export function ComplexTab({ sessions }: TabProps): ReactElement {
  const navigate = useNavigate();
  const today = todayKey();
  const feed = useMemo(() => complexFeed(sessions), [sessions]);
  const totals = useMemo(() => complexTotals(sessions), [sessions]);

  if (feed.length === 0) {
    return <p className="stub">Пока нет результатов комплексов. Выполните комплекс и внесите результат: здесь появятся итоги и лента выполнений.</p>;
  }

  return (
    <>
      <div className="pg-stats pg-stats--three-up">
        <Stat label="Комплексов" value={String(totals.done)} sub="выполнено" />
        <Stat label="Повторов" value={String(totals.reps)} sub="записано" />
        <Stat label="Раундов" value={String(totals.rounds)} sub="всего" />
      </div>

      <ul className="pg-feed" aria-label="Выполненные комплексы">
        {feed.map((f) => (
          <li key={`${f.sessionId}:${f.blockId}`}>
            <button type="button" className="recent-card" onClick={() => navigate(`/workout/${f.sessionId}`)}>
              <span className="recent-card__main">
                <span className="recent-card__label"><span className="dot" style={{ background: 'var(--conditioning)' }} />{formatDateShort(f.date, today).toUpperCase()}</span>
                <span className="recent-card__title">{f.title}</span>
                <span className="recent-card__sub">{FORMAT_SHORT[f.format]}</span>
              </span>
              <span className="recent-card__value">
                {formatResult(f.format, f.result)}
                {f.record ? <small>рекорд</small> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
