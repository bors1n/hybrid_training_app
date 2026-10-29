import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/store.ts';
import { exportAllJson, exportAllSessionsCsv, saveTextFile, type SaveOutcome } from '../data/exportService.ts';
import { todayKey } from '../domain/history.ts';
import { REPDB_ATTRIBUTION, REPDB_URL } from '../seed/catalog.ts';
import { HAS_WODS, WOD_SOURCE_NAME, WOD_SOURCE_URL } from '../seed/wods.ts';
import { triggerSync } from '../sync/runtime.ts';
import { syncLabel, useSyncStatus } from '../sync/status.ts';

interface ExportNote {
  text: string;
  warnings: string[];
}

const outcomeText = (o: SaveOutcome): string => (o === 'cancelled' ? 'Экспорт отменён' : o === 'shared' ? 'Файл отправлен' : 'Файл сохранён');

export function ProfileSheet({ onClose }: { onClose: () => void }): ReactElement {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const status = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportNote, setExportNote] = useState<ExportNote | null>(null);

  const synced = syncLabel(status) === null;
  const lastSync = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;

  async function doLogout(): Promise<void> {
    setBusy(true);
    await logout();
  }

  async function exportCsv(): Promise<void> {
    setBusy(true);
    try {
      const r = await exportAllSessionsCsv();
      const outcome = await saveTextFile(`splav-trenirovki-${todayKey()}.csv`, r.csv, 'text/csv;charset=utf-8');
      setExportNote({ text: `${outcomeText(outcome)}: тренировок ${r.sessions}, строк ${r.rows}`, warnings: r.warnings });
    } catch (e) {
      setExportNote({ text: `Не удалось экспортировать: ${e instanceof Error ? e.message : 'ошибка'}`, warnings: [] });
    } finally {
      setBusy(false);
    }
  }

  async function exportJson(): Promise<void> {
    setBusy(true);
    try {
      const { json, counts } = await exportAllJson();
      const outcome = await saveTextFile(`splav-dannye-${todayKey()}.json`, json, 'application/json');
      setExportNote({ text: `${outcomeText(outcome)}: тренировок ${counts['sessions'] ?? 0}, шаблонов ${counts['templates'] ?? 0}`, warnings: [] });
    } catch (e) {
      setExportNote({ text: `Не удалось экспортировать: ${e instanceof Error ? e.message : 'ошибка'}`, warnings: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Профиль и настройки">
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

        <div className="sheet__row">
          <span className="sheet__label">ДАННЫЕ</span>
        </div>
        <button
          type="button"
          className="htr-btn htr-btn--secondary"
          onClick={() => {
            onClose();
            navigate('/import');
          }}
        >
          Импорт тренировок (CSV, Excel)
        </button>
        <div className="two">
          <button type="button" className="htr-btn htr-btn--secondary" onClick={() => void exportCsv()} disabled={busy}>Экспорт CSV</button>
          <button type="button" className="htr-btn htr-btn--secondary" onClick={() => void exportJson()} disabled={busy}>Экспорт JSON</button>
        </div>
        {exportNote ? (
          <div className="sheet__status" role="status">
            {exportNote.text}
            {exportNote.warnings.length > 0 ? (
              <details>
                <summary>Что не попало в файл ({exportNote.warnings.length})</summary>
                <ul>{exportNote.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <details className="sheet__about">
          <summary>О приложении</summary>
          <p>SPLAV — дневник гибридных тренировок: сила, кардио и комплексы в одном журнале.</p>
          <p className="sheet__credit">
            <a href={REPDB_URL} target="_blank" rel="noreferrer">{REPDB_ATTRIBUTION}</a>
          </p>
          {HAS_WODS ? (
            <p className="sheet__credit">
              Комплексы библиотеки: <a href={WOD_SOURCE_URL} target="_blank" rel="noreferrer">{WOD_SOURCE_NAME}</a>
            </p>
          ) : null}
        </details>

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
