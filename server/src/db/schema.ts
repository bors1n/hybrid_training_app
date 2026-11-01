import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Время в миллисекундах: INTEGER в SQLite 64-битный, в число JS помещается. */
const ms = (name: string) => integer(name);
const uuid = (name: string) => text(name);

export const users = sqliteTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: ms('created_at').notNull(),
  /** Счётчик курсора синхронизации этого пользователя; растёт в той же транзакции, что и записи. */
  syncSeq: ms('sync_seq').notNull().default(0),
});

export const loginCodes = sqliteTable(
  'login_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: ms('created_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: ms('used_at'),
    /** Когда и на какую редакцию политики человек согласился, запросив код (подтверждение согласия по 152-ФЗ). */
    consentAt: ms('consent_at').notNull(),
    consentVersion: text('consent_version').notNull(),
  },
  (t) => [index('login_codes_email_idx').on(t.email, t.createdAt)],
);

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: ms('created_at').notNull(),
    lastUsedAt: ms('last_used_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const records = sqliteTable(
  'records',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    id: text('id').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    updatedAt: ms('updated_at').notNull(),
    deletedAt: ms('deleted_at'),
    seq: ms('seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.collection, t.id] }), index('records_user_seq_idx').on(t.userId, t.seq)],
);
