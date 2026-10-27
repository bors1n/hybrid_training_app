import * as XLSX from 'xlsx';
import { tableFromRows, type Table } from '../domain/csvText.ts';

const p2 = (n: number): string => String(n).padStart(2, '0');

/** Формат ячейки с днём или годом — это дата; «h:mm», «[h]:mm», «mm:ss» — время. */
const isDateFormat = (z: string): boolean => /[dy]/i.test(z.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''));

/**
 * Текст ячейки так, как его видит человек в Excel. Даты — ДД.ММ.ГГГГ независимо от региональных
 * настроек файла (в самом файле они хранятся числом), время — как показано («10:00», «24:08»).
 */
function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'n' && typeof cell.v === 'number' && typeof cell.z === 'string' && isDateFormat(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    return `${p2(d.d)}.${p2(d.m)}.${d.y}`;
  }
  if (cell.t === 'b') return cell.v ? '1' : '0';
  if (cell.t === 'e') return '';
  return cell.w ?? String(cell.v);
}

/**
 * Excel (.xlsx, .xls): первый лист. Модуль тяжёлый, поэтому подключается только при выборе Excel-файла.
 * Значения берутся как показаны в ячейках: «10:00» остаётся временем 10:00, а не числом-долей суток.
 */
export function tableFromXlsx(bytes: ArrayBuffer | Uint8Array): Table {
  const book = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true });
  const name = book.SheetNames[0];
  const sheet = name === undefined ? undefined : book.Sheets[name];
  const ref = sheet?.['!ref'];
  if (!sheet || !ref) return tableFromRows([]);

  const range = XLSX.utils.decode_range(ref);
  const aoa: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const line: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) line.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]));
    aoa.push(line);
  }
  return tableFromRows(aoa);
}

/** Для тестов: книга из таблицы значений (Date становится датой Excel). */
export function xlsxBytesFromRows(aoa: unknown[][]): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Лист1');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

export { XLSX };
