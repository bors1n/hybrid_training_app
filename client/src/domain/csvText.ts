import Papa from 'papaparse';

/** Колонки шаблона импорта (docs/import_template.csv). Порядок — как в шаблоне и в экспорте. */
export const COLUMNS = [
  'date', 'session', 'session_type', 'duration_min', 'kind', 'order', 'exercise', 'superset', 'set_no',
  'weight_kg', 'load', 'reps', 'per_side', 'duration', 'distance_km', 'modality', 'role', 'pace', 'avg_hr',
  'floors', 'complex_id', 'complex_format', 'time_cap_min', 'rounds', 'extra_reps', 'total_reps', 'notes', 'rpe', 'session_rpe',
] as const;
export type Column = (typeof COLUMNS)[number];

/** Без этих колонок файл не разобрать. */
export const REQUIRED_COLUMNS: readonly Column[] = ['date', 'session', 'kind', 'order'];

export type Cells = Record<Column, string>;

export interface TableRow {
  /** Номер строки в файле: заголовок — 1, первая строка данных — 2. */
  row: number;
  cells: Cells;
}

export interface Table {
  rows: TableRow[];
  /** Обязательные колонки, которых нет в файле. */
  missingColumns: Column[];
}

const clean = (v: unknown): string => (v === null || v === undefined ? '' : String(v).replace(/ /g, ' ').trim());

/**
 * Таблица из массива строк (первая строка — заголовки). Общая для CSV и Excel.
 * Пустые строки пропускаются, но номера остальных сохраняются — ошибки указывают на строку файла.
 * Лишние колонки игнорируются, регистр и пробелы в заголовках не важны.
 */
export function tableFromRows(aoa: readonly (readonly unknown[])[]): Table {
  const header = (aoa[0] ?? []).map((h) => clean(h).replace(/^﻿/, '').toLowerCase());
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (h && !index.has(h)) index.set(h, i);
  });
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !index.has(c));

  const rows: TableRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i] ?? [];
    if (line.every((v) => clean(v) === '')) continue;
    const cells = {} as Cells;
    for (const c of COLUMNS) {
      const at = index.get(c);
      cells[c] = at === undefined ? '' : clean(line[at]);
    }
    rows.push({ row: i + 1, cells });
  }
  return { rows, missingColumns };
}

/** CSV: UTF-8 с BOM и без, разделитель `,` или `;` (определяется сам), кавычки по стандарту. */
export function parseCsvText(text: string): Table {
  const body = text.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(body, { skipEmptyLines: false, delimitersToGuess: [',', ';', '\t', '|'] });
  return tableFromRows(parsed.data);
}

/**
 * Байты CSV в текст. Excel на русской Windows сохраняет «CSV» в кодировке Windows-1251, а не UTF-8:
 * если байты не читаются как UTF-8, пробуем 1251.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Строка CSV для экспорта: заголовок и значения по колонкам шаблона. */
export function toCsvText(rows: readonly Partial<Record<Column, string | number | boolean | undefined>>[]): string {
  const data = rows.map((r) => COLUMNS.map((c) => (r[c] === undefined ? '' : String(r[c]))));
  // Без строк Papa Parse оставляет перевод строки после заголовка — файл должен кончаться последней строкой данных.
  return Papa.unparse({ fields: [...COLUMNS], data }, { newline: '\r\n' }).replace(/\r\n$/, '');
}
