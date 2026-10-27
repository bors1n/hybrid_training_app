import { ExerciseRecordSchema } from '@splav/shared';
import { COLLECTIONS } from '@splav/shared';
import { exportSessionsCsv, type ExportResult } from '../domain/exportCsv.ts';
import { CATALOG_BY_ID } from '../seed/catalog.ts';
import { listRecords } from '../sync/records.ts';
import { db, type SplavDB } from './db.ts';
import { loadSessions } from './importService.ts';

/** Все тренировки в формате шаблона импорта. Названия упражнений — из каталога и своих. */
export async function exportAllSessionsCsv(database: SplavDB = db): Promise<ExportResult> {
  const sessions = await loadSessions(database);
  const custom = new Map<string, string>();
  for (const row of await listRecords('exercises', database)) {
    const p = ExerciseRecordSchema.safeParse(row);
    if (p.success) custom.set(p.data.id, p.data.name);
  }
  return exportSessionsCsv(sessions, (id) => CATALOG_BY_ID.get(id)?.name ?? custom.get(id));
}

export interface JsonExport {
  app: 'SPLAV';
  version: 1;
  exportedAt: string;
  collections: Record<string, unknown[]>;
}

/** Полная копия данных: все коллекции (без удалённых записей). Каталог RepDB в неё не входит. */
export async function exportAllJson(database: SplavDB = db, now: Date = new Date()): Promise<{ json: string; counts: Record<string, number> }> {
  const collections: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) {
    const rows = await listRecords(c, database);
    collections[c] = rows;
    counts[c] = rows.length;
  }
  const payload: JsonExport = { app: 'SPLAV', version: 1, exportedAt: now.toISOString(), collections };
  return { json: JSON.stringify(payload, null, 2), counts };
}

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Отдаёт файл человеку. На iPhone — через системное меню «Поделиться» (сохранить в «Файлы», отправить),
 * где оно доступно; иначе обычное скачивание.
 */
export async function saveTextFile(filename: string, text: string, mime: string): Promise<SaveOutcome> {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Не получилось поделиться — падаем на обычное скачивание.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
