import type { ReactElement } from 'react';
import { syncLabel, useSyncStatus } from '../sync/status.ts';

/** Значок статуса синхронизации. Когда всё отправлено, ничего не показывает. */
export function SyncBadge(): ReactElement | null {
  const status = useSyncStatus();
  const label = syncLabel(status);
  if (!label) return null;
  const warn = status.state === 'error' || status.state === 'unauth';
  return (
    <span className={`sync-badge${warn ? ' sync-badge--warn' : ''}`} role="status">
      {label}
    </span>
  );
}
