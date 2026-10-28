import { useMemo, type ReactElement } from 'react';
import { weekStreak, weeklyBalance } from '../../domain/balanceMetrics.ts';
import { plural } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { SESSION_TYPE_LABELS } from '../../domain/sessionType.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { BarsBox, Stat } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

/** Вкладка «Баланс»: серия недель и недельные графики. «Баланс недели» и «Регулярность» лежат под всеми вкладками. */
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
    </>
  );
}
