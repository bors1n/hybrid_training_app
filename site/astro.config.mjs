import { defineConfig } from 'astro/config';

// Полностью статический сайт. `site` нужен для sitemap и RSS (этап С3); держать в одном месте с `SITE.url` в `src/config.ts`.
export default defineConfig({
  site: 'https://hybridtraining.ru',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
