import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildApp } from './app.ts';
import { consoleMailer, smtpMailer } from './auth/mailer.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/client.ts';

const env = process.env;
const config = loadConfig(env);
const dbFile = env['DATABASE_FILE'] ?? join(import.meta.dirname, '..', '.data', 'hybridlog.db');
mkdirSync(dirname(dbFile), { recursive: true });
const { db, close } = await openDb({ file: dbFile });

const smtpUrl = env['SMTP_URL'];
const mailer = smtpUrl ? smtpMailer(smtpUrl, env['MAIL_FROM'] ?? 'HybridLog <no-reply@localhost>') : consoleMailer;
if (!smtpUrl) console.warn('SMTP_URL не задан: коды входа печатаются в консоль.');

const app = await buildApp({ db, mailer, config });
const port = Number(env['PORT'] ?? 8787);
await app.listen({ port, host: '127.0.0.1' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(close).then(() => process.exit(0));
  });
}
