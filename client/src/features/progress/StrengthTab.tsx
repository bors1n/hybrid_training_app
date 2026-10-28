import { useMemo, useState, type ReactElement } from 'react';
import { formatDateShort, formatSet } from '../../domain/lastPerformance.ts';
import { todayKey } from '../../domain/history.ts';
import { exerciseSeries, trainedExercises, weeklyTonnage, type ExerciseSeries, type LoadKind } from '../../domain/strengthMetrics.ts';
import { formatDecimal } from '../../domain/units.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { exerciseName } from '../workout/ctx.ts';
import type { WorkoutCtx } from '../workout/ctx.ts';
import { BarsBox, Stat, TrendBox } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

const LOAD_TITLES: Record<LoadKind, string> = {
  normal: 'Обычный вес',
  added: 'С отягощением',
  assisted: 'С противовесом',
};
const LOAD_HINTS: Record<LoadKind, string> = {
  normal: 'Расчётный 1ПМ и тоннаж считаются только здесь.',
  added: 'Вес на поясе или в руках сверх собственного. В 1ПМ и тоннаж не входит.',
  assisted: 'Вес противовеса: чем он меньше, тем сильнее вы. В 1ПМ и тоннаж не входит.',
};
const kg = (n: number): string => `${formatDecimal(n, 1)} кг`;

function SeriesView({ series, name }: { series: ExerciseSeries; name: string }): ReactElement {
  const today = todayKey();
  const last = series.sessions.at(-1)!;
  const best1rm = Math.max(0, ...series.sessions.map((s) => s.e1rmKg ?? 0));
  const bestWeight = series.sessions.flatMap((s) => (s.topWeightKg === null ? [] : [s.topWeightKg]));
  const bestTop = bestWeight.length ? (series.load === 'assisted' ? Math.min(...bestWeight) : Math.max(...bestWeight)) : null;
  const weekly = weeklyTonnage(series);
  const trend = series.sessions.map((s) => ({ x: formatDayMonth(s.date), weight: s.topWeightKg, e1rm: s.e1rmKg }));
  const recent = [...series.sessions].reverse().slice(0, 8);

  return (
    <section className="pg-section" aria-label={`${name}: ${LOAD_TITLES[series.load]}`}>
      <h3 className="pg-section__title">{LOAD_TITLES[series.load]}</h3>
      <p className="pg-section__hint">{LOAD_HINTS[series.load]}</p>

      <div className="pg-stats">
        <Stat label="РАБОЧИЙ ВЕС" value={last.topWeightKg === null ? '–' : kg(last.topWeightKg)} sub={formatDateShort(last.date, today)} />
        {series.load === 'normal' ? <Stat label="1ПМ РАСЧЁТНЫЙ" value={best1rm > 0 ? kg(best1rm) : '–'} sub="лучший, по Эпли" /> : null}
        {series.load !== 'normal' ? <Stat label={series.load === 'assisted' ? 'МИНИМУМ ПРОТИВОВЕСА' : 'МАКСИМУМ'} value={bestTop === null ? '–' : kg(bestTop)} /> : null}
        <Stat label="СРЕДНИЙ RPE" value={series.avgRpe === null ? '–' : formatDecimal(series.avgRpe, 1)} sub={`${series.setsCount} подх.`} />
      </div>

      <TrendBox
        title="Рабочий вес"
        hint={series.load === 'normal' ? ' и расчётный 1ПМ' : undefined}
        data={trend}
        xKey="x"
        format={(v) => formatDecimal(v, 1)}
        reversed={series.load === 'assisted'}
        series={[
          { key: 'weight', label: 'Рабочий вес, кг', color: 'var(--strength)' },
          ...(series.load === 'normal' ? [{ key: 'e1rm', label: '1ПМ, кг', color: 'var(--ink-muted)' }] : []),
        ]}
      />

      {series.load === 'normal' && weekly.length > 0 ? (
        <BarsBox title="Тоннаж по неделям" hint=", кг" data={weekly.map((w) => ({ x: formatDayMonth(w.week), tonnage: w.tonnageKg }))} xKey="x" series={[{ key: 'tonnage', label: 'Тоннаж, кг', color: 'var(--strength)' }]} format={(v) => formatDecimal(v, 0)} />
      ) : null}

      {series.bestByReps.length > 0 ? (
        <table className="pg-table" aria-label={`Лучший подход по повторам, ${LOAD_TITLES[series.load]}`}>
          <caption className="pg-table__caption">Лучший подход по повторам</caption>
          <thead><tr><th>Повторы</th><th>Вес</th><th>Когда</th></tr></thead>
          <tbody>
            {series.bestByReps.map((b) => (
              <tr key={b.reps}><td>{b.reps}</td><td>{kg(b.weightKg)}</td><td>{formatDateShort(b.date, today)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <table className="pg-table" aria-label={`Последние тренировки, ${LOAD_TITLES[series.load]}`}>
        <caption className="pg-table__caption">Последние тренировки</caption>
        <thead><tr><th>Дата</th><th>Подходы</th></tr></thead>
        <tbody>
          {recent.map((s) => (
            <tr key={s.sessionId}><td>{formatDateShort(s.date, today)}</td><td>{s.sets.map(formatSet).join(' · ')}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function StrengthTab({ sessions, catalog }: TabProps & { catalog: WorkoutCtx['catalog'] }): ReactElement {
  const trained = useMemo(() => trainedExercises(sessions), [sessions]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked !== null && trained.some((t) => t.exerciseId === picked) ? picked : (trained[0]?.exerciseId ?? null);
  const series = useMemo(() => (current === null ? [] : exerciseSeries(current, sessions)), [current, sessions]);
  const name = current === null ? '' : exerciseName({ catalog }, current);

  if (trained.length === 0) {
    return <p className="stub">Пока нет выполненных силовых подходов. Как только вы внесёте тренировку, здесь появятся рабочий вес, расчётный 1ПМ и тоннаж.</p>;
  }

  return (
    <>
      <label className="pg-picker">
        <span className="sheet__label">УПРАЖНЕНИЕ</span>
        <select aria-label="Упражнение" value={current ?? ''} onChange={(e) => setPicked(e.target.value)}>
          {trained.map((t) => (
            <option key={t.exerciseId} value={t.exerciseId}>{exerciseName({ catalog }, t.exerciseId)} · {t.sessions}</option>
          ))}
        </select>
      </label>
      {series.map((s) => (
        <SeriesView key={s.load} series={s} name={name} />
      ))}
    </>
  );
}
