import { useCallback, useEffect, useRef, useState } from 'react';
import type { Collection } from '@splav/shared';
import { saveRecord } from '../sync/records.ts';
import { db } from './db.ts';

const SAVE_DELAY_MS = 300;

export type DraftStatus = 'loading' | 'ready' | 'missing';

export interface RecordDraftApi<D> {
  draft: D | null;
  status: DraftStatus;
  /** Применить чистое преобразование; запись в базу уйдёт через долю секунды. */
  update: (fn: (d: D) => D) => void;
  /** Записать немедленно (перед завершением и уходом с экрана). */
  flush: () => Promise<void>;
  saveError: string | null;
}

/**
 * Редактируемая копия записи (тренировки, шаблона). Каждое изменение сразу видно на экране и сохраняется
 * в IndexedDB с небольшой задержкой; запись принудительно уходит, когда вкладка скрывается, закрывается
 * или экран закрывают, — закрытие приложения посреди правки ничего не теряет.
 * `parse` превращает строку из базы в содержимое без полей синхронизации или возвращает null (нет такой записи).
 */
export function useRecordDraft<D extends { id: string }>(collection: Collection, parse: (row: unknown) => D | null, id: string): RecordDraftApi<D> {
  const [draft, setDraft] = useState<D | null>(null);
  const [status, setStatus] = useState<DraftStatus>('loading');
  const [saveError, setSaveError] = useState<string | null>(null);
  const ref = useRef<D | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    const current = ref.current;
    if (!dirty.current || !current) return;
    dirty.current = false;
    try {
      await saveRecord(collection, current as never);
      setSaveError(null);
    } catch (e) {
      dirty.current = true;
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }, [collection]);

  useEffect(() => {
    let cancelled = false;
    ref.current = null;
    dirty.current = false;
    setStatus('loading');
    void db.rows(collection).get(id).then((row) => {
      if (cancelled) return;
      const content = row && row.deletedAt === null ? parseRef.current(row) : null;
      if (!content) {
        setStatus('missing');
        return;
      }
      ref.current = content;
      setDraft(content);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [collection, id, flush]);

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
    (fn: (d: D) => D): void => {
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
