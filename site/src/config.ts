/** Настройки сайта, которые зависят от внешних адресов. Пока адресов нет — заглушки, помеченные TODO. */
export const SITE = {
  name: 'Hybrid Training Russia',
  tagline: 'Медиа о гибридных тренировках',
  instagramUrl: 'https://www.instagram.com/hybridtrainingrus/',
  instagramHandle: '@hybridtrainingrus',
  /** Адрес сайта без слэша в конце. */
  url: 'https://hybridtraining.ru',
  /** Приложение HybridLog живёт на поддомене. */
  appUrl: 'https://app.hybridtraining.ru',
} as const;

/**
 * Сноска к каждому упоминанию Инстаграма. Формулировка по общей практике маркировки
 * (Meta признана экстремистской организацией, деятельность в РФ запрещена); перед запуском сверить с памяткой Роскомнадзора.
 */
export const INSTAGRAM_NOTE =
  '* Instagram принадлежит компании Meta Platforms Inc., признанной экстремистской организацией. Деятельность компании на территории Российской Федерации запрещена.';

/**
 * Данные оператора персональных данных для политики и согласия. Значения в `[[…]]` — незаполненные:
 * `deploy/deploy.sh` не выкладывает сайт, пока такие маркеры остаются в собранных страницах.
 */
export const OPERATOR = {
  name: 'Борсин Александр Владимирович',
  email: 'borsin686@yandex.ru',
  address: 'г. Владивосток, ул. Опорная, д. 18а',
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
  { href: SITE.instagramUrl, label: 'Инстаграм*', icon: 'instagram' },
];
