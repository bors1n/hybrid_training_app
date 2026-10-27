import { describe, expect, it } from 'vitest';
import { CodeSchema, EmailSchema } from './auth.ts';
import { MAX_BATCH, PullQuerySchema, PushRequestSchema } from './sync.ts';

const rec = { collection: 'sessions', id: 'a', updatedAt: 1, deletedAt: null, data: { id: 'a' } };

describe('sync-схемы', () => {
  it('принимает корректную запись', () => {
    expect(PushRequestSchema.safeParse({ records: [rec] }).success).toBe(true);
  });
  it('отклоняет неизвестную коллекцию и нецелое время', () => {
    expect(PushRequestSchema.safeParse({ records: [{ ...rec, collection: 'x' }] }).success).toBe(false);
    expect(PushRequestSchema.safeParse({ records: [{ ...rec, updatedAt: 1.5 }] }).success).toBe(false);
  });
  it('ограничивает размер пачки', () => {
    const many = Array.from({ length: MAX_BATCH + 1 }, () => rec);
    expect(PushRequestSchema.safeParse({ records: many }).success).toBe(false);
  });
  it('pull: значения по умолчанию', () => {
    expect(PullQuerySchema.parse({})).toEqual({ since: 0, limit: MAX_BATCH });
    expect(PullQuerySchema.parse({ since: '5', limit: '10' })).toEqual({ since: 5, limit: 10 });
  });
});

describe('auth-схемы', () => {
  it('почта приводится к нижнему регистру', () => {
    expect(EmailSchema.parse('  Alex@Mail.RU ')).toBe('alex@mail.ru');
    expect(EmailSchema.safeParse('не почта').success).toBe(false);
  });
  it('код — ровно 6 цифр', () => {
    expect(CodeSchema.safeParse('123456').success).toBe(true);
    expect(CodeSchema.safeParse('12345').success).toBe(false);
    expect(CodeSchema.safeParse('12345a').success).toBe(false);
  });
});
