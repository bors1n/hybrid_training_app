export interface Config {
  /** Ключ HMAC для хэшей кодов входа. */
  authSecret: string;
  /** Ставить ли флаг Secure на cookie сессии (в проде — да). */
  cookieSecure: boolean;
  trustProxy: boolean;
  codeTtlMs: number;
  maxCodeAttempts: number;
  /** Сколько кодов можно запросить на одну почту за окно `codeWindowMs`. */
  maxCodesPerWindow: number;
  codeWindowMs: number;
  sessionTtlMs: number;
  /** Лимит запросов в минуту с одного IP на эндпоинты входа. */
  ipRateLimitPerMin: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env['NODE_ENV'] === 'production';
  const authSecret = env['AUTH_SECRET'];
  if (production && !authSecret) throw new Error('AUTH_SECRET обязателен в production');
  return {
    authSecret: authSecret ?? 'dev-only-secret-change-me',
    cookieSecure: env['COOKIE_SECURE'] ? env['COOKIE_SECURE'] === '1' : production,
    trustProxy: env['TRUST_PROXY'] === '1',
    codeTtlMs: 10 * 60 * 1000,
    maxCodeAttempts: 5,
    maxCodesPerWindow: 5,
    codeWindowMs: 10 * 60 * 1000,
    sessionTtlMs: 90 * DAY,
    ipRateLimitPerMin: 20,
  };
}
