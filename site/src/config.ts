/** Настройки сайта, которые зависят от внешних адресов. Пока адресов нет — заглушки, помеченные TODO. */
export const SITE = {
  name: 'Hybrid Training Russia',
  tagline: 'Медиа о гибридных тренировках',
  // TODO: ссылка на инстаграм @htr (пока заглушка).
  instagramUrl: '#',
  instagramHandle: '@htr',
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Значок перед подписью. */
  icon?: 'instagram';
}

export const NAV: NavItem[] = [
  { href: '/articles/', label: 'Статьи' },
  { href: '/app/', label: 'HybridLog' },
  { href: '/about/', label: 'О проекте' },
];

export const FOOTER_NAV: NavItem[] = [
  { href: '/articles/', label: 'Статьи' },
  { href: '/rubrics/complexes/', label: 'Комплексы' },
  { href: '/app/', label: 'HybridLog' },
  { href: SITE.instagramUrl, label: 'Инстаграм', icon: 'instagram' },
];
