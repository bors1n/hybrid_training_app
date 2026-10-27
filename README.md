# SPLAV

PWA на русском для iPhone: дневник гибридных тренировок (сила, кардио, комплексы, мобильность). Сайт Hybrid Training Russia появится позже в `site/`.

Документы и план этапов — в [docs/](docs/). Главный: [docs/hybrid_app_plan.md](docs/hybrid_app_plan.md); порядок работ: [docs/implementation_plan.md](docs/implementation_plan.md).

## Запуск

Нужен Node 24 и npm 11.

```bash
npm install
npm run dev            # сервер (8787) + клиент (5173); /api проксируется на сервер
npm test               # Vitest, все пакеты
npm run typecheck      # tsc --noEmit по всем пакетам
npm run build          # токены → shared → клиент (с PWA) → сервер
npx vitest run client/src/data/db.test.ts   # один тест
```

После правки `design/tokens.json` пересоберите токены: `npm run build -w design` (клиент берёт `design/dist/tokens.css`).
Иконки PWA генерируются из `client/public/favicon.svg`: `cd client && npx pwa-assets-generator`.

## Вход в dev-режиме

Почтовый сервис не нужен: пока не задан `SMTP_URL`, сервер печатает код входа в свою консоль (`npm run dev`, строка «[вход] код для …»). База — встроенный PGlite в `server/.data/pg` (создаётся при первом запуске, первый старт занимает несколько секунд). Сломалась или не нужна — удалите папку `server/.data`.

Переменные окружения сервера: `PORT` (8787), `DATABASE_URL` (PostgreSQL вместо PGlite), `PGLITE_DIR`, `AUTH_SECRET` (обязателен при `NODE_ENV=production`), `SMTP_URL`, `MAIL_FROM`, `COOKIE_SECURE` (`1`/`0`, по умолчанию `1` в production), `TRUST_PROXY=1` (за Caddy или туннелем — чтобы лимиты считались по реальному IP).

Миграции: после правки `server/src/db/schema.ts` выполните `npx drizzle-kit generate` в папке `server/`; применяются при старте сервера.

## Проверка на iPhone

PWA на iOS ставится и работает офлайн только по HTTPS. Локально:

1. `npm run preview:phone` — собирает клиент и запускает `vite preview` на `:4173` (API-прокси включён).
2. Запустите сервер: `npm run start -w server` (код входа смотрите в его консоли).
3. В отдельном окне: `cloudflared tunnel --url http://localhost:4173` (cloudflared нужно поставить отдельно).
4. Откройте выданный `https://….trycloudflare.com` в Safari → «Поделиться» → «На экран “Домой”».

Адрес quick tunnel меняется при каждом запуске, а PWA с другого адреса — это новое приложение с пустым хранилищем. Для постоянного адреса нужен деплой (этап 6).

## Структура

```
docs/      документы, макеты описаны в CLAUDE.md
tests/     сквозные тесты: клиентская синхронизация против настоящего сервера
design/    tokens.json (из дизайн-системы) → dist/tokens.css
shared/    Zod-схемы и типы для клиента и сервера
client/    React + Vite + PWA; src/{app,data,features,components,styles}
server/    Fastify; src/app.ts (buildApp), src/main.ts (запуск)
```

## Что готово

- [x] Этап 0. Каркас: монорепо, токены дизайн-системы, PWA, Dexie, роутинг и нижняя панель, `/api/health`.
- [x] Этап 0.5. Аккаунт и синхронизация: вход по коду на почту, сессии в httpOnly-cookie, `GET/POST /api/sync`, офлайн-очередь на клиенте, значок «не синхронизировано», выход
- [ ] Этапы 1–5, деплой, сайт
