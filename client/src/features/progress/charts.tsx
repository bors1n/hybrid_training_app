import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
}

function legend(series: Series[]): ReactElement | undefined {
  return series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : undefined;
}

export function TrendChart({ data, xKey, series, height = 180, format, reversed }: CommonProps): ReactElement {
  const fmt = format ? (v: unknown): string => (typeof v === 'number' ? format(v) : String(v)) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={TICK_LINE} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} reversed={reversed} tickFormatter={fmt} />
        <Tooltip {...TOOLTIP} formatter={fmt} />
        {legend(series)}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 3, fill: s.color }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
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
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={TICK_LINE} interval="preserveStartEnd" />
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
