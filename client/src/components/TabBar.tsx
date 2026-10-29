import type { ReactElement } from 'react';
import { NavLink } from 'react-router';
import { CatalogIcon, HomeIcon, PlanIcon, ProgressIcon } from './Icons.tsx';

const tabs = [
  { to: '/', label: 'Сегодня', icon: <HomeIcon />, end: true },
  { to: '/programs', label: 'Программы', icon: <PlanIcon />, end: false },
  { to: '/progress', label: 'Прогресс', icon: <ProgressIcon />, end: false },
  { to: '/library', label: 'Каталог', icon: <CatalogIcon />, end: false },
] as const;

export function TabBar(): ReactElement {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tabbar__link${isActive ? ' is-active' : ''}`}>
          {t.icon}
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
