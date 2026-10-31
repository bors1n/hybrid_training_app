import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@hybridlog/shared';
import { clearLocalData, db, getMeta, setMeta } from '../data/db.ts';
import { AuthError, NetworkError } from '../sync/engine.ts';
import { saveRecord } from '../sync/records.ts';
import { session, template } from '../test/fixtures.ts';

vi.mock('./api.ts', () => ({
  authApi: { me: vi.fn(), logout: vi.fn(), requestCode: vi.fn(), verifyCode: vi.fn() },
}));
const { authApi } = await import('./api.ts');
const { useAuth } = await import('./store.ts');

const alex: User = { id: 'u-alex', email: 'alex@mail.ru' };
const bob: User = { id: 'u-bob', email: 'bob@mail.ru' };

beforeEach(async () => {
  vi.resetAllMocks();
  await db.open();
  await clearLocalData();
  useAuth.setState({ status: 'loading', user: null });
});

describe('init', () => {
  it('сессия жива: входим и запоминаем пользователя', async () => {
    vi.mocked(authApi.me).mockResolvedValue(alex);
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'authed', user: alex });
    expect(await getMeta('user')).toEqual(alex);
  });

  it('401 → экран входа, локальные данные не трогаем', async () => {
    await saveRecord('sessions', session('a'));
    vi.mocked(authApi.me).mockRejectedValue(new AuthError('x'));
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe('anon');
    expect(await db.outbox.count()).toBe(1);
  });

  it('нет сети, пользователь уже входил → работаем офлайн', async () => {
    await setMeta('user', alex);
    vi.mocked(authApi.me).mockRejectedValue(new NetworkError('x'));
    await useAuth.getState().init();
    expect(useAuth.getState()).toMatchObject({ status: 'authed', user: alex });
  });

  it('нет сети и нет сохранённого пользователя → вход', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new NetworkError('x'));
    await useAuth.getState().init();
    expect(useAuth.getState().status).toBe('anon');
  });
});

describe('completeLogin', () => {
  it('тот же пользователь: данные и очередь остаются', async () => {
    await setMeta('user', alex);
    await saveRecord('sessions', session('a'));
    await useAuth.getState().completeLogin(alex);
    expect(await db.rows('sessions').count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('другой пользователь: чужие данные удаляются', async () => {
    await setMeta('user', alex);
    await saveRecord('sessions', session('a'));
    await useAuth.getState().completeLogin(bob);
    expect(await db.rows('sessions').count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await getMeta('user')).toEqual(bob);
    expect(useAuth.getState().user).toEqual(bob);
  });
});

describe('logout', () => {
  it('очищает локальные данные и выходит', async () => {
    await setMeta('user', alex);
    await saveRecord('sessions', session('a'));
    vi.mocked(authApi.logout).mockResolvedValue();
    useAuth.setState({ status: 'authed', user: alex });
    await useAuth.getState().logout();
    expect(useAuth.getState()).toMatchObject({ status: 'anon', user: null });
    expect(await db.rows('sessions').count()).toBe(0);
    expect(await getMeta('user')).toBeUndefined();
  });

  it('без сети всё равно выходит', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new NetworkError('x'));
    useAuth.setState({ status: 'authed', user: alex });
    await useAuth.getState().logout();
    expect(useAuth.getState().status).toBe('anon');
  });
});
