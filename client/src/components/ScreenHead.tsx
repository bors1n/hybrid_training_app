import type { ReactElement } from 'react';
import { useProfile } from '../app/profile.tsx';
import { useAuth } from '../auth/store.ts';
import { Avatar } from './Avatar.tsx';
import { SyncBadge } from './SyncBadge.tsx';

export function ScreenHead({ label, title }: { label?: string; title: string }): ReactElement {
  const { open } = useProfile();
  const seed = useAuth((s) => s.user?.id) ?? 'splav';
  return (
    <header className="screen-head">
      <div>
        {label ? <span className="screen-head__label">{label}</span> : null}
        <h1 className="screen-head__title">{title}</h1>
      </div>
      <div className="screen-head__side">
        <SyncBadge />
        <button type="button" className="avatar-btn" aria-label="Профиль и настройки" onClick={open}><Avatar seed={seed} /></button>
      </div>
    </header>
  );
}
