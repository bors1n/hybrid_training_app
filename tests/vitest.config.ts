import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'e2e', include: ['e2e/**/*.test.ts'], setupFiles: ['fake-indexeddb/auto'], testTimeout: 30_000 },
});
