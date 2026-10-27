import { ExerciseRecordSchema, type CatalogExercise } from '@splav/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../data/db.ts';
import { CATALOG } from '../../seed/catalog.ts';
import { listRecords } from '../../sync/records.ts';

/** Статичный каталог + упражнения, созданные пользователем (они синхронизируются). */
export function useCatalog(): CatalogExercise[] {
  const custom = useLiveQuery(() => listRecords('exercises'), [], []);
  return useMemo(() => {
    const own: CatalogExercise[] = [];
    for (const row of custom) {
      const parsed = ExerciseRecordSchema.safeParse(row);
      if (!parsed.success) continue;
      const { updatedAt: _u, deletedAt: _d, ...content } = parsed.data;
      own.push(content);
    }
    own.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return [...CATALOG, ...own];
  }, [custom]);
}

/** Постоянная заметка к упражнению (id заметки = id упражнения). */
export function useExerciseNote(exerciseId: string): string {
  return useLiveQuery(async () => {
    const row = await db.rows('exerciseNotes').get(exerciseId);
    return row && row.deletedAt === null && typeof row['text'] === 'string' ? row['text'] : '';
  }, [exerciseId], '');
}
