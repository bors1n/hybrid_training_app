import { lazy, Suspense, type ComponentProps, type ReactElement } from 'react';

const Trend = lazy(() => import('./charts.tsx').then((m) => ({ default: m.TrendChart })));
const Bars = lazy(() => import('./charts.tsx').then((m) => ({ default: m.BarsChart })));

function Frame({ title, hint, children }: { title: string; hint?: string; children: ReactElement }): ReactElement {
  return (
    <figure className="pg-chart" aria-label={title}>
      <figcaption className="pg-chart__title">{title}{hint ? <span className="pg-chart__hint">{hint}</span> : null}</figcaption>
      <Suspense fallback={<div className="pg-chart__wait" aria-busy="true" />}>{children}</Suspense>
    </figure>
  );
}

type TrendProps = ComponentProps<typeof Trend>;
type BarsProps = ComponentProps<typeof Bars>;

export function TrendBox({ title, hint, ...props }: TrendProps & { title: string; hint?: string }): ReactElement {
  return <Frame title={title} hint={hint}><Trend {...props} /></Frame>;
}

export function BarsBox({ title, hint, ...props }: BarsProps & { title: string; hint?: string }): ReactElement {
  return <Frame title={title} hint={hint}><Bars {...props} /></Frame>;
}

/** Плитка с одной цифрой. */
/** `accent` — оранжевое значение: рекорд. */
export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }): ReactElement {
  return (
    <div className="pg-stat">
      <span className="sheet__label">{label}</span>
      <span className={`pg-stat__value${accent ? ' pg-stat__value--record' : ''}`}>{value}</span>
      {sub ? <span className="pg-stat__sub">{sub}</span> : null}
    </div>
  );
}
