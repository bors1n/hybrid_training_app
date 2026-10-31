import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CODE_LENGTH, type User } from '@hybridlog/shared';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { authSessions, loginCodes, users } from '../db/schema.ts';
import type { Mailer } from './mailer.ts';

export class TooManyCodesError extends Error {}

const DAY = 24 * 60 * 60 * 1000;

export interface AuthDeps {
  db: Db;
  mailer: Mailer;
  config: Config;
  now: () => number;
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

function hashCode(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function requestCode({ db, mailer, config, now }: AuthDeps, email: string): Promise<void> {
  const t = now();
  const recent = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, t - config.codeWindowMs)));
  if ((recent[0]?.n ?? 0) >= config.maxCodesPerWindow) throw new TooManyCodesError();

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  // Новый код отменяет предыдущие неиспользованные.
  await db.update(loginCodes).set({ usedAt: t }).where(and(eq(loginCodes.email, email), isNull(loginCodes.usedAt)));
  await db.insert(loginCodes).values({
    id: randomUUID(),
    email,
    codeHash: hashCode(config.authSecret, email, code),
    createdAt: t,
    expiresAt: t + config.codeTtlMs,
  });
  await mailer.sendCode(email, code);
}

export interface Login {
  user: User;
  token: string;
}

/** Проверяет код. Любая причина отказа даёт null: снаружи они неразличимы. */
export async function verifyCode({ db, config, now }: AuthDeps, email: string, code: string): Promise<Login | null> {
  const t = now();
  const [latest] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, t)))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);
  if (!latest) return null;

  // Попытка засчитывается атомарно, до сравнения: параллельные запросы не обойдут лимит.
  const [claimed] = await db
    .update(loginCodes)
    .set({ attempts: sql`${loginCodes.attempts} + 1` })
    .where(
      and(eq(loginCodes.id, latest.id), isNull(loginCodes.usedAt), sql`${loginCodes.attempts} < ${config.maxCodeAttempts}`),
    )
    .returning();
  if (!claimed) return null;

  if (!safeEqualHex(claimed.codeHash, hashCode(config.authSecret, email, code))) return null;

  const [consumed] = await db
    .update(loginCodes)
    .set({ usedAt: t })
    .where(and(eq(loginCodes.id, claimed.id), isNull(loginCodes.usedAt)))
    .returning({ id: loginCodes.id });
  if (!consumed) return null;

  await db.insert(users).values({ id: randomUUID(), email, createdAt: t }).onConflictDoNothing({ target: users.email });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return null;

  const token = randomBytes(32).toString('base64url');
  await db.insert(authSessions).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sha256(token),
    createdAt: t,
    lastUsedAt: t,
    expiresAt: t + config.sessionTtlMs,
  });
  return { user: { id: user.id, email: user.email }, token };
}

export interface SessionInfo {
  user: User;
  /** Срок сессии продлён: cookie нужно выставить заново. */
  refreshed: boolean;
}

export async function getSession({ db, config, now }: AuthDeps, token: string): Promise<SessionInfo | null> {
  const t = now();
  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, sha256(token)));
  if (!row || row.session.expiresAt <= t) return null;

  let refreshed = false;
  if (t - row.session.lastUsedAt > DAY) {
    await db
      .update(authSessions)
      .set({ lastUsedAt: t, expiresAt: t + config.sessionTtlMs })
      .where(eq(authSessions.id, row.session.id));
    refreshed = true;
  }
  return { user: { id: row.user.id, email: row.user.email }, refreshed };
}

export async function endSession({ db }: AuthDeps, token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, sha256(token)));
}
