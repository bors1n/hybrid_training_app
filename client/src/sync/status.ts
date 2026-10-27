import { create } from 'zustand';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'unauth';

export interface SyncStatus {
  state: SyncState;
  /** Сколько записей ещё не отправлено на сервер. */
  pending: number;
  lastSyncAt: number | null;
}

export const useSyncStatus = create<SyncStatus>(() => ({ state: 'idle', pending: 0, lastSyncAt: null }));

export const setSyncStatus = (patch: Partial<SyncStatus>): void => useSyncStatus.setState(patch);

/** Короткая подпись для значка; null — всё синхронизировано, показывать нечего. */
export function syncLabel({ state, pending }: SyncStatus): string | null {
  if (state === 'syncing') return 'Синхронизация…';
  if (state === 'unauth') return 'Нужен вход';
  if (state === 'error') return 'Ошибка синхронизации';
  if (state === 'offline') return pending > 0 ? `Нет сети · не отправлено: ${pending}` : 'Нет сети';
  if (pending > 0) return `Не синхронизировано: ${pending}`;
  return null;
}
