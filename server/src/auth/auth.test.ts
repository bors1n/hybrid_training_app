import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../test-helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}, 60_000);
afterAll(async () => {
  await t.close();
});

const post = (url: string, payload: unknown, sid?: string) =>
  t.app.inject({ method: 'POST', url, payload: payload as object, ...(sid ? { cookies: { sid } } : {}) });
const me = (sid?: string) => t.app.inject({ method: 'GET', url: '/api/auth/me', ...(sid ? { cookies: { sid } } : {}) });

describe('вход по коду', () => {
  it('полный путь: код → вход → /me → выход', async () => {
    const email = 'flow@example.com';
    expect((await post('/api/auth/code', { email })).statusCode).toBe(200);
    const code = t.lastCode(email);
    expect(code).toMatch(/^[0-9]{6}$/);

    const ok = await post('/api/auth/verify', { email, code });
    expect(ok.statusCode).toBe(200);
    const cookie = ok.cookies.find((c) => c.name === 'sid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.maxAge).toBe(90 * 24 * 60 * 60);

    const who = await me(cookie.value);
    expect(who.statusCode).toBe(200);
    expect(who.json().user.email).toBe(email);

    expect((await post('/api/auth/logout', {}, cookie.value)).statusCode).toBe(200);
    expect((await me(cookie.value)).statusCode).toBe(401);
  });

  it('почта нормализуется: регистр и пробелы не важны', async () => {
    await post('/api/auth/code', { email: ' Case@Example.com ' });
    const res = await post('/api/auth/verify', { email: 'case@example.com', code: t.lastCode('case@example.com') });
    expect(res.statusCode).toBe(200);
  });

  it('неверный код отклоняется, неверный формат даёт 400', async () => {
    const email = 'wrong@example.com';
    await post('/api/auth/code', { email });
    const real = t.lastCode(email);
    const wrong = real === '000000' ? '111111' : '000000';
    expect((await post('/api/auth/verify', { email, code: wrong })).statusCode).toBe(401);
    expect((await post('/api/auth/verify', { email, code: '12' })).statusCode).toBe(400);
    expect((await post('/api/auth/code', { email: 'не-почта' })).statusCode).toBe(400);
  });

  it('после 5 неверных попыток верный код уже не работает', async () => {
    const email = 'attempts@example.com';
    await post('/api/auth/code', { email });
    const real = t.lastCode(email);
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await post('/api/auth/verify', { email, code: wrong })).statusCode).toBe(401);
    }
    expect((await post('/api/auth/verify', { email, code: real })).statusCode).toBe(401);
  });

  it('код одноразовый', async () => {
    const email = 'once@example.com';
    await post('/api/auth/code', { email });
    const code = t.lastCode(email);
    expect((await post('/api/auth/verify', { email, code })).statusCode).toBe(200);
    expect((await post('/api/auth/verify', { email, code })).statusCode).toBe(401);
  });

  it('код живёт 10 минут', async () => {
    const email = 'expire@example.com';
    await post('/api/auth/code', { email });
    const code = t.lastCode(email);
    t.clock.t += 10 * 60 * 1000 + 1;
    expect((await post('/api/auth/verify', { email, code })).statusCode).toBe(401);
  });

  it('новый код отменяет предыдущий', async () => {
    const email = 'newer@example.com';
    await post('/api/auth/code', { email });
    const first = t.lastCode(email);
    await post('/api/auth/code', { email });
    const second = t.lastCode(email);
    if (first !== second) expect((await post('/api/auth/verify', { email, code: first })).statusCode).toBe(401);
    expect((await post('/api/auth/verify', { email, code: second })).statusCode).toBe(200);
  });

  it('не больше 5 кодов на почту за 10 минут', async () => {
    const email = 'flood@example.com';
    for (let i = 0; i < 5; i++) expect((await post('/api/auth/code', { email })).statusCode).toBe(200);
    expect((await post('/api/auth/code', { email })).statusCode).toBe(429);
    t.clock.t += 10 * 60 * 1000 + 1;
    expect((await post('/api/auth/code', { email })).statusCode).toBe(200);
  });
});

describe('сессия', () => {
  it('без cookie и с чужим токеном — 401', async () => {
    expect((await me()).statusCode).toBe(401);
    expect((await me('подделка')).statusCode).toBe(401);
  });

  it('скользящее продление: через сутки cookie выставляется заново', async () => {
    const sid = await t.login('slide@example.com');
    expect((await me(sid)).cookies).toHaveLength(0);
    t.clock.t += 2 * 24 * 60 * 60 * 1000;
    const res = await me(sid);
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'sid')?.value).toBe(sid);
  });

  it('через 90 дней без активности сессия истекает', async () => {
    const sid = await t.login('old@example.com');
    t.clock.t += 91 * 24 * 60 * 60 * 1000;
    expect((await me(sid)).statusCode).toBe(401);
  });
});

describe('флаг Secure', () => {
  it('ставится, когда включён в конфиге', async () => {
    const secure = await createTestApp({ cookieSecure: true });
    try {
      await secure.app.inject({ method: 'POST', url: '/api/auth/code', payload: { email: 's@example.com' } });
      const res = await secure.app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { email: 's@example.com', code: secure.lastCode('s@example.com') },
      });
      expect(res.cookies.find((c) => c.name === 'sid')?.secure).toBe(true);
    } finally {
      await secure.close();
    }
  }, 60_000);
});
