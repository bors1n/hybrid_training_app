import { useMemo, type ReactElement } from 'react';
import { weeklyBalance, type SessionMinutes } from '../../domain/balanceMetrics.ts';
import type { TabProps } from './types.ts';

const PARTS: { key: keyof SessionMinutes; label: string; color: string }[] = [
  { key: 'strength', label: 'Сила', color: 'var(--strength)' },
  { key: 'cardio', label: 'Кардио', color: 'var(--cardio)' },
  { key: 'conditioning', label: 'Комплекс', color: 'var(--conditioning)' },
  { key: 'mobility', label: 'Мобильность', color: 'var(--mobility)' },
];

/** «Баланс недели»: минуты текущей недели по видам одной полосой. Силовые минуты — остаток длительности. */
export function WeekBalanceCard({ sessions, today }: TabProps & { today: string }): ReactElement {
  const minutes = useMemo(() => weeklyBalance(sessions, today, 1)[0]!.minutes, [sessions, today]);
  const total = PARTS.reduce((sum, p) => sum + minutes[p.key], 0);

  return (
    <section className="pg-card" aria-label="Баланс недели">
      <div className="pg-card__head">
        <span className="pg-card__title">Баланс недели</span>
        <span className="sheet__label">МИНУТЫ</span>
      </div>
      <div className="pg-bar" role="img" aria-label={total > 0 ? `Минуты этой недели: ${PARTS.map((p) => `${p.label} ${minutes[p.key]}`).join(', ')}` : 'На этой неделе минут пока нет'}>
        {PARTS.map((p) => (minutes[p.key] > 0 ? <span key={p.key} style={{ width: `${(minutes[p.key] / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <div className="pg-legend-grid">
        {PARTS.map((p) => (
          <span key={p.key} className="pg-legend-item">
            <span className="dot" style={{ background: p.color }} />
            {p.label}
            <span className="pg-legend-item__value">{minutes[p.key]}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
