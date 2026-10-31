import { SessionRecordSchema } from '@hybridlog/shared';
import { useRecordDraft, type DraftStatus, type RecordDraftApi } from '../../data/useRecordDraft.ts';
import type { SessionDraft } from '../../domain/sessionEdit.ts';

export type { DraftStatus };
export type SessionDraftApi = RecordDraftApi<SessionDraft>;

function parseSession(row: unknown): SessionDraft | null {
  const parsed = SessionRecordSchema.safeParse(row);
  if (!parsed.success) return null;
  const { updatedAt: _u, deletedAt: _d, ...content } = parsed.data;
  return content;
}

/**
 * Редактируемая копия тренировки: каждое изменение сразу видно и сохраняется (см. useRecordDraft),
 * закрытие приложения посреди тренировки ничего не теряет.
 */
export function useSessionDraft(id: string): SessionDraftApi {
  return useRecordDraft<SessionDraft>('sessions', parseSession, id);
}
