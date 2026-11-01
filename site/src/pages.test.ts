import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import { FOOTER_NAV, NAV } from './config.ts';
import About from './pages/about/index.astro';
import ArticleList from './components/ArticleList.astro';
import RubricNav from './components/RubricNav.astro';

import Index from './pages/index.astro';
import AppPage from './pages/app/index.astro';
import Privacy from './pages/privacy/index.astro';
import Consent from './pages/consent/index.astro';

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

  it('содержит разделы макета: основы, статьи, HybridLog, инстаграм', async () => {
    const html = await render(Index);
    for (const text of ['Что такое гибридная тренировка', 'Свежие статьи', 'Силовые и кардио в одном месте', 'Комьюнити', 'Hybrid', 'Russia']) {
      expect(html).toContain(text);
    }
  });

  it('первый экран: две кнопки, в шапке значок Инстаграма, шесть карточек основ', async () => {
    const html = await render(Index);
    expect(html).toMatch(/href="\/articles\/"[^>]*>[^<]*Статьи</);
    expect(html).toMatch(/href="\/app\/"[^>]*>[^<]*Приложение</);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*><rect[^>]*><\/rect><circle/);
    expect(html.match(/class="basic[ "]/g)).toHaveLength(6);
  });

  it('фото первого экрана и скриншот приложения в рамке iPhone — картинки с описанием', async () => {
    const html = await render(Index);
    expect(html).toMatch(/<img[^>]*alt="Бегун на вечерней тренировке"/);
    expect(html).toMatch(/<img[^>]*alt="Экран «Прогресс» в приложении HybridLog"/);
    expect(html).toContain('iphone__island');
  });

  it('меню ведёт только на существующие страницы сайта', () => {
    const internal = [...NAV, ...FOOTER_NAV].map((n) => n.href).filter((h) => h.startsWith('/'));
    for (const href of internal) expect(['/articles/', '/app/', '/about/', '/rubrics/complexes/']).toContain(href);
  });

  it('все картинки-логотипы доступны скринридеру: названия вместо пустых ссылок', async () => {
    const html = await render(Index);
    expect(html).toContain('aria-label="Hybrid Training Russia, на главную"');
    expect(html).toContain('aria-label="HybridLog"');
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

  it('обложка рисуется картинкой, без обложки остаётся ночной фон', async () => {
    const cover = { src: '/cover.jpg', width: 1080, height: 1350, format: 'jpg' };
    const base = { slug: 'a-b', title: 'Заголовок', rubric: 'running', readingMin: 6 };
    const withCover = await render(ArticleList, '/', { articles: [{ ...base, cover }], empty: 'пусто' });
    expect(withCover).toContain('<img');
    const without = await render(ArticleList, '/', { articles: [base], empty: 'пусто' });
    expect(without).not.toContain('<img');
  });

  it('без статей — пояснение вместо пустого места', async () => {
    const html = await render(ArticleList, '/', { articles: [], empty: 'В рубрике «Бег» пока нет статей.' });
    expect(html).toContain('В рубрике «Бег» пока нет статей.');
    expect(html).not.toContain('class="card');
  });
});

describe('страницы-заглушки', () => {
  it.each([
    ['О проекте', About, '/about/'],
  ] as const)('%s: заголовок, ссылка на главную, текущий пункт меню', async (title, component, path) => {
    const html = await render(component, path);
    expect(html).toContain(`<h1 class="stub__title`);
    expect(html).toContain(title);
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-current="page"');
  });
});

describe('страница HybridLog', () => {
  it('описывает продукт, помечена «бета», ведёт в приложение и объясняет установку на iPhone', async () => {
    const html = await render(AppPage, '/app/');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('бета');
    expect(html).toMatch(/href="https:\/\/app\.hybridtraining\.ru"[^>]*>[^<]*Открыть приложение</);
    expect(html).toContain('Как поставить на iPhone');
    expect(html.match(/<ol[\s\S]*?<\/ol>/)?.[0].match(/<li/g)).toHaveLength(3);
    expect(html).toContain('aria-current="page"');
  });
});

describe('Инстаграм: маркировка и документы', () => {
  it('в шапке и подвале у Инстаграма звёздочка, а в подвале — сноска про Meta', async () => {
    const html = await render(Index);
    expect(html.match(/Инстаграм\*/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Meta Platforms Inc.');
    expect(html).toContain('Деятельность компании на территории Российской Федерации запрещена');
    expect(html).toContain('href="https://www.instagram.com/hybridtrainingrus/"');
    expect(html).toContain('@hybridtrainingrus*');
  });

  it('подвал ведёт на политику и согласие', async () => {
    const html = await render(Index);
    expect(html).toContain('href="/privacy/"');
    expect(html).toContain('href="/consent/"');
  });

  it.each([
    ['политика', Privacy, 'Политика обработки персональных данных'],
    ['согласие', Consent, 'Согласие на обработку персональных данных'],
  ] as const)('страница «%s»: заголовок, редакция и один h1', async (_n, component, title) => {
    const html = await render(component, '/x/');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(title);
    expect(html).toContain('Редакция от 01.11.2026');
  });
});
