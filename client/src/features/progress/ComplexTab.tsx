import { useMemo, useState, type ReactElement } from 'react';
import { attempts, formatResult, isTimeFormat, plural } from '../../domain/complexResults.ts';
import { chartValue, complexSummaries } from '../../domain/complexMetrics.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { formatDuration } from '../../domain/units.ts';
import { formatDayMonth } from '../../domain/weeks.ts';
import { useComplexes } from '../plan/usePlanData.ts';
import { TrendBox } from './ChartBox.tsx';
import type { TabProps } from './types.ts';

function History({ complexId, format, sessions }: { complexId: string; format: Parameters<typeof isTimeFormat>[0]; sessions: TabProps['sessions'] }): ReactElement {
  const today = todayKey();
  const list = useMemo(() => attempts(complexId, sessions), [complexId, sessions]); // новые сверху
  const best = useMemo(() => {
    let top: (typeof list)[number] | null = null;
    for (const a of [...list].reverse()) if (a.score !== null && (top === null || a.score > (top.score ?? -Infinity))) top = a;
    return top;
  }, [list]);
  const timed = isTimeFormat(format);
  const points = [...list].reverse().flatMap((a) => {
    const v = chartValue(format, a.block.result);
    return v === null ? [] : [{ x: formatDayMonth(a.date), v }];
  });

  return (
    <div className="pg-cx__body">
      {points.length > 1 ? (
        <TrendBox
          title={timed ? 'Время по попыткам' : 'Раунды по попыткам'}
          hint={timed ? ' · меньше — лучше' : undefined}
          data={points}
          xKey="x"
          series={[{ key: 'v', label: timed ? 'Время' : 'Раунды', color: 'var(--conditioning)' }]}
          format={timed ? (v) => formatDuration(v) : undefined}
          reversed={timed}
          height={150}
        />
      ) : null}
      <ul className="pg-cx__history" aria-label="История результатов">
        {list.map((a) => (
          <li key={`${a.sessionId}:${a.block.id}`}>
            <span className="pg-cx__date">{formatDateShort(a.date, today)}</span>
            <span className="pg-cx__result">{formatResult(a.block.format, a.block.result)}</span>
            {a === best ? <span className="pg-cx__record">рекорд</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComplexTab({ sessions }: TabProps): ReactElement {
  const complexes = useComplexes();
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => complexSummaries(complexes ?? [], sessions), [complexes, sessions]);
  const today = todayKey();
  const done = list.filter((c) => c.attempts > 0);

  if (complexes === undefined) return <div aria-busy="true" />;
  if (done.length === 0) {
    return <p className="stub">Пока нет результатов комплексов. Выполните комплекс из библиотеки и внесите результат: здесь появятся история и рекорд.</p>;
  }

  return (
    <>
      <ul className="pg-cx" aria-label="Комплексы с результатами">
        {done.map((c) => (
          <li key={c.complexId} className="pg-cx__item">
            <button type="button" className="pg-cx__head" aria-expanded={open === c.complexId} onClick={() => setOpen(open === c.complexId ? null : c.complexId)}>
              <span className="pg-cx__code">{c.complexId}</span>
              <span className="pg-cx__title">{c.title}</span>
              <span className="pg-cx__meta">
                {c.attempts} {plural(c.attempts, 'попытка', 'попытки', 'попыток')}
                {c.best ? ` · рекорд ${formatResult(c.format, c.best.block.result)}` : ''}
                {c.lastDate ? ` · ${formatDateShort(c.lastDate, today)}` : ''}
              </span>
            </button>
            {open === c.complexId ? <History complexId={c.complexId} format={c.format} sessions={sessions} /> : null}
          </li>
        ))}
      </ul>
      {list.length > done.length ? <p className="stub pg-note">Ещё {list.length - done.length} из библиотеки не делали.</p> : null}
    </>
  );
}
