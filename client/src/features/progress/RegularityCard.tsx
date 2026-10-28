import { useMemo, type ReactElement } from 'react';
import { plural } from '../../domain/complexResults.ts';
import { HEATMAP_WEEKS, heatLevel, heatmap } from '../../domain/balanceMetrics.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import type { TabProps } from './types.ts';

const CELL = 10;
const GAP = 2;
/** Уровни насыщенности: пусто, одна тренировка в день, две, три и больше (как на макете). */
const LEVEL_FILL = ['var(--line)', 'var(--sky)', 'var(--cardio)', 'var(--cobalt)'] as const;

/** «Регулярность»: тренировки по дням за полгода. */
export function RegularityCard({ sessions, today }: TabProps & { today: string }): ReactElement {
  const weeks = useMemo(() => heatmap(sessions, today), [sessions, today]);
  const total = useMemo(() => weeks.flat().reduce((sum, d) => sum + d.count, 0), [weeks]);
  const width = HEATMAP_WEEKS * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;

  return (
    <section className="pg-card" aria-label="Регулярность">
      <div className="pg-card__head">
        <span className="pg-card__title">Регулярность</span>
        <span className="sheet__label">6 МЕСЯЦЕВ · {total} {plural(total, 'ТРЕНИРОВКА', 'ТРЕНИРОВКИ', 'ТРЕНИРОВОК')}</span>
      </div>
      <svg className="pg-heat" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Тренировки по дням за 6 месяцев: ${total} ${plural(total, 'тренировка', 'тренировки', 'тренировок')}`}>
        {weeks.map((week, x) =>
          week.map((d, y) =>
            d.future ? null : (
              <rect key={d.date} x={x * (CELL + GAP)} y={y * (CELL + GAP)} width={CELL} height={CELL} rx={2} style={{ fill: LEVEL_FILL[heatLevel(d.count)] }}>
                <title>{`${formatDayMonth(d.date)}: ${d.count}`}</title>
              </rect>
            ),
          ),
        )}
      </svg>
      <div className="pg-legend" aria-hidden="true">
        <span>меньше</span>
        {LEVEL_FILL.map((fill) => <span key={fill} className="pg-legend__cell" style={{ background: fill }} />)}
        <span>больше</span>
      </div>
    </section>
  );
}
