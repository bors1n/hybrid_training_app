import { SessionRecordSchema } from '@splav/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../data/db.ts';
import type { SessionDraft } from '../../domain/sessionEdit.ts';
import { saveRecord } from '../../sync/records.ts';

const SAVE_DELAY_MS = 300;

export type DraftStatus = 'loading' | 'ready' | 'missing';

export interface SessionDraftApi {
  draft: SessionDraft | null;
  status: DraftStatus;
  /** Применить чистое преобразование тренировки; запись в базу уйдёт через долю секунды. */
  update: (fn: (s: SessionDraft) => SessionDraft) => void;
  /** Записать немедленно (перед завершением и уходом с экрана). */
  flush: () => Promise<void>;
  saveError: string | null;
}

/**
 * Редактируемая копия тренировки. Каждое изменение сразу видно на экране и сохраняется в IndexedDB
 * с небольшой задержкой; запись принудительно уходит, когда вкладка скрывается, закрывается
 * или экран закрывают, — закрытие приложения посреди тренировки ничего не теряет.
 */
export function useSessionDraft(id: string): SessionDraftApi {
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [status, setStatus] = useState<DraftStatus>('loading');
  const [saveError, setSaveError] = useState<string | null>(null);
  const ref = useRef<SessionDraft | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    const current = ref.current;
    if (!dirty.current || !current) return;
    dirty.current = false;
    try {
      await saveRecord('sessions', current);
      setSaveError(null);
    } catch (e) {
      dirty.current = true;
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    ref.current = null;
    dirty.current = false;
    setStatus('loading');
    void db.rows('sessions').get(id).then((row) => {
      if (cancelled) return;
      const parsed = row && row.deletedAt === null ? SessionRecordSchema.safeParse(row) : null;
      if (!parsed?.success) {
        setStatus('missing');
        return;
      }
      const { updatedAt: _u, deletedAt: _d, ...content } = parsed.data;
      ref.current = content;
      setDraft(content);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [id, flush]);

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = (): void => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flush]);

  const update = useCallback(
    (fn: (s: SessionDraft) => SessionDraft): void => {
      const current = ref.current;
      if (!current) return;
      const next = fn(current);
      if (next === current) return;
      ref.current = next;
      dirty.current = true;
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  return { draft, status, update, flush, saveError };
}
