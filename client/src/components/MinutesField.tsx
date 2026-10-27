import type { ReactElement } from 'react';
import { NumberField } from './fields.tsx';

interface Props {
  /** Значение в секундах: в записях время хранится в секундах, на экране — целые минуты. */
  value: number | undefined;
  onCommit: (seconds: number | undefined) => void;
  label: string;
  className?: string;
  placeholder?: string;
}

/** Поле «минуты» для плановых значений шаблона (разминка 5–10 мин). */
export function MinutesField({ value, onCommit, label, className = 'cell', placeholder }: Props): ReactElement {
  return (
    <NumberField
      className={className}
      label={label}
      value={value}
      inputMode="numeric"
      integer
      min={0}
      max={600 * 60}
      placeholder={placeholder ?? 'мин'}
      format={(sec) => String(Math.round(sec / 60))}
      parse={(s) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) * 60 : null)}
      onCommit={onCommit}
    />
  );
}
