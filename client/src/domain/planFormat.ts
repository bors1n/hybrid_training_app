import type { ConditioningBlock, ConditioningResult, PlanSets } from '@splav/shared';
import { formatDecimal, formatDuration } from './units.ts';
import { isTimeFormat } from './complexResults.ts';

const range = (a: number | undefined, b: number | undefined, f: (n: number) => string = String): string | null => {
  if (a === undefined && b === undefined) return null;
  if (a === undefined) return f(b!);
  return b === undefined || b === a ? f(a) : `${f(a)}–${f(b)}`;
};

/** «3 × 6–8 · 85 кг», «3 × 10–12 на сторону · 14–16 кг», «3 × 6–8 · +5–10 кг». */
export function formatPlan(p: PlanSets): string {
  const reps = range(p.repsMin, p.repsMax);
  const time = p.durationSec !== undefined ? formatDuration(p.durationSec) : null;
  const count = reps ? `${p.sets} × ${reps}` : time ? `${p.sets} × ${time}` : `${p.sets} подх.`;
  const weight = range(p.weightKg, p.weightKgMax, (n) => formatDecimal(n));
  const w = weight ? `${p.load === 'added' ? '+' : p.load === 'assisted' ? '−' : ''}${weight} кг${p.load === 'assisted' ? ' (противовес)' : ''}` : null;
  return [`${count}${p.perSide ? ' на сторону' : ''}`, w].filter(Boolean).join(' · ');
}

/** «5–10 мин», «15 мин», «» — для диапазонов времени в шаблонах. */
export function formatMinutesRange(minSec: number | undefined, maxSec: number | undefined): string {
  const r = range(minSec === undefined ? undefined : Math.round(minSec / 60), maxSec === undefined ? undefined : Math.round(maxSec / 60));
  return r ? `${r} мин` : '';
}

/** Короткая запись результата комплекса для плитки: «9», «9+12», «12:35», «184». */
export function shortResult(format: ConditioningBlock['format'], r: ConditioningResult): string {
  if (isTimeFormat(format) && r.timeSec !== undefined) return r.finished === false ? 'не уложился' : formatDuration(r.timeSec);
  if (r.rounds !== undefined) return r.extraReps ? `${r.rounds}+${r.extraReps}` : String(r.rounds);
  if (r.totalReps !== undefined) return String(r.totalReps);
  return '—';
}

export const FORMAT_SHORT: Record<ConditioningBlock['format'], string> = {
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  FOR_TIME: 'на время',
  TABATA: 'табата',
  INTERVALS: 'интервалы',
  LADDER: 'лесенка',
  ROUNDS: 'раунды',
  OTHER: 'другое',
};
