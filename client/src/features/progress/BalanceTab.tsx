import { useMemo, type ReactElement } from 'react';
import { FlameIcon } from '../../components/Icons.tsx';
import { BALANCE_WEEKS, strengthEnduranceBalance, weekStreak, weeklyBalance } from '../../domain/balanceMetrics.ts';
import { plural } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { SESSION_TYPE_LABELS } from '../../domain/sessionType.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { BarsBox, Stat } from './ChartBox.tsx';
import { RegularityCard } from './RegularityCard.tsx';
import type { TabProps } from './types.ts';

const PARTS = [
  { key: 'strength', label: 'Сила', color: 'var(--strength)' },
  { key: 'endurance', label: 'Выносливость', color: 'var(--cardio)' },
] as const;

/** Баланс: во сколько тренировок за последние четыре недели была сила и во сколько — выносливость (кардио и комплексы). */
function BalanceCard({ sessions, today }: TabProps & { today: string }): ReactElement {
  const balance = useMemo(() => strengthEnduranceBalance(sessions, today), [sessions, today]);
  const total = balance.strength + balance.endurance;
  const text = PARTS.map((p) => `${p.label} ${balance[p.key]}`).join(', ');

  return (
    <section className="pg-card" aria-label="Баланс">
      <div className="pg-card__head">
        <span className="pg-card__title">Баланс</span>
        <span className="sheet__label">Тренировки · {BALANCE_WEEKS} недели</span>
      </div>
      <div className="pg-bar" role="img" aria-label={total > 0 ? `Тренировки за ${BALANCE_WEEKS} недели: ${text}` : `За ${BALANCE_WEEKS} недели силовых и выносливости пока нет`}>
        {PARTS.map((p) => (balance[p.key] > 0 ? <span key={p.key} style={{ width: `${(balance[p.key] / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <div className="pg-legend-grid">
        {PARTS.map((p) => (
          <span key={p.key} className="pg-legend-item">
            <span className="dot" style={{ background: p.color }} />
            {p.label}
            <span className="pg-legend-item__value">{balance[p.key]}</span>
          </span>
        ))}
      </div>
      <p className="item__hint">Смешанная тренировка (сила и кардио) считается в обе стороны; мобильность не учитывается.</p>
    </section>
  );
}

/** Вкладка «Баланс»: баланс сила — выносливость, серия недель, регулярность и недельные графики. */
export function BalanceTab({ sessions }: TabProps): ReactElement {
  const today = todayKey();
  const weeks = useMemo(() => weeklyBalance(sessions, today, 12), [sessions, today]);
  const streak = useMemo(() => weekStreak(sessions, today), [sessions, today]);
  const label = (w: { week: string }): string => formatDayMonth(w.week);

  if (sessions.length === 0) return <p className="stub">Пока нет тренировок: баланс и регулярность появятся после первой записи.</p>;

  return (
    <>
      <BalanceCard sessions={sessions} today={today} />

      <div className="pg-stats">
        <Stat label="Недель подряд" value={String(streak.current)} sub={`${plural(streak.current, 'неделя', 'недели', 'недель')} с тренировками`} />
        <Stat
          label="Рекорд серии"
          value={
            streak.longest > 0 ? (
              <span className="pg-stat__flame"><span className="pg-stat__flame-icon" role="img" aria-label="Огонёк"><FlameIcon /></span>{streak.longest}</span>
            ) : (
              '0'
            )
          }
          sub={plural(streak.longest, 'неделя', 'недели', 'недель')}
        />
      </div>

      <RegularityCard sessions={sessions} today={today} />

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
