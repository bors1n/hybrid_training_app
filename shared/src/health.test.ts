import { describe, expect, it } from 'vitest';
import { HealthSchema } from './health.ts';

describe('HealthSchema', () => {
  it('принимает корректный ответ', () => {
    expect(HealthSchema.parse({ ok: true, service: 'hybridlog' })).toEqual({ ok: true, service: 'hybridlog' });
  });
  it('отклоняет чужой сервис', () => {
    expect(HealthSchema.safeParse({ ok: true, service: 'x' }).success).toBe(false);
  });
});
