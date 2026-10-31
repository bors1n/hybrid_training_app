import { HealthSchema } from '@hybridlog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './test-helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}, 60_000);
afterAll(async () => {
  await t.close();
});

describe('GET /api/health', () => {
  it('отвечает по схеме HealthSchema', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.safeParse(res.json()).success).toBe(true);
  });
});
