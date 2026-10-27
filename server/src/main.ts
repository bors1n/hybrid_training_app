import { buildApp } from './app.ts';

const port = Number(process.env['PORT'] ?? 8787);
const app = buildApp();
await app.listen({ port, host: '127.0.0.1' });
