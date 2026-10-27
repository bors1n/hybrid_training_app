import { readFileSync } from 'node:fs';
import type { SessionRecord } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { COLUMNS, parseCsvText } from './csvText.ts';
import { exportSessionsCsv } from './exportCsv.ts';
import { buildImport, type ImportOptions } from './importCsv.ts';
import { createMatcher } from './matching.ts';

const TEMPLATE = readFileSync(new URL('../../../docs/import_template.csv', import.meta.url), 'utf8');

const ITEMS = [
  { id: 'ex:squat', name: 'Присед со штангой' },
  { id: 'ex:lunge', name: 'Выпады с гантелями' },
  { id: 'ex:core', name: 'Кор-комплекс' },
  { id: 'ex:pullup', name: 'Подтягивания' },
  { id: 'ex:curl', name: 'Бицепс с гантелями' },
  { id: 'ex:legraise', name: 'Подъёмы ног в висе' },
  { id: 'ex:assisted', name: 'Подтягивания в тренажёре' },
  { id: 'ex:backext', name: 'Гиперэкстензия' },
];
const names = new Map(ITEMS.map((i) => [i.id, i.name]));
const nameOf = (id: string) => names.get(id);
const opts: ImportOptions = { today: '2026-10-27', matcher: createMatcher(ITEMS) };

const imported = (csv: string) => buildImport(parseCsvText(csv), opts);
const records = (csv: string): SessionRecord[] => imported(csv).sessions.map((s) => ({ ...s.draft, updatedAt: 1, deletedAt: null }) as SessionRecord);

