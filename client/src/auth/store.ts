import type { User } from '@splav/shared';
import { create } from 'zustand';
import { clearLocalData, db, getMeta, setMeta } from '../data/db.ts';
import { AuthError } from '../sync/engine.ts';
import { authApi } from './api.ts';

export type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Проверить сессию при старте; без сети остаёмся в аккаунте по сохранённой копии. */
  init: () => Promise<void>;
  /** Вызывается после успешной проверки кода. */
  completeLogin: (user: User) => Promise<void>;
  /** Сервер ответил 401 во время синхронизации. Данные и очередь остаются на устройстве. */
  markUnauthenticated: () => void;
  logout: () => Promise<void>;
}

const USER_KEY = 'user';

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  async init() {
    try {
      await useAuth.getState().completeLogin(await authApi.me());
    } catch (e) {
      if (e instanceof AuthError) {
        set({ status: 'anon', user: null });
        return;
      }
      // Нет сети или сервер недоступен: работаем по сохранённому пользователю.
      const cached = await getMeta<User>(USER_KEY);
      set(cached ? { status: 'authed', user: cached } : { status: 'anon', user: null });
    }
  },

  async completeLogin(user) {
    const previous = await getMeta<User>(USER_KEY);
    // Чужие данные на устройстве не должны попасть в новый аккаунт.
    if (previous && previous.id !== user.id) await clearLocalData();
    await setMeta(USER_KEY, user);
    set({ status: 'authed', user });
  },

  markUnauthenticated() {
    set({ status: 'anon', user: null });
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Без сети cookie сессии останется на сервере до истечения срока; локальные данные всё равно удаляем.
    }
    await clearLocalData();
    set({ status: 'anon', user: null });
  },
}));

export const pendingCount = (): Promise<number> => db.outbox.count();
