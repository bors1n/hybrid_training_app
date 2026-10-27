import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RequestCodeSchema, VerifyCodeSchema, type User } from '@splav/shared';
import type { AuthDeps } from './service.ts';
import { endSession, getSession, requestCode, TooManyCodesError, verifyCode } from './service.ts';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

function setSessionCookie(reply: FastifyReply, deps: AuthDeps, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: deps.config.cookieSecure,
    maxAge: Math.floor(deps.config.sessionTtlMs / 1000),
  });
}

/** preHandler: определяет пользователя только по cookie сессии; userId из тела запроса не берётся никогда. */
export function requireUser(deps: AuthDeps) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await getSession(deps, token) : null;
    if (!session || !token) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    request.user = session.user;
    if (session.refreshed) setSessionCookie(reply, deps, token);
  };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const limit = { rateLimit: { max: deps.config.ipRateLimitPerMin, timeWindow: 60_000 } };

  app.post('/api/auth/code', { config: limit }, async (request, reply) => {
    const body = RequestCodeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    try {
      await requestCode(deps, body.data.email);
    } catch (e) {
      if (e instanceof TooManyCodesError) return reply.code(429).send({ error: 'too_many_codes' });
      throw e;
    }
    return { ok: true };
  });

  app.post('/api/auth/verify', { config: limit }, async (request, reply) => {
    const body = VerifyCodeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const login = await verifyCode(deps, body.data.email, body.data.code);
    if (!login) return reply.code(401).send({ error: 'invalid_code' });
    setSessionCookie(reply, deps, login.token);
    return { user: login.user };
  });

  app.get('/api/auth/me', { preHandler: requireUser(deps) }, async (request) => ({ user: request.user }));

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await endSession(deps, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
