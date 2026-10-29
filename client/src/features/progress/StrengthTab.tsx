import { useMemo, useState, type ReactElement } from 'react';
import { plural } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort, formatSet } from '../../domain/lastPerformance.ts';
import { exerciseSeries, lastTopSet, overallWeeklyTonnage, recordSet, strengthOverview, trainedExercises, weeklyTonnage, type ExerciseSeries, type LoadKind } from '../../domain/strengthMetrics.ts';
import { formatDecimal, formatWeightReps } from '../../domain/units.ts';
import { daysBetween, formatDayMonth } from '../../domain/weeks.ts';
import type { WorkoutCtx } from '../workout/ctx.ts';
import { exerciseName } from '../workout/ctx.ts';
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

/** Главная карточка по макету: расчётный 1ПМ, динамика, рекорд, последний подход, средний RPE. */
function E1rmCard({ series }: { series: ExerciseSeries }): ReactElement {
  const points = series.sessions.flatMap((s) => (s.e1rmKg === null ? [] : [{ date: s.date, v: s.e1rmKg }]));
  const first = points[0];
  const last = points.at(-1);
  const delta = first && last && points.length > 1 ? Math.round((last.v - first.v) * 10) / 10 : null;
  const record = recordSet(series);
  const lastSet = lastTopSet(series);

  if (!last) return <p className="pg-section__hint">Нет подходов до 12 повторов с весом: расчётный 1ПМ появится, когда они будут.</p>;
  return (
    <>
      <div className="pg-hero">
        <div className="pg-hero__main">
          <span className="sheet__label">РАСЧЁТНЫЙ 1ПМ</span>
          <span className="pg-hero__value">{formatDecimal(last.v, 1)}<span className="pg-hero__unit"> кг</span></span>
        </div>
        {delta !== null && delta !== 0 ? <span className="pg-delta">{delta > 0 ? '+' : '−'}{formatDecimal(Math.abs(delta), 1)} кг</span> : null}
      </div>
      <TrendBox
        title="Расчётный 1ПМ"
        hint=" · по тренировкам"
        data={points.map((p) => ({ x: formatDayMonth(p.date), v: p.v }))}
        xKey="x"
        series={[{ key: 'v', label: '1ПМ, кг', color: 'var(--strength)' }]}
        format={(v) => formatDecimal(v, 1)}
        highlightLast
      />
      <div className="pg-stats pg-stats--three">
        <Stat label="РЕКОРД" value={record ? formatWeightReps(record.weightKg, record.reps) : '–'} accent />
        <Stat label="ПОСЛЕДНИЙ" value={lastSet ? formatWeightReps(lastSet.weightKg, lastSet.reps) : '–'} />
        <Stat label="СР. RPE" value={series.avgRpe === null ? '–' : formatDecimal(series.avgRpe, 1)} />
      </div>
    </>
  );
}

