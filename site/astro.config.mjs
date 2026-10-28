import { defineConfig } from 'astro/config';

// Полностью статический сайт. Адрес (`site`) появится вместе с доменом — он нужен для sitemap и RSS (этап С3).
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
