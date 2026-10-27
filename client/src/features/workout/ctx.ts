import type { CatalogExercise, SessionRecord } from '@splav/shared';
import type { SessionDraft } from '../../domain/sessionEdit.ts';

/** Всё, что нужно карточкам блоков: тренировка, история для подсказок и способ её изменить. */
export interface WorkoutCtx {
  sessionId: string;
  /** Дата редактируемой тренировки: «прошлым» считается то, что было не позже неё. */
  date: string;
  sessions: readonly SessionRecord[];
  catalog: ReadonlyMap<string, CatalogExercise>;
  catalogList: readonly CatalogExercise[];
  update: (fn: (s: SessionDraft) => SessionDraft) => void;
}

export function exerciseName(ctx: Pick<WorkoutCtx, 'catalog'>, exerciseId: string): string {
  return ctx.catalog.get(exerciseId)?.name ?? 'Упражнение удалено';
}
