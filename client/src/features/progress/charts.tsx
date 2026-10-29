import { useId, type ReactElement } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Графики прогресса. Отдельный файл: Recharts тяжёлый и грузится только при открытии вкладки с графиком. */

export interface Series {
  key: string;
  label: string;
  /** CSS-цвет, обычно токен: `var(--cobalt)`. */
  color: string;
}

type Row = Record<string, string | number | null>;

const AXIS = { fontSize: 11, fill: 'var(--ink-muted)' } as const;
const TICK_LINE = { stroke: 'var(--line-strong)' } as const;
const TOOLTIP = {
  contentStyle: { background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-muted)' },
} as const;

interface CommonProps {
  data: Row[];
  /** Ключ значений по оси X (уже готовая подпись). */
  xKey: string;
  series: Series[];
  height?: number;
  /** Формат подписи значения на оси и в подсказке. */
  format?: (v: number) => string;
  /** Ось вниз: лучше — меньше (темп). */
  reversed?: boolean;
  /** Последняя точка крупнее и оранжевая: свежий результат (как на макете). */
  highlightLast?: boolean;
}

function legend(series: Series[]): ReactElement | undefined {
  return series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : undefined;
}

export function TrendChart({ data, xKey, series, height = 180, format, reversed, highlightLast }: CommonProps): ReactElement {
  const fmt = format ? (v: unknown): string => (typeof v === 'number' ? format(v) : String(v)) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={TICK_LINE} interval="preserveStartEnd" minTickGap={32} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} reversed={reversed} tickFormatter={fmt} />
        <Tooltip {...TOOLTIP} formatter={fmt} />
        {legend(series)}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={(p: { cx?: number; cy?: number; index?: number }) => {
              const { cx, cy, index } = p;
              if (cx === undefined || cy === undefined) return <g key={index} />;
              return highlightLast && index === data.length - 1 ? (
                <circle key={index} cx={cx} cy={cy} r={6} style={{ fill: 'var(--conditioning)', stroke: 'var(--paper)', strokeWidth: 2 }} />
              ) : (
                <circle key={index} cx={cx} cy={cy} r={3.5} style={{ fill: s.color }} />
              );
            }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({ data, xKey, series, height = 180, format, stacked }: CommonProps & { stacked?: boolean }): ReactElement {
  const fmt = format ? (v: unknown): string => (typeof v === 'number' ? format(v) : String(v)) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={TICK_LINE} interval="preserveStartEnd" minTickGap={32} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={fmt} />
        <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--surface)' }} formatter={fmt} />
        {legend(series)}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked ? 0 : [4, 4, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Линия с заливкой-градиентом под ней (как в Strava): объёмы по неделям. Заливка — тот же цвет серии, затухающий вниз. */
export function AreaTrendChart({ data, xKey, series, height = 180, format }: CommonProps): ReactElement {
  const fmt = format ? (v: unknown): string => (typeof v === 'number' ? format(v) : String(v)) : undefined;
  const uid = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.45 }} />
              <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={TICK_LINE} interval="preserveStartEnd" minTickGap={32} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 'auto']} tickFormatter={fmt} />
        <Tooltip {...TOOLTIP} formatter={fmt} />
        {legend(series)}
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} fill={`url(#${uid}-${s.key})`} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
