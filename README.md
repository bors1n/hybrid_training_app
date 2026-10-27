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

## Проверка на iPhone

PWA на iOS ставится и работает офлайн только по HTTPS. Локально:

1. `npm run preview:phone` — собирает клиент и запускает `vite preview` на `:4173` (API-прокси включён).
2. В отдельном окне: `cloudflared tunnel --url http://localhost:4173` (cloudflared нужно поставить отдельно).
3. Откройте выданный `https://….trycloudflare.com` в Safari → «Поделиться» → «На экран “Домой”».

Адрес quick tunnel меняется при каждом запуске, а PWA с другого адреса — это новое приложение с пустым хранилищем. Для постоянного адреса нужен деплой (этап 6).

## Структура

```
docs/      документы, макеты описаны в CLAUDE.md
design/    tokens.json (из дизайн-системы) → dist/tokens.css
shared/    Zod-схемы и типы для клиента и сервера
client/    React + Vite + PWA; src/{app,data,features,components,styles}
server/    Fastify; src/app.ts (buildApp), src/main.ts (запуск)
```

## Что готово

- [x] Этап 0. Каркас: монорепо, токены дизайн-системы, PWA, Dexie, роутинг и нижняя панель, `/api/health`.
- [ ] Этап 0.5. Аккаунт и синхронизация
- [ ] Этапы 1–5, деплой, сайт
