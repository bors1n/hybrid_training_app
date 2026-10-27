import type { ReactElement } from 'react';

export function ProfileSheet({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Профиль и настройки">
        <h2 className="sheet__title">Профиль</h2>
        <p className="stub">Аккаунт, импорт и экспорт, «О приложении» появятся на следующих этапах.</p>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Закрыть</button>
      </section>
    </>
  );
}
