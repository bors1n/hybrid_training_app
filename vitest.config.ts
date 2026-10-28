import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['shared', 'design', 'client', 'server', 'tests', 'site'],
  },
});
