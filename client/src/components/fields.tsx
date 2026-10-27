import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatDecimal, formatDuration, parseDecimal, parseDuration, parseKmToMeters } from '../domain/units.ts';

interface NumberFieldProps {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  /** Подпись для скринридера и тестов; на экране рядом обычно есть своя надпись. */
  label: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  min?: number;
  max?: number;
  integer?: boolean;
  className?: string;
  format?: (n: number) => string;
  parse?: (s: string) => number | null;
  disabled?: boolean;
}

/**
 * Поле ввода числа. Пока вводят, текст свой; в запись значение уходит при уходе из поля или Enter.
 * Некорректный ввод откатывается к прежнему значению, пустое поле очищает значение.
 */
export function NumberField({
  value,
  onCommit,
  label,
  placeholder,
  inputMode = 'decimal',
  min,
  max,
  integer,
  className = 'cell',
  format = (n) => formatDecimal(n),
  parse = parseDecimal,
  disabled,
}: NumberFieldProps): ReactElement {
  const show = (v: number | undefined): string => (v === undefined ? '' : format(v));
  const [text, setText] = useState(show(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(): void {
    focused.current = false;
    const raw = text.trim();
    if (raw === '') {
      setText('');
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const n = parse(raw);
    const ok = n !== null && (min === undefined || n >= min) && (max === undefined || n <= max) && (!integer || Number.isInteger(n));
    if (!ok) {
      setText(show(value));
      return;
    }
    setText(format(n));
    if (n !== value) onCommit(n);
  }

  return (
    <input
      className={className}
      aria-label={label}
      inputMode={inputMode}
      placeholder={placeholder ?? '–'}
      value={text}
      disabled={disabled}
      autoComplete="off"
      enterKeyHint="done"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Время: «24:08», «1:05:10»; одно число — минуты («15» = 15:00). */
export const parseDurationOrMinutes = (s: string): number | null => {
  const t = s.trim();
  if (/^\d{1,3}$/.test(t)) return Number(t) * 60;
  return parseDuration(t);
};

export function DurationField(props: Omit<NumberFieldProps, 'format' | 'parse' | 'inputMode' | 'integer'>): ReactElement {
  return <NumberField {...props} inputMode="text" integer format={formatDuration} parse={parseDurationOrMinutes} placeholder={props.placeholder ?? 'мм:сс'} />;
}

/** Километры на экране, метры в записи. */
export function DistanceField(props: Omit<NumberFieldProps, 'format' | 'parse' | 'inputMode'>): ReactElement {
  return <NumberField {...props} inputMode="decimal" format={(m) => formatDecimal(m / 1000, 3)} parse={parseKmToMeters} />;
}

interface RpePickerProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Нажатие на выбранное значение очищает его: RPE необязателен. */
  label?: string;
}

export function RpePicker({ value, onChange, label = 'RPE' }: RpePickerProps): ReactElement {
  return (
    <div className="rpe" role="group" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className="rpe__btn"
          aria-pressed={value === n}
          aria-label={`${label} ${n}`}
          onClick={() => onChange(value === n ? undefined : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  ariaLabel?: string;
}

/** Опасное действие в два нажатия: первое просит подтвердить, через 4 с возвращается в исходное состояние. */
export function ConfirmButton({ label, confirmLabel = 'Точно?', onConfirm, className = 'htr-btn htr-btn--ghost', ariaLabel }: ConfirmButtonProps): ReactElement {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? `${className} is-armed` : className}
      aria-label={armed ? confirmLabel : (ariaLabel ?? label)}
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
