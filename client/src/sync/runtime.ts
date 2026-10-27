import { createSyncController, type SyncController } from './controller.ts';
import { httpTransport } from './http.ts';
import { onLocalWrite } from './records.ts';
import { setSyncStatus } from './status.ts';

const AFTER_WRITE_MS = 2_000;
const INTERVAL_MS = 60_000;

let controller: SyncController | null = null;

/** Ручной запуск (кнопка в профиле). */
export function triggerSync(): void {
  void controller?.trigger();
}

/**
 * Запускает синхронизацию в браузере. На iOS нет Background Sync, поэтому триггеры такие:
 * старт, возврат в сеть, возврат в приложение, раз в минуту пока оно открыто, 2 с после записи.
 */
export function startSync(onUnauth: () => void): () => void {
  const c = createSyncController({ transport: httpTransport, onStatus: setSyncStatus, onUnauth });
  controller = c;
  let afterWrite: ReturnType<typeof setTimeout> | undefined;

  const run = (): void => void c.trigger();
  const onOnline = run;
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') run();
  };
  const onOffline = (): void => setSyncStatus({ state: 'offline' });

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') run();
  }, INTERVAL_MS);
  const offWrite = onLocalWrite(() => {
    void c.refreshPending();
    clearTimeout(afterWrite);
    afterWrite = setTimeout(run, AFTER_WRITE_MS);
  });

  void c.refreshPending();
  run();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
    clearTimeout(afterWrite);
    offWrite();
    if (controller === c) controller = null;
  };
}