function SeriesView({ series, name }: { series: ExerciseSeries; name: string }): ReactElement {
  const today = todayKey();
  const last = series.sessions.at(-1)!;
  const weights = series.sessions.flatMap((s) => (s.topWeightKg === null ? [] : [s.topWeightKg]));
  const bestTop = weights.length ? (series.load === 'assisted' ? Math.min(...weights) : Math.max(...weights)) : null;
  const weekly = weeklyTonnage(series);
  const trend = series.sessions.map((s) => ({ x: formatDayMonth(s.date), weight: s.topWeightKg }));
  const recent = [...series.sessions].reverse().slice(0, 8);

  return (
    <section className="pg-card" aria-label={`${name}: ${LOAD_TITLES[series.load]}`}>
      <h3 className="pg-card__title">{LOAD_TITLES[series.load]}</h3>
      <p className="pg-section__hint">{LOAD_HINTS[series.load]}</p>

      {series.load === 'normal' ? <E1rmCard series={series} /> : null}

      <div className="pg-stats">
        <Stat label="РАБОЧИЙ ВЕС" value={last.topWeightKg === null ? '–' : kg(last.topWeightKg)} sub={formatDateShort(last.date, today)} />
        {series.load !== 'normal' ? <Stat label={series.load === 'assisted' ? 'МИНИМУМ ПРОТИВОВЕСА' : 'МАКСИМУМ'} value={bestTop === null ? '–' : kg(bestTop)} /> : null}
        {series.load !== 'normal' ? <Stat label="СРЕДНИЙ RPE" value={series.avgRpe === null ? '–' : formatDecimal(series.avgRpe, 1)} sub={`${series.setsCount} подх.`} /> : null}
      </div>

      <TrendBox title="Рабочий вес" data={trend} xKey="x" format={(v) => formatDecimal(v, 1)} reversed={series.load === 'assisted'} series={[{ key: 'weight', label: 'Рабочий вес, кг', color: 'var(--strength)' }]} />

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

/** Общая картина по силовым за четыре недели, без привязки к упражнению. */
function OverviewBlock({ sessions }: TabProps): ReactElement {
  const today = todayKey();
  const overview = useMemo(() => strengthOverview(sessions, today), [sessions, today]);
  const weekly = useMemo(() => overallWeeklyTonnage(sessions, today, 12), [sessions, today]);
  return (
    <section aria-label="Силовые в целом">
      <div className="pg-stats">
        <Stat label="ТРЕНИРОВОК" value={String(overview.sessions)} sub="за 4 недели" />
        <Stat label="ПОДХОДОВ" value={String(overview.sets)} sub="за 4 недели" />
        <Stat label="ТОННАЖ" value={`${formatDecimal(overview.tonnageKg / 1000, 1)} т`} sub="за 4 недели" />
      </div>
      <BarsBox
        title="Тоннаж по неделям"
        hint=" · все упражнения, обычный вес"
        data={weekly.map((w) => ({ x: formatDayMonth(w.week), t: Math.round(w.tonnageKg / 100) / 10 }))}
        xKey="x"
        series={[{ key: 't', label: 'Тонн', color: 'var(--strength)' }]}
        format={(v) => formatDecimal(v, 1)}
      />
    </section>
  );
}

export function StrengthTab({ sessions, catalog }: TabProps & { catalog: WorkoutCtx['catalog'] }): ReactElement {
  const trained = useMemo(() => trainedExercises(sessions), [sessions]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked !== null && trained.some((t) => t.exerciseId === picked) ? picked : (trained[0]?.exerciseId ?? null);
  const series = useMemo(() => (current === null ? [] : exerciseSeries(current, sessions)), [current, sessions]);
  const name = current === null ? '' : exerciseName({ catalog }, current);
  const dates = series.flatMap((s) => s.sessions.map((x) => x.date)).sort();
  const weeks = dates.length ? Math.floor(daysBetween(dates[0]!, dates.at(-1)!) / 7) + 1 : 0;

  if (trained.length === 0) {
    return <p className="stub">Пока нет выполненных силовых подходов. Как только вы внесёте тренировку, здесь появятся рабочий вес, расчётный 1ПМ и тоннаж.</p>;
  }

  return (
    <>
      <OverviewBlock sessions={sessions} />
      <div className="pg-picker-row">
        <label className="pg-picker">
          <span className="sr-only">Упражнение</span>
          <select aria-label="Упражнение" value={current ?? ''} onChange={(e) => setPicked(e.target.value)}>
            {trained.map((t) => (
              <option key={t.exerciseId} value={t.exerciseId}>{exerciseName({ catalog }, t.exerciseId)} · {t.sessions}</option>
            ))}
          </select>
          <svg className="pg-picker__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </label>
        <span className="sheet__label">{weeks} {plural(weeks, 'НЕДЕЛЯ', 'НЕДЕЛИ', 'НЕДЕЛЬ')}</span>
      </div>
      {series.map((s) => (
        <SeriesView key={s.load} series={s} name={name} />
      ))}
    </>
  );
}
