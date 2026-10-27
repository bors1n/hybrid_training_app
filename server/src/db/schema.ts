import { bigint, index, jsonb, pgTable, primaryKey, integer, text, uuid } from 'drizzle-orm/pg-core';

const ms = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: ms('created_at').notNull(),
  /** Счётчик курсора синхронизации этого пользователя; растёт в той же транзакции, что и записи. */
  syncSeq: ms('sync_seq').notNull().default(0),
});

export const loginCodes = pgTable(
  'login_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: ms('created_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: ms('used_at'),
  },
  (t) => [index('login_codes_email_idx').on(t.email, t.createdAt)],
);

export const authSessions = pgTable(
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

export const records = pgTable(
  'records',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    collection: text('collection').notNull(),
    id: text('id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    updatedAt: ms('updated_at').notNull(),
    deletedAt: ms('deleted_at'),
    seq: ms('seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.collection, t.id] }), index('records_user_seq_idx').on(t.userId, t.seq)],
);
