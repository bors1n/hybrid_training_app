/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Из корня репозитория Vitest запускается с другим cwd — корень Astro указываем явно.
export default getViteConfig(
  { test: { name: 'site', include: ['src/**/*.test.ts'] } },
  { root: import.meta.dirname },
);
