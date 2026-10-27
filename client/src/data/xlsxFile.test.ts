import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { buildImport } from '../domain/importCsv.ts';
import { parseCsvText } from '../domain/csvText.ts';
import { createMatcher } from '../domain/matching.ts';
import { tableFromXlsx, XLSX, xlsxBytesFromRows } from './xlsxFile.ts';

const TEMPLATE = readFileSync(new URL('../../../docs/import_template.csv', import.meta.url), 'utf8');
const matcher = createMatcher([{ id: 'ex:squat', name: 'Присед со штангой' }]);
const run = (table: ReturnType<typeof tableFromXlsx>) => buildImport(table, { today: '2026-10-27', matcher });

describe('Excel (.xlsx), первый лист', () => {
  it('шаблон, сохранённый в Excel, разбирается так же, как CSV', () => {
    const aoa = Papa.parse<string[]>(TEMPLATE.replace(/^﻿/, ''), { skipEmptyLines: false }).data;
    const fromXlsx = run(tableFromXlsx(xlsxBytesFromRows(aoa)));
    const fromCsv = buildImport(parseCsvText(TEMPLATE), { today: '2026-10-27', matcher });
    expect(fromXlsx.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(fromXlsx.sessions.map((s) => s.draft)).toEqual(fromCsv.sessions.map((s) => s.draft));
    expect(fromXlsx.stats).toEqual(fromCsv.stats);
  });

  it('ячейка-дата и ячейка-время показываются как в Excel: 20.10.2026 и 10:00 (а не числа и не 10 часов)', () => {
    const sheet = XLSX.utils.aoa_to_sheet(
      [
        ['date', 'session', 'kind', 'order', 'modality', 'duration', 'weight', 'rpe'],
        [new Date(2026, 9, 20), 'Т', 'cardio', 0, 'run', '', '', 7],
      ],
      { cellDates: true },
    );
    sheet['F2'] = { t: 'n', v: 10 / 24, z: 'h:mm' };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Лист1');
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

    const table = tableFromXlsx(bytes);
    expect(table.rows[0]!.cells).toMatchObject({ date: '20.10.2026', duration: '10:00', order: '0', rpe: '7' });
    const plan = run(table);
    expect(plan.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(plan.sessions[0]!.draft).toMatchObject({ date: '2026-10-20', blocks: [{ modality: 'run', durationSec: 600, rpe: 7 }] });
  });

  it('числовые ячейки: вес 18,5 и повторы', () => {
    const bytes = xlsxBytesFromRows([
      ['date', 'session', 'kind', 'order', 'exercise', 'set_no', 'weight_kg', 'reps'],
      ['20.10.2026', 'Т', 'set', 1, 'Присед со штангой', 1, 18.5, 8],
    ]);
    const plan = run(tableFromXlsx(bytes));
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({ items: [{ exerciseId: 'ex:squat', sets: [{ weightKg: 18.5, reps: 8 }] }] });
  });

  it('нужна только первая книга-лист; пустой файл — понятное сообщение об отсутствующих колонках', () => {
    const empty = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([]), 'Пусто');
    const table = tableFromXlsx(new Uint8Array(XLSX.write(empty, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer));
    expect(table.missingColumns).toEqual(['date', 'session', 'kind', 'order']);
  });
});
