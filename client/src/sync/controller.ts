import { db, type HybridLogDB } from '../data/db.ts';
import { AuthError, NetworkError, syncOnce, type Transport } from './engine.ts';
import type { SyncStatus } from './status.ts';

export interface ControllerOptions {
  transport: Transport;
  database?: HybridLogDB;
  isOnline?: () => boolean;
  onStatus: (patch: Partial<SyncStatus>) => void;
  onUnauth?: () => void;
  now?: () => number;
}

export interface SyncController {
  /** Запускает синхронизацию; если она уже идёт, просит выполнить ещё один проход после неё. */
  trigger: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

export function createSyncController({
  transport,
  database = db,
  isOnline = () => navigator.onLine,
  onStatus,
  onUnauth,
  now = Date.now,
}: ControllerOptions): SyncController {
  let running = false;
  let again = false;

  const refreshPending = async (): Promise<void> => {
    onStatus({ pending: await database.outbox.count() });
  };

  const runOnce = async (): Promise<void> => {
    if (!isOnline()) {
      onStatus({ state: 'offline' });
      return;
    }
    onStatus({ state: 'syncing' });
    try {
      await syncOnce(transport, database);
      onStatus({ state: 'idle', lastSyncAt: now() });
    } catch (e) {
      if (e instanceof AuthError) {
        onStatus({ state: 'unauth' });
        onUnauth?.();
      } else if (e instanceof NetworkError) {
        onStatus({ state: 'offline' });
      } else {
        console.error('Синхронизация не удалась', e);
        onStatus({ state: 'error' });
      }
    }
  };

  const trigger = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await runOnce();
        await refreshPending();
      } while (again);
    } finally {
      running = false;
    }
  };

  return { trigger, refreshPending };
}