describe('формат файла', () => {
  const out = exportSessionsCsv(records(TEMPLATE), nameOf);
  const lines = out.csv.replace(/^﻿/, '').split('\r\n');

  it('UTF-8 с BOM (Excel на Windows), заголовок — колонки шаблона в том же порядке', () => {
    expect(out.csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe(TEMPLATE.split('\n')[0]!.trim());
    expect(lines[0]!.split(',')).toEqual([...COLUMNS]);
  });
  it('даты ДД.ММ.ГГГГ, десятичная точка, время мм:сс; сначала старые тренировки', () => {
    const rows = parseCsvText(out.csv).rows.map((r) => r.cells);
    expect(rows[0]).toMatchObject({ date: '08.03.2026', session: 'Pull day', kind: 'set', exercise: 'Гиперэкстензия', duration: '1:30', notes: 'статика' });
    expect(rows.at(-1)).toMatchObject({ date: '23.10.2026', session: 'Тренировка 2' });
    expect(rows.find((r) => r.exercise === 'Подтягивания в тренажёре')).toMatchObject({ weight_kg: '18.5', load: 'assisted', reps: '12' });
    expect(rows.find((r) => r.modality === 'run' && r.distance_km === '3.09')).toMatchObject({ duration: '24:08', pace: '7:46', role: 'main' });
  });
  it('обычный вес в колонке load не пишется; per_side — 1; суперсет — буква', () => {
    const rows = parseCsvText(out.csv).rows.map((r) => r.cells);
    expect(rows.find((r) => r.exercise === 'Присед со штангой')!.load).toBe('');
    expect(rows.filter((r) => r.exercise === 'Выпады с гантелями').every((r) => r.per_side === '1')).toBe(true);
    const ss = rows.filter((r) => r.exercise === 'Бицепс с гантелями' || r.exercise === 'Подъёмы ног в висе');
    expect(ss.map((r) => r.superset)).toEqual(['A', 'A']);
    expect(ss[0]!.order).toBe(ss[1]!.order);
  });
  it('общие данные тренировки — в первой строке: тип, длительность, RPE; номера подходов с единицы', () => {
    const rows = parseCsvText(out.csv).rows.map((r) => r.cells).filter((r) => r.session === 'Тренировка 1');
    expect(rows[0]).toMatchObject({ session_type: 'mixed', session_rpe: '8' });
    expect(rows.slice(1).every((r) => r.session_type === '')).toBe(true);
    expect(rows.filter((r) => r.exercise === 'Присед со штангой').map((r) => r.set_no)).toEqual(['1', '2', '3']);
  });
  it('расчётный темп в файл не пишется — только темп с часов', () => {
    const rows = parseCsvText(exportSessionsCsv(records(file({ pace: '' })), nameOf).csv).rows;
    expect(rows[0]!.cells.pace).toBe('');
  });
  it('счётчики', () => {
    expect(out).toMatchObject({ sessions: 9, rows: 19, warnings: [] });
  });
});

function file(extra: Record<string, string>): string {
  const h = [...COLUMNS].join(',');
  const cells: Record<string, string> = { date: '29.05.2026', session: 'Бег', kind: 'cardio', order: '1', exercise: 'Бег', duration: '24:08', distance_km: '3.09', modality: 'run', role: 'main', ...extra };
  const q = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${h}\n${COLUMNS.map((c) => q(cells[c] ?? '')).join(',')}`;
}

describe('импорт ∘ экспорт = тождество', () => {
  it('шаблон: импорт → экспорт → импорт даёт те же тренировки, блоки и значения', () => {
    const a = imported(TEMPLATE);
    const csv = exportSessionsCsv(records(TEMPLATE), nameOf).csv;
    const b = imported(csv);
    expect(b.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // Экспорт идёт по датам, поэтому предупреждений о порядке строк уже нет
    expect(b.issues).toEqual([]);
    const byId = (p: typeof a) => Object.fromEntries(p.sessions.map((s) => [s.id, s.draft]));
    expect(byId(b)).toEqual(byId(a));
    expect(b.stats).toEqual(a.stats);
  });
  it('повторный экспорт даёт тот же файл (стабильность)', () => {
    const once = exportSessionsCsv(records(TEMPLATE), nameOf).csv;
    const twice = exportSessionsCsv(records(once), nameOf).csv;
    expect(twice).toBe(once);
  });
  it('значения с запятыми, кавычками и переводами строк переживают круг', () => {
    const tricky = file({ notes: 'сказал "ок", ушёл\nпотом вернулся' });
    const a = imported(tricky).sessions[0]!.draft;
    const b = imported(exportSessionsCsv(records(tricky), nameOf).csv).sessions[0]!.draft;
    expect((a.blocks[0] as { notes?: string }).notes).toBe('сказал "ок", ушёл\nпотом вернулся');
    expect(b).toEqual(a);
  });
  it('заметка тренировки (note) переживает круг', () => {
    const csv = `${[...COLUMNS].join(',')}\n20.10.2026,Т,,,set,1,Присед со штангой,,1,85,,8,,,,,,,,,,,,,,,,,\n20.10.2026,Т,,,note,9,,,,,,,,,,,,,,,,,,,,,спал 6 часов,,`;
    const a = imported(csv).sessions[0]!.draft;
    expect(a.notes).toBe('спал 6 часов');
    expect(imported(exportSessionsCsv(records(csv), nameOf).csv).sessions[0]!.draft).toEqual(a);
  });
  it('свои (новые) упражнения экспортируются под своими названиями и находятся при импорте обратно', () => {
    const csv = file({ kind: 'set', modality: '', role: '', distance_km: '', duration: '', exercise: 'Фермерская прогулка', weight_kg: '24', reps: '40', set_no: '1' });
    const first = imported(csv);
    const custom = new Map([...names, ...first.newExercises.map((e) => [e.id, e.name] as const)]);
    const exported = exportSessionsCsv(first.sessions.map((s) => ({ ...s.draft, updatedAt: 1, deletedAt: null }) as SessionRecord), (id) => custom.get(id));
    expect(exported.warnings).toEqual([]);
    expect(parseCsvText(exported.csv).rows[0]!.cells.exercise).toBe('Фермерская прогулка');
  });
});

describe('что не попадает в файл — предупреждения', () => {
  const base = (over: object): SessionRecord =>
    ({ id: 's', date: '2026-10-20', title: 'Т', type: 'strength', blocks: [], updatedAt: 1, deletedAt: null, ...over }) as SessionRecord;
  const strength = (sets: object[], exerciseId = 'ex:squat') => ({ type: 'strength', id: 'b', superset: false, items: [{ exerciseId, sets }] });

  it('невыполненные подходы не экспортируются', () => {
    const out = exportSessionsCsv([base({ blocks: [strength([{ weightKg: 85, reps: 8, done: true, load: 'normal' }, { weightKg: 85, reps: 8, done: false, load: 'normal' }])] })], nameOf);
    expect(parseCsvText(out.csv).rows).toHaveLength(1);
    expect(out.warnings).toEqual(['«Т» 20.10.2026: 1 подходов не отмечены выполненными и не экспортированы']);
  });
  it('подход без повторов и времени записывается, но с предупреждением', () => {
    const out = exportSessionsCsv([base({ blocks: [strength([{ weightKg: 85, done: true, load: 'normal' }])] })], nameOf);
    expect(out.warnings[0]).toMatch(/будет отклонён/);
  });
  it('наклон дорожки, «не уложился», общее время мобильности', () => {
    const out = exportSessionsCsv([base({ blocks: [
      { type: 'cardio', id: 'c', modality: 'treadmill', role: 'main', durationSec: 600, inclinePct: 15 },
      { type: 'conditioning', id: 'k', format: 'FOR_TIME', result: { timeSec: 900, finished: false } },
      { type: 'mobility', id: 'm', durationSec: 600, items: [{ exerciseId: 'ex:core', sets: [] }] },
    ] })], nameOf);
    expect(out.warnings).toHaveLength(3);
    expect(out.warnings.join('\n')).toMatch(/наклон/);
    expect(out.warnings.join('\n')).toMatch(/не уложился/);
    expect(out.warnings.join('\n')).toMatch(/мобильности/);
  });
  it('неизвестное упражнение — под кодом и с предупреждением; пустая тренировка пропускается; удалённые не выгружаются', () => {
    const out = exportSessionsCsv([
      base({ blocks: [strength([{ reps: 5, done: true, load: 'normal' }], 'ex:deleted')] }),
      base({ id: 'e', title: 'Пустая', blocks: [] }),
      base({ id: 'd', title: 'Удалённая', deletedAt: 5, blocks: [strength([{ reps: 5, done: true, load: 'normal' }])] }),
    ], nameOf);
    const rows = parseCsvText(out.csv).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.exercise).toBe('ex:deleted');
    expect(out.warnings.some((w) => /не найдено в каталоге/.test(w))).toBe(true);
    expect(out.warnings.some((w) => /Пустая.*нет данных/.test(w))).toBe(true);
  });
  it('без тренировок — только заголовок', () => {
    const out = exportSessionsCsv([], nameOf);
    expect(out.csv.replace(/^﻿/, '')).toBe([...COLUMNS].join(','));
    expect(out).toMatchObject({ sessions: 0, rows: 0 });
  });
});
