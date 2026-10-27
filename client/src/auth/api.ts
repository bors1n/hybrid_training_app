import { UserSchema, type User } from '@splav/shared';
import { z } from 'zod';
import { AuthError } from '../sync/engine.ts';
import { request } from '../sync/http.ts';

export class InvalidCodeError extends Error {}

const OkSchema = z.object({ ok: z.literal(true) });
const UserResponseSchema = z.object({ user: UserSchema });

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const authApi = {
  requestCode: async (email: string): Promise<void> => {
    await request('/api/auth/code', OkSchema, post({ email }));
  },

  /** 401 на этом эндпоинте значит «неверный или просроченный код», а не истёкшую сессию. */
  verifyCode: async (email: string, code: string): Promise<User> => {
    try {
      return (await request('/api/auth/verify', UserResponseSchema, post({ email, code }))).user;
    } catch (e) {
      if (e instanceof AuthError) throw new InvalidCodeError('Неверный код');
      throw e;
    }
  },

  me: async (): Promise<User> => (await request('/api/auth/me', UserResponseSchema)).user,

  logout: async (): Promise<void> => {
    await request('/api/auth/logout', OkSchema, post({}));
  },
};
