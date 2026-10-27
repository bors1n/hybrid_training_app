import { HealthSchema } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

describe('GET /api/health', () => {
  it('отвечает по схеме HealthSchema', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.safeParse(res.json()).success).toBe(true);
    await app.close();
  });
});
