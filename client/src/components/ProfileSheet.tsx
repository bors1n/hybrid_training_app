import { useState, type ReactElement } from 'react';
import { useAuth } from '../auth/store.ts';
import { REPDB_ATTRIBUTION, REPDB_URL } from '../seed/catalog.ts';
import { triggerSync } from '../sync/runtime.ts';
import { syncLabel, useSyncStatus } from '../sync/status.ts';

export function ProfileSheet({ onClose }: { onClose: () => void }): ReactElement {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const status = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const synced = syncLabel(status) === null;
  const lastSync = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;

  async function doLogout(): Promise<void> {
    setBusy(true);
    await logout();
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Профиль и настройки">
        <h2 className="sheet__title">Профиль</h2>

        <div className="sheet__row">
          <span className="sheet__label">АККАУНТ</span>
          <span>{user?.email ?? '—'}</span>
        </div>
        <div className="sheet__row">
          <span className="sheet__label">СИНХРОНИЗАЦИЯ</span>
          <span>{synced ? `Всё отправлено${lastSync ? ` · ${lastSync}` : ''}` : syncLabel(status)}</span>
        </div>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={triggerSync} disabled={status.state === 'syncing'}>
          Синхронизировать сейчас
        </button>

        <p className="stub">Импорт и экспорт, «О приложении» появятся на следующих этапах.</p>
        <p className="sheet__credit">
          <a href={REPDB_URL} target="_blank" rel="noreferrer">{REPDB_ATTRIBUTION}</a>
        </p>

        {confirming ? (
          <div className="sheet__confirm" role="alert">
            <p>
              {status.pending > 0
                ? `Не отправлено на сервер: ${status.pending}. Если выйти сейчас, эти изменения будут потеряны.`
                : 'Данные на этом устройстве будут удалены; они останутся на сервере.'}
            </p>
            <button type="button" className="htr-btn htr-btn--danger" onClick={doLogout} disabled={busy}>
              {status.pending > 0 ? 'Выйти и потерять изменения' : 'Выйти'}
            </button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        ) : (
          <button type="button" className="htr-btn htr-btn--ghost" onClick={() => setConfirming(true)}>Выйти</button>
        )}
        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Закрыть</button>
      </section>
    </>
  );
}
