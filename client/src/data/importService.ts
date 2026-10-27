import { ExerciseRecordSchema, SessionRecordSchema, type SessionRecord } from '@splav/shared';
import { classifyPlan } from '../domain/importPlan.ts';
import type { ImportPlan } from '../domain/importCsv.ts';
import { normalizeName } from '../domain/matching.ts';
import { saveRecord, listRecords } from '../sync/records.ts';
import { db, type SplavDB } from './db.ts';

export interface ApplyOptions {
  /** Человек подтвердил замену существующих тренировок. Без этого заменяемые тренировки пропускаются. */
  replaceExisting: boolean;
  /** Названия, которые человек вручную сопоставил с упражнением каталога: запоминаются на будущие импорты. */
  manualMatches?: readonly { name: string; exerciseId: string }[];
  database?: SplavDB;
}

export interface ApplyResult {
  added: number;
  replaced: number;
  unchanged: number;
  /** Существующие тренировки, которые не заменены, потому что замену не подтвердили. */
  keptExisting: number;
  exercisesCreated: number;
}

/** Живые тренировки из базы (то, с чем сравнивается файл). */
export async function loadSessions(database: SplavDB = db): Promise<SessionRecord[]> {
  return (await listRecords('sessions', database)).flatMap((r) => {
    const p = SessionRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

/**
 * Записывает план импорта: новые упражнения, запомненные сопоставления и тренировки.
 * Всё идёт через saveRecord, поэтому попадает в очередь синхронизации. Повторный импорт того же файла
 * ничего не создаёт: совпавшие тренировки пропускаются, id упражнений и тренировок детерминированные.
 */
export async function applyImport(plan: ImportPlan, { replaceExisting, manualMatches = [], database = db }: ApplyOptions): Promise<ApplyResult> {
  const existing = await loadSessions(database);
  const classified = classifyPlan(plan, existing);

  // Упражнения — до тренировок, чтобы ссылки в блоках всегда указывали на существующие записи.
  let exercisesCreated = 0;
  const usedIds = new Set(plan.sessions.flatMap((s) => s.draft.blocks.flatMap((b) => (b.type === 'strength' || b.type === 'mobility' ? b.items.map((i) => i.exerciseId) : []))));
  for (const ex of plan.newExercises) {
    if (!usedIds.has(ex.id)) continue;
    const current = await database.rows('exercises').get(ex.id);
    if (current && current.deletedAt === null) continue;
    const parsed = ExerciseRecordSchema.omit({ updatedAt: true, deletedAt: true }).parse({ id: ex.id, ...ex.content });
    await saveRecord('exercises', parsed, { database });
    exercisesCreated += 1;
  }

  for (const m of manualMatches) {
    const key = normalizeName(m.name);
    await saveRecord('exerciseAliases', { id: `alias:${key}`, alias: m.name, exerciseId: m.exerciseId }, { database });
  }

  for (const planned of [...classified.added, ...(replaceExisting ? classified.replaced : [])]) {
    await saveRecord('sessions', planned.draft, { database });
  }

  return {
    added: classified.added.length,
    replaced: replaceExisting ? classified.replaced.length : 0,
    unchanged: classified.unchanged.length,
    keptExisting: replaceExisting ? 0 : classified.replaced.length,
    exercisesCreated,
  };
}
