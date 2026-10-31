import { useMemo, useState, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { CARDIO_GROUPS, CARDIO_GROUP_LABELS, cardioBests, cardioEntries, cardioTotals, paceSeries, weeklyCardioFilled, type CardioFilter, type CardioGroup } from '../../domain/cardioMetrics.ts';
import { plural } from '../../domain/complexResults.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDecimal, formatDuration, formatKm, formatPaceLabel } from '../../domain/units.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { AreaBox, BarsBox, Stat, TrendBox } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

const WEEKS = 12;

/** «12 ч 05 мин» или «45 мин». */
function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m} мин`;
}

export function CardioTab({ sessions }: TabProps): ReactElement {
  const [filter, setFilter] = useState<CardioFilter>('all');
  const today = todayKey();
  const entries = useMemo(() => cardioEntries(sessions), [sessions]);
  const counts = useMemo(() => Object.fromEntries(CARDIO_GROUPS.map((g) => [g, entries.filter((e) => e.group === g).length])) as Record<CardioGroup, number>, [entries]);
  const weekly = useMemo(() => weeklyCardioFilled(entries, filter, today, WEEKS), [entries, filter, today]);
  const totals = useMemo(() => cardioTotals(entries, filter), [entries, filter]);
  // «Все» складывает бег, велосипед и остальное, а темп и скорость у них несравнимы: график темпа строится по бегу.
  const paceGroup: CardioGroup = filter === 'all' ? 'run' : filter;
  const pace = useMemo(() => paceSeries(entries, paceGroup), [entries, paceGroup]);
  const bests = useMemo(() => cardioBests(pace), [pace]);
  // Бег меряем темпом (мин/км), велосипед и остальное — скоростью: «темп» на велосипеде никто не читает.
  const bySpeed = paceGroup !== 'run';
  const filterLabel = filter === 'all' ? 'Выносливость' : CARDIO_GROUP_LABELS[filter];

  return (
    <>
      <div className="chips" role="group" aria-label="Вид кардио">
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Все{entries.length > 0 ? ` · ${entries.length}` : ''}</Chip>
        {CARDIO_GROUPS.map((g) => (
          <Chip key={g} on={filter === g} onClick={() => setFilter(g)}>{CARDIO_GROUP_LABELS[g]}{counts[g] > 0 ? ` · ${counts[g]}` : ''}</Chip>
        ))}
      </div>

      {totals.count === 0 ? (
        <p className="stub">{filterLabel}: пока нет записей с дистанцией или временем.</p>
      ) : (
        <>
          {filter === 'all' ? (
            <div className="pg-stats pg-stats--three-up">
              <Stat label="Дистанция" value={formatKm(totals.km * 1000)} sub="всего" />
              <Stat label="Время" value={formatHours(totals.minutes)} sub="всего" />
              <Stat label="Тренировок" value={String(totals.count)} sub={plural(totals.count, 'запись', 'записи', 'записей')} />
            </div>
          ) : (
            <div className="pg-stats">
              <Stat label="Самая длинная" value={bests.longestDistance ? formatKm(bests.longestDistance.distanceM) : '–'} sub={bests.longestDistance ? formatDateShort(bests.longestDistance.date, today) : undefined} />
              {bySpeed ? (
                <Stat label="Самая быстрая" value={bests.fastestSpeed ? `${formatDecimal(bests.fastestSpeed.speedKmh, 1)} км/ч` : '–'} sub={bests.fastestSpeed ? formatDateShort(bests.fastestSpeed.date, today) : 'от 1 км'} />
              ) : (
                <Stat label="Лучший темп" value={bests.bestPace ? formatPaceLabel(bests.bestPace.paceSecPerKm) : '–'} sub={bests.bestPace ? formatDateShort(bests.bestPace.date, today) : 'от 1 км'} />
              )}
              <Stat label="Дольше всего" value={bests.longestTime ? formatDuration(bests.longestTime.durationSec) : '–'} sub={bests.longestTime ? formatDateShort(bests.longestTime.date, today) : undefined} />
            </div>
          )}

          <AreaBox
            title="Километры по неделям"
            data={weekly.map((w) => ({ x: formatDayMonth(w.week), km: w.km }))}
            xKey="x"
            series={[{ key: 'km', label: 'Км', color: 'var(--cardio)' }]}
            format={(v) => formatDecimal(v, 1)}
          />
          <BarsBox title="Минуты по неделям" hint=" · с разминками и финишами" data={weekly.map((w) => ({ x: formatDayMonth(w.week), min: w.minutes }))} xKey="x" series={[{ key: 'min', label: 'Минуты', color: 'var(--cardio)' }]} />

          {pace.length > 0 ? (
            <TrendBox
              title={bySpeed ? 'Скорость по тренировкам' : 'Темп по тренировкам'}
              hint={filter === 'all' ? ' · бег, основная часть' : ' · только основная часть'}
              data={pace.map((p) => ({ x: formatDayMonth(p.date), v: bySpeed ? Math.round(p.speedKmh * 10) / 10 : p.paceSecPerKm }))}
              xKey="x"
              series={[{ key: 'v', label: bySpeed ? 'км/ч' : 'мин/км', color: 'var(--cardio)' }]}
              format={bySpeed ? (v) => formatDecimal(v, 1) : (v) => formatDuration(v)}
              reversed={!bySpeed}
            />
          ) : null}
        </>
      )}
    </>
  );
}
