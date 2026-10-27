import type { ReactElement } from 'react';
import { useProfile } from '../app/profile.tsx';

export function ScreenHead({ label, title }: { label?: string; title: string }): ReactElement {
  const { open } = useProfile();
  return (
    <header className="screen-head">
      <div>
        {label ? <span className="screen-head__label">{label}</span> : null}
        <h1 className="screen-head__title">{title}</h1>
      </div>
      <button type="button" className="avatar-btn" aria-label="Профиль и настройки" onClick={open}>А</button>
    </header>
  );
}
