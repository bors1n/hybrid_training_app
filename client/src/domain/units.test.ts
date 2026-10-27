import { describe, expect, it } from 'vitest';
import {
  formatDecimal,
  formatDuration,
  formatKm,
  formatPace,
  formatPaceLabel,
  formatWeightReps,
  paceDeviationPct,
  paceFromDistanceTime,
  paceToSpeedKmh,
  parseDecimal,
  parseDuration,
  parseKmToMeters,
  speedKmhToPace,
} from './units.ts';

describe('parseDecimal', () => {
  it.each([
    ['3,09', 3.09],
    ['3.09', 3.09],
    ['85', 85],
    [' 18,5 ', 18.5],
    ['1 234,5', 1234.5],
    ['1 234,5', 1234.5],
    ['-2,5', -2.5],
    ['.5', 0.5],
    ['5,', 5],
  ])('%s → %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '1,2,3', '1.2.3', '12a', '--1', ',', '1,234.5'])('«%s» → null', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('formatDecimal', () => {
  it('десятичная запятая и без лишних нулей', () => {
    expect(formatDecimal(85)).toBe('85');
    expect(formatDecimal(3.09)).toBe('3,09');
    expect(formatDecimal(87.5)).toBe('87,5');
    expect(formatDecimal(6.8)).toBe('6,8');
    expect(formatDecimal(3.0900001)).toBe('3,09');
  });
});

describe('parseDuration', () => {
  it.each([
    ['24:08', 1448],
    ['1:05:10', 3910],
    ['1:30', 90],
    ['10:00', 600],
    ['0:45', 45],
    ['15:00', 900],
    ["7'46''", 466],
    ["7'46", 466],
    ['7’46”', 466],
    ["8'24''", 504],
    [' 35:51 ', 2151],
  ])('%s → %s с', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', '24', '1:60', '1:2:3:4', '1:75:00', 'abc', '24:8x', '-1:30', "7'75''", '24,5'])('«%s» → null', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('до часа — мм:сс, дальше — ч:мм:сс', () => {
    expect(formatDuration(1448)).toBe('24:08');
    expect(formatDuration(3910)).toBe('1:05:10');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(0)).toBe('0:00');
  });
  it('обратимо с parseDuration', () => {
    for (const sec of [0, 7, 59, 60, 466, 1448, 3599, 3600, 3910, 36000]) {
      expect(parseDuration(formatDuration(sec))).toBe(sec);
    }
  });
});

describe('темп', () => {
  it('3,09 км за 24:08 → расчётный 7:49 (критерий приёмки)', () => {
    const pace = paceFromDistanceTime(3090, 1448);
    expect(pace).toBe(469);
    expect(formatPace(pace!)).toBe('7:49');
    expect(formatPaceLabel(466)).toBe('7:46 /км');
  });
  it('без дистанции или времени темпа нет', () => {
    expect(paceFromDistanceTime(0, 600)).toBeNull();
    expect(paceFromDistanceTime(1000, 0)).toBeNull();
    expect(paceFromDistanceTime(-5, 600)).toBeNull();
  });
  it('темп ↔ скорость', () => {
    expect(paceToSpeedKmh(360)).toBe(10);
    expect(speedKmhToPace(10)).toBe(360);
    expect(paceToSpeedKmh(0)).toBeNull();
    expect(speedKmhToPace(0)).toBeNull();
  });
  it('расхождение темпа с часов и расчётного', () => {
    expect(paceDeviationPct(466, 469)).toBeLessThan(5);
    expect(paceDeviationPct(420, 469)).toBeGreaterThan(5);
  });
});

describe('дистанция и подходы', () => {
  it('километры', () => {
    expect(formatKm(3090)).toBe('3,09 км');
    expect(formatKm(4200)).toBe('4,2 км');
    expect(parseKmToMeters('3,09')).toBe(3090);
    expect(parseKmToMeters('4.2')).toBe(4200);
    expect(parseKmToMeters('-1')).toBeNull();
    expect(parseKmToMeters('x')).toBeNull();
  });
  it('«85 кг × 8»', () => {
    expect(formatWeightReps(85, 8)).toBe('85 кг × 8');
    expect(formatWeightReps(18.5, 12)).toBe('18,5 кг × 12');
    expect(formatWeightReps(undefined, 12)).toBe('12');
    expect(formatWeightReps(60, undefined)).toBe('60 кг');
    expect(formatWeightReps(undefined, undefined)).toBe('—');
  });
});
