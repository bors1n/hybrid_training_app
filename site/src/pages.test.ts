import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import { FOOTER_NAV, NAV } from './config.ts';
import About from './pages/about/index.astro';
import Articles from './pages/articles/index.astro';
import Index from './pages/index.astro';
import Splav from './pages/splav/index.astro';

async function render(component: Parameters<AstroContainer['renderToString']>[0], path = '/') {
  const container = await AstroContainer.create();
  return container.renderToString(component, { request: new Request(`http://localhost${path}`) });
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
    for (const href of internal) expect(['/articles/', '/splav/', '/about/', '/articles/?rubric=complexes']).toContain(href);
  });

  it('все картинки-логотипы доступны скринридеру: названия вместо пустых ссылок', async () => {
    const html = await render(Index);
    expect(html).toContain('aria-label="Hybrid Training Russia, на главную"');
    expect(html).toContain('aria-label="SPLAV"');
    expect(html).not.toMatch(/<a [^>]*href="#"[^>]*><\/a>/);
  });
});

describe('страницы-заглушки', () => {
  it.each([
    ['Статьи', Articles, '/articles/'],
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
