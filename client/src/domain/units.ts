/**
 * Разбор и форматирование величин. Хранение: кг, метры, секунды, с/км; здесь только преобразования
 * между этими числами и текстом на экране (десятичная запятая, «7:46 /км», «85 кг × 8»).
 */

const NBSP = /[  \s]/g;

/** Число с точкой или запятой: «3,09», «3.09», «85», «1 234,5». Некорректный ввод даёт null. */
export function parseDecimal(input: string): number | null {
  const s = input.replace(NBSP, '');
  if (s === '' || !/^[+-]?\d*[.,]?\d+$|^[+-]?\d+[.,]$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Десятичная запятая, без хвостовых нулей: 85 → «85», 3.09 → «3,09», 87.5 → «87,5». */
export function formatDecimal(n: number, maxFraction = 2): string {
  const rounded = Number(n.toFixed(maxFraction));
  return String(rounded).replace('.', ',');
}

/**
 * Длительность в секундах. Понимает «24:08», «1:05:10», «1:30», а также темп с часов
 * «7'46''» / «7’46”» / «7'46». Голое число — неоднозначно (секунды? минуты?), поэтому null.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().replace(/[’′`´]/g, "'").replace(/[”″]/g, '"');

  const tick = /^(\d{1,3})'\s*(\d{1,2})(?:''|")?$/.exec(s);
  if (tick) {
    const [m, sec] = [Number(tick[1]), Number(tick[2])];
    return sec < 60 ? m * 60 + sec : null;
  }

  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number) as number[];
  if (parts.length === 3) {
    const [h, m, sec] = nums as [number, number, number];
    return m < 60 && sec < 60 ? h * 3600 + m * 60 + sec : null;
  }
  const [m, sec] = nums as [number, number];
  return sec < 60 ? m * 60 + sec : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 1448 → «24:08», 3910 → «1:05:10». */
export function formatDuration(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Расчётный темп, с/км. Нет дистанции или времени — null. */
export function paceFromDistanceTime(distanceM: number, durationSec: number): number | null {
  if (!(distanceM > 0) || !(durationSec > 0)) return null;
  return Math.round(durationSec / (distanceM / 1000));
}

/** «7:46». */
export function formatPace(secPerKm: number): string {
  return formatDuration(secPerKm);
}

/** «7:46 /км». */
export function formatPaceLabel(secPerKm: number): string {
  return `${formatPace(secPerKm)} /км`;
}

export function paceToSpeedKmh(secPerKm: number): number | null {
  return secPerKm > 0 ? 3600 / secPerKm : null;
}

export function speedKmhToPace(kmh: number): number | null {
  return kmh > 0 ? Math.round(3600 / kmh) : null;
}

/** 3090 → «3,09 км». */
export function formatKm(distanceM: number): string {
  return `${formatDecimal(distanceM / 1000, 2)} км`;
}

/** Километры как число метров: «3,09» → 3090. */
export function parseKmToMeters(input: string): number | null {
  const km = parseDecimal(input);
  return km === null || km < 0 ? null : Math.round(km * 1000);
}

/** «85 кг × 8». Без веса — только повторы; без повторов — только вес. */
export function formatWeightReps(weightKg: number | undefined, reps: number | undefined): string {
  const w = weightKg === undefined ? null : `${formatDecimal(weightKg)} кг`;
  const r = reps === undefined ? null : String(reps);
  if (w && r) return `${w} × ${r}`;
  return w ?? r ?? '—';
}

/** Расхождение двух темпов в процентах от первого (для предупреждения при импорте: >5%). */
export function paceDeviationPct(recorded: number, computed: number): number {
  return (Math.abs(recorded - computed) / computed) * 100;
}
