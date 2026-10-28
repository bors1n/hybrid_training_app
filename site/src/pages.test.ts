import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import { FOOTER_NAV, NAV } from './config.ts';
import About from './pages/about/index.astro';
import ArticleList from './components/ArticleList.astro';
import RubricNav from './components/RubricNav.astro';

import Index from './pages/index.astro';
import Splav from './pages/splav/index.astro';

async function render(component: Parameters<AstroContainer['renderToString']>[0], path = '/', props?: Record<string, unknown>) {
  const container = await AstroContainer.create();
  return container.renderToString(component, { request: new Request(`http://localhost${path}`), props });
}

describe('главная страница', () => {
  it('один заголовок первого уровня, русский язык, светлая тема и ссылка «К содержимому»', async () => {
    const html = await render(Index);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('<html lang="ru"');
    expect(html).toContain('href="#content"');
    expect(html).toContain('id="content"');
    expect(html).toContain('width=device-width, initial-scale=1');
  });

  it('содержит разделы макета: формула недели, основы, статьи, SPLAV, инстаграм', async () => {
    const html = await render(Index);
    for (const text of ['Формула гибридной недели', 'Что такое гибридная тренировка', 'Свежие статьи', 'Силовые и кардио в одном дневнике', 'Карусели каждую неделю', '60–70%', '12–16']) {
      expect(html).toContain(text);
    }
  });

  it('меню ведёт только на существующие страницы сайта', () => {
    const internal = [...NAV, ...FOOTER_NAV].map((n) => n.href).filter((h) => h.startsWith('/'));
    for (const href of internal) expect(['/articles/', '/splav/', '/about/', '/rubrics/complexes/']).toContain(href);
  });

  it('все картинки-логотипы доступны скринридеру: названия вместо пустых ссылок', async () => {
    const html = await render(Index);
    expect(html).toContain('aria-label="Hybrid Training Russia, на главную"');
    expect(html).toContain('aria-label="SPLAV"');
    expect(html).not.toMatch(/<a [^>]*href="#"[^>]*><\/a>/);
  });
});

describe('рубрики и список статей', () => {
  it('«Все» выбрана по умолчанию; у каждой рубрики своя ссылка', async () => {
    const html = await render(RubricNav, '/articles/', { current: null });
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Все</);
    for (const href of ['/rubrics/programs/', '/rubrics/running/', '/rubrics/strength/', '/rubrics/complexes/', '/rubrics/recovery/']) expect(html).toContain(`href="${href}"`);
  });

  it('текущая рубрика отмечена, «Все» — нет', async () => {
    const html = await render(RubricNav, '/rubrics/running/', { current: 'running' });
    expect(html).toMatch(/aria-current="page"[^>]*>Бег</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Все</);
  });

  it('карточки ведут на страницы статей и показывают время чтения', async () => {
    const html = await render(ArticleList, '/', { articles: [{ slug: 'a-b', title: 'Заголовок', rubric: 'running', readingMin: 6 }], empty: 'пусто' });
    expect(html).toContain('href="/articles/a-b/"');
    expect(html).toContain('Заголовок');
    expect(html).toContain('6 мин чтения');
    expect(html).toContain('>Бег<');
    expect(html).not.toContain('пусто');
  });

  it('без статей — пояснение вместо пустого места', async () => {
    const html = await render(ArticleList, '/', { articles: [], empty: 'В рубрике «Бег» пока нет статей.' });
    expect(html).toContain('В рубрике «Бег» пока нет статей.');
    expect(html).not.toContain('class="card');
  });
});

describe('страницы-заглушки', () => {
  it.each([
    ['SPLAV', Splav, '/splav/'],
    ['О проекте', About, '/about/'],
  ] as const)('%s: заголовок, ссылка на главную, текущий пункт меню', async (title, component, path) => {
    const html = await render(component, path);
    expect(html).toContain(`<h1 class="stub__title`);
    expect(html).toContain(title);
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-current="page"');
  });
});
