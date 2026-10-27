# Принятые решения

Новые записи — сверху в рамках этапа. Формат: решение, причина.

## Этап 0. Каркас

- **npm workspaces** (`shared`, `design`, `client`, `server`). pnpm на машине нет, npm 11 достаточно.
- **Импорты с расширением `.ts`** и `allowImportingTsExtensions` в `tsconfig.base.json`: сборщики (Vite, tsx, Vitest) разрешают их без эмита, а `tsc` только проверяет типы (`noEmit`).
- **Zod-схемы живут в `shared/`**, а не в `client/src/domain/`, как сказано в промпте: их используют и клиент, и сервер. `domain/` будет содержать только чистые функции.
- **Токены**: `design/tokens.json` скопирован из артефакта дизайн-системы; `design/tokens-css.ts` генерирует `dist/tokens.css`. Алиасы (`strength = {cobalt}`) раскрываются при генерации. Тёмная тема включается по `prefers-color-scheme` и по `[data-theme="dark"]`; `[data-theme="light"]` принудительно возвращает светлую.
- **Шрифты локальные** (`@fontsource`, кириллица и латиница): работают офлайн и не зависят от Google. Из `bundle.css` убран `@import` Google Fonts.
- **Классы `htr-*`** скопированы из `bundle.css` в `client/src/styles/htr.css` без изменений (кроме удалённых `@import` и правила `body`).
- **PWA**: `vite-plugin-pwa` в режиме `generateSW`, `registerType: autoUpdate`, `navigateFallback` на `/index.html` с исключением `/api/`. Иконки генерирует `@vite-pwa/assets-generator` из одного SVG (слиток на `night`); maskable и apple-touch-icon с фоном `night`.
- **Один origin**: Vite проксирует `/api` на `localhost:8787` и в dev, и в preview — cookie сессии будут работать без CORS. `allowedHosts: true` в preview нужен, чтобы открывать его через туннель.
- **`navigator.storage.persist()`** вызывается один раз; факт запроса и ответ хранятся в таблице `meta`.
- **Роутер**: `react-router` v8 в режиме библиотеки (`BrowserRouter`). Тренировка — отдельный маршрут `/workout/:id` вне вкладок (полноэкранная поверх).
- **Версии** пакетов взяты актуальные на 27.10.2026 (React 19.3, Vite 8, Vitest 5, TypeScript 7, Zod 4); всё собралось без правок кода под них.

## Зависимости этапа 0

| Пакет | Зачем |
|---|---|
| react, react-dom, react-router | интерфейс и маршруты |
| zustand | состояние (пока не используется, нужен с этапа 0.5) |
| dexie, dexie-react-hooks | локальная копия данных в IndexedDB |
| @fontsource/* | локальные шрифты дизайн-системы |
| zod | схемы в `shared/` |
| vite, @vitejs/plugin-react, vite-plugin-pwa, @vite-pwa/assets-generator | сборка и PWA |
| fastify | сервер |
| vitest, fake-indexeddb | тесты, IndexedDB в Node |
| typescript, tsx, concurrently, @types/node | типы, запуск сервера, параллельный `dev` |
