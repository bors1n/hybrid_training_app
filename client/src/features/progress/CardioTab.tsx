import { useMemo, useState, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { CARDIO_GROUPS, CARDIO_GROUP_LABELS, cardioBests, cardioEntries, paceSeries, weeklyCardio, type CardioGroup } from '../../domain/cardioMetrics.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDecimal, formatDuration, formatKm, formatPaceLabel } from '../../domain/units.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { BarsBox, Stat, TrendBox } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

const ROLE_LABELS = { main: 'Основная', warmup: 'Разминка', finisher: 'Финиш' } as const;
const MODALITY_LABELS: Record<string, string> = {
  run: 'Бег', treadmill: 'Дорожка', bike: 'Велосипед', indoor_bike: 'Велотренажёр', skierg: 'SkiErg', row: 'Гребля', stairs: 'Лестница', walk: 'Ходьба', other: 'Другое',
};

export function CardioTab({ sessions }: TabProps): ReactElement {
  const [group, setGroup] = useState<CardioGroup>('run');
  const entries = useMemo(() => cardioEntries(sessions), [sessions]);
  const counts = useMemo(() => Object.fromEntries(CARDIO_GROUPS.map((g) => [g, entries.filter((e) => e.group === g).length])) as Record<CardioGroup, number>, [entries]);
  const weekly = useMemo(() => weeklyCardio(entries, group), [entries, group]);
  const pace = useMemo(() => paceSeries(entries, group), [entries, group]);
  const bests = useMemo(() => cardioBests(pace), [pace]);
  const recent = useMemo(() => entries.filter((e) => e.group === group).slice(-10).reverse(), [entries, group]);
  const today = todayKey();
  // Бег меряем темпом (мин/км), велосипед и остальное — скоростью: «темп» на велосипеде никто не читает.
  const bySpeed = group !== 'run';

  return (
    <>
      <div className="chips" role="group" aria-label="Вид кардио">
        {CARDIO_GROUPS.map((g) => (
          <Chip key={g} on={group === g} onClick={() => setGroup(g)}>{CARDIO_GROUP_LABELS[g]}{counts[g] > 0 ? ` · ${counts[g]}` : ''}</Chip>
        ))}
      </div>

      {recent.length === 0 ? (
        <p className="stub">{CARDIO_GROUP_LABELS[group]}: пока нет записей с дистанцией или временем.</p>
      ) : (
        <>
          <div className="pg-stats">
            <Stat label="САМАЯ ДЛИННАЯ" value={bests.longestDistance ? formatKm(bests.longestDistance.distanceM) : '–'} sub={bests.longestDistance ? formatDateShort(bests.longestDistance.date, today) : undefined} />
            {bySpeed ? (
              <Stat label="САМАЯ БЫСТРАЯ" value={bests.fastestSpeed ? `${formatDecimal(bests.fastestSpeed.speedKmh, 1)} км/ч` : '–'} sub={bests.fastestSpeed ? formatDateShort(bests.fastestSpeed.date, today) : 'от 1 км'} />
            ) : (
              <Stat label="ЛУЧШИЙ ТЕМП" value={bests.bestPace ? formatPaceLabel(bests.bestPace.paceSecPerKm) : '–'} sub={bests.bestPace ? formatDateShort(bests.bestPace.date, today) : 'от 1 км'} />
            )}
            <Stat label="ДОЛЬШЕ ВСЕГО" value={bests.longestTime ? formatDuration(bests.longestTime.durationSec) : '–'} sub={bests.longestTime ? formatDateShort(bests.longestTime.date, today) : undefined} />
          </div>

          <BarsBox title="Километры по неделям" data={weekly.map((w) => ({ x: formatDayMonth(w.week), km: w.km }))} xKey="x" series={[{ key: 'km', label: 'Км', color: 'var(--cardio)' }]} format={(v) => formatDecimal(v, 1)} />
          <BarsBox title="Минуты по неделям" hint=" · с разминками и финишами" data={weekly.map((w) => ({ x: formatDayMonth(w.week), min: w.minutes }))} xKey="x" series={[{ key: 'min', label: 'Минуты', color: 'var(--cardio)' }]} />

          {pace.length > 0 ? (
            <TrendBox
              title={bySpeed ? 'Скорость по тренировкам' : 'Темп по тренировкам'}
              hint=" · только основная часть"
              data={pace.map((p) => ({ x: formatDayMonth(p.date), v: bySpeed ? Math.round(p.speedKmh * 10) / 10 : p.paceSecPerKm }))}
              xKey="x"
              series={[{ key: 'v', label: bySpeed ? 'км/ч' : 'мин/км', color: 'var(--cardio)' }]}
              format={bySpeed ? (v) => formatDecimal(v, 1) : (v) => formatDuration(v)}
              reversed={!bySpeed}
            />
          ) : null}

          <table className="pg-table" aria-label="Последние тренировки">
            <caption className="pg-table__caption">Последние записи</caption>
            <thead><tr><th>Дата</th><th>Что</th><th>Дистанция</th><th>Время</th><th>{bySpeed ? 'км/ч' : 'Темп'}</th></tr></thead>
            <tbody>
              {recent.map((e, i) => (
                <tr key={`${e.sessionId}:${e.block.id}:${i}`}>
                  <td>{formatDateShort(e.date, today)}</td>
                  <td>{MODALITY_LABELS[e.block.modality]}{e.block.role === 'main' ? '' : `, ${ROLE_LABELS[e.block.role].toLowerCase()}`}</td>
                  <td>{e.block.distanceM === undefined ? '–' : formatKm(e.block.distanceM)}</td>
                  <td>{e.block.durationSec === undefined ? '–' : formatDuration(e.block.durationSec)}</td>
                  <td>{bySpeed ? (e.speedKmh === null ? '–' : formatDecimal(e.speedKmh, 1)) : e.paceSecPerKm === null || e.block.role !== 'main' ? '–' : formatPaceLabel(e.paceSecPerKm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
