import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { heatLevel, heatmap, weekStreak, weeklyBalance } from '../../domain/balanceMetrics.ts';
import { todayKey } from '../../domain/history.ts';
import { SESSION_TYPE_LABELS } from '../../domain/sessionType.ts';
import { plural } from '../../domain/complexResults.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { BarsBox, Stat } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

const CELL = 12;
const GAP = 3;
const LEVEL_OPACITY = [0, 0.3, 0.6, 1] as const;

function Heatmap({ sessions, today }: TabProps & { today: string }): ReactElement {
  const weeks = useMemo(() => heatmap(sessions, today), [sessions, today]);
  const total = useMemo(() => weeks.flat().reduce((sum, d) => sum + d.count, 0), [weeks]);
  const ref = useRef<HTMLDivElement>(null);
  const width = weeks.length * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;
  // Свежие недели справа: открываем теплокарту прокрученной к ним.
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);

  return (
    <figure className="pg-chart" aria-label="Активность за год">
      <figcaption className="pg-chart__title">Активность за год<span className="pg-chart__hint"> · {total} {plural(total, 'тренировка', 'тренировки', 'тренировок')}</span></figcaption>
      <div className="pg-heat" ref={ref}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Теплокарта: ${total} ${plural(total, 'тренировка', 'тренировки', 'тренировок')} за год`}>
          {weeks.map((week, x) =>
            week.map((d, y) =>
              d.future ? null : (
                <rect key={d.date} x={x * (CELL + GAP)} y={y * (CELL + GAP)} width={CELL} height={CELL} rx={3} style={{ fill: 'var(--surface)' }}>
                  <title>{`${formatDayMonth(d.date)}: ${d.count}`}</title>
                </rect>
              ),
            ),
          )}
          {weeks.map((week, x) =>
            week.map((d, y) =>
              d.count > 0 ? (
                <rect key={`h${d.date}`} x={x * (CELL + GAP)} y={y * (CELL + GAP)} width={CELL} height={CELL} rx={3} style={{ fill: 'var(--strength)', fillOpacity: LEVEL_OPACITY[heatLevel(d.count)] }} />
              ) : null,
            ),
          )}
        </svg>
      </div>
    </figure>
  );
}

export function BalanceTab({ sessions }: TabProps): ReactElement {
  const today = todayKey();
  const weeks = useMemo(() => weeklyBalance(sessions, today, 12), [sessions, today]);
  const streak = useMemo(() => weekStreak(sessions, today), [sessions, today]);
  const label = (w: { week: string }): string => formatDayMonth(w.week);

  if (sessions.length === 0) return <p className="stub">Пока нет тренировок: баланс и регулярность появятся после первой записи.</p>;

  return (
    <>
      <div className="pg-stats">
        <Stat label="НЕДЕЛЬ ПОДРЯД" value={String(streak.current)} sub={`${plural(streak.current, 'неделя', 'недели', 'недель')} с тренировками`} />
        <Stat label="РЕКОРД СЕРИИ" value={String(streak.longest)} sub={plural(streak.longest, 'неделя', 'недели', 'недель')} />
      </div>

      <BarsBox
        title="Тренировки по неделям"
        hint=" · по типам"
        stacked
        data={weeks.map((w) => ({ x: label(w), ...w.sessions }))}
        xKey="x"
        series={[
          { key: 'strength', label: SESSION_TYPE_LABELS.strength, color: 'var(--strength)' },
          { key: 'cardio', label: SESSION_TYPE_LABELS.cardio, color: 'var(--cardio)' },
          { key: 'conditioning', label: SESSION_TYPE_LABELS.conditioning, color: 'var(--conditioning)' },
          { key: 'mobility', label: SESSION_TYPE_LABELS.mobility, color: 'var(--mobility)' },
          { key: 'mixed', label: SESSION_TYPE_LABELS.mixed, color: 'var(--line-strong)' },
        ]}
      />
      <BarsBox
        title="Минуты по неделям"
        hint=" · силовые — остаток длительности"
        stacked
        data={weeks.map((w) => ({ x: label(w), ...w.minutes }))}
        xKey="x"
        series={[
          { key: 'strength', label: 'Сила', color: 'var(--strength)' },
          { key: 'cardio', label: 'Кардио', color: 'var(--cardio)' },
          { key: 'conditioning', label: 'Комплексы', color: 'var(--conditioning)' },
          { key: 'mobility', label: 'Мобильность', color: 'var(--mobility)' },
        ]}
      />
      <Heatmap sessions={sessions} today={today} />
    </>
  );
}
