# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

SPLAV — PWA на русском для iPhone: журнал гибридных тренировок (сила, кардио, функциональные комплексы и мобильность в одном месте) с аккаунтом и синхронизацией. После MVP в этом же репозитории появится медиасайт Hybrid Training Russia на Astro.

Работа идёт по этапам из `docs/implementation_plan.md`: 0 → 0.5 → 1 → 2 → 3 → 4 → 5 → 6 (деплой) → сайт С0–С3. Этапы 0 (каркас), 0.5 (аккаунт и синхронизация), 1 (модель и справочник), 2 (журнал), 3 (импорт и экспорт), 4 (шаблоны и очередь) и 5 (прогресс) готовы; текущее состояние — в README.md, принятые решения — в DECISIONS.md.

## Команды

```bash
npm install
npm run seed:media   # один раз: каталог RepDB + картинки (не в git; без него в каталоге только упражнения автора)
npm run dev          # сервер :8787 + клиент :5173 (Vite проксирует /api)
npm test             # Vitest по всем пакетам (projects: shared, design, client, server, tests)
npx vitest run client/src/data/db.test.ts   # один файл
npx vitest run -t "название теста"          # один тест
npm run typecheck    # tsc --noEmit по пакетам
npm run build        # design → shared → client (PWA) → server
npm run build -w design   # пересобрать tokens.css после правки tokens.json
npm run preview:phone     # сборка + vite preview :4173 для туннеля на iPhone
npm run dev:site          # сайт (Astro) на :4321
npx vitest run --project site   # тесты сайта (Astro Container API)
```

Сквозные тесты (клиентская синхронизация против настоящего сервера) — в `tests/e2e/`, запуск: `npx vitest run --project e2e`. Код входа в dev печатается в консоль сервера (`npm run dev`); база — PGlite в `server/.data/` (при сбое удалить папку).

Тесты компонентов (React Testing Library) — файлы `*.test.tsx` с первой строкой `// @vitest-environment jsdom`; остальные тесты клиента идут в `node` с `fake-indexeddb`.

Клиент импортирует токены как `@splav/design/tokens.css` (файл генерируется, в git не лежит). Если стили пропали — запусти `npm run build -w design`. Пути в TS-импортах пишутся с расширением `.ts`.

## Документы

| Файл | Что в нём |
|---|---|
| `docs/hybrid_app_plan.md` | План продукта v3, главный документ: раздел 1 — решения, 3 — модель данных, 5 — формат импорта, 6 — экраны, 8 — этапы. При противоречии с промптом прав план |
| `docs/hybrid_app_coding_prompt.md` | ТЗ для разработчика: принципы, стек, архитектура, импорт, прогресс, критерии приёмки MVP |
| `docs/design_system.md` | Краткая дизайн-система. Источник правды — артефакт https://claude.ai/artifact/EZeS1hoJ5r8cbpc9YTPaYp (`project/README.md`, `project/tokens.json`, `project/components/bundle.css`) |
| `docs/import_template.csv` | Шаблон импорта; на нём тестируется импорт |
| `docs/Что такое гибридные тренировки.md` | Несмотря на имя — программа автора: Т1–Т3 и библиотека комплексов #001–#024 (в ТЗ — `hybrid_plan_basic.md`). Из неё делается seed |
| `docs/workouts_history.md` | Реальная история свободным текстом. Приложение её не разбирает; она нужна, чтобы понимать, какие тренировки бывают |

Макеты: холст «Экраны SPLAV» https://claude.ai/artifact/2by4SC7AuvzFAQB8FMPKFT (`project/*.dc.html`: Main, Workout, WorkoutComplex, Progress, Plan, Library, Login) и главная сайта https://claude.ai/artifact/R1ezkNCoF86ES3xT6BUaz6 (`project/HomeNight.dc.html`). Читать инструментом Artifact (`action: read`), не WebFetch.

## Решения, которых нет в документах (27.10.2026)

- Вход только по коду на почту. Apple и Яндекс ID — после MVP; их кнопки с макета Login не показываем.
- Разработка и тесты локально на Windows-ПК; на iPhone — через HTTPS-туннель (PWA и service worker на iOS работают только по HTTPS). После MVP — деплой на российский VPS (152-ФЗ).
- Docker и PostgreSQL на машине нет. Локально и в тестах сервер работает на PGlite, в проде — на PostgreSQL; диалект Drizzle один и тот же.
- Сайт — Astro в монорепо, статьи в Markdown.

## Принципы продукта (из ТЗ, не нарушать)

- Журнал важнее программы: любую тренировку можно внести без шаблона и задним числом. Шаблоны и очередь Т1 → Т2 → Т3 — надстройка.
- Ничего не теряется: каждое изменение сразу пишется в IndexedDB и в очередь синхронизации; без сети всё работает.
- Приложение не решает за человека: никаких автоматических весов, целей и оценок. Бейдж «+2,5 кг» и таймеры отдыха и AMRAP нарисованы на макетах, но в MVP не входят.
- Очередь сдвигается только при завершении тренировки из этой очереди; свободные тренировки и пробежки её не трогают.
- Всё, что читает записанную тренировку или считает статистику, — чистая функция в `client/src/domain/` с тестом рядом (`*.test.ts`).

## Архитектура (целевая)

- npm workspaces: `shared/` (Zod-схемы — единственный источник типов через `z.infer`), `client/` (React, Vite, vite-plugin-pwa, Zustand, Dexie), `server/` (Fastify, Drizzle), `design/` (`tokens.json` из артефакта → `tokens.css`), `site/` (Astro, статический сайт Hybrid Training Russia: шапка/подвал и компоненты в `src/components`, страницы в `src/pages`, внешние адреса — в `src/config.ts`; статьи — Markdown в `src/content/articles/` (frontmatter: title, rubric, date, lead, cover?, readingTime?, draft?; схема в `src/content.config.ts`, рубрики и чистые функции в `src/lib/articles.ts`); тёмная тема системы сайт не меняет).
- Синхронизация:
  - на сервере одна таблица `records(user_id, collection, id, data jsonb, updated_at, deleted_at, seq)`;
  - pull — по серверному курсору `seq` (`GET /api/sync?since=`), а не по часам клиента; push — пачкой (`POST /api/sync`);
  - конфликт решает last-write-wins по `updatedAt` записи; удаление мягкое;
  - на клиенте `outbox` с ключом `collection:id`; `user_id` берётся только из сессии.
- Каталог упражнений RepDB статичен и лежит в бандле. Синхронизируются только свои упражнения, заметки и сопоставления. Seed (шаблоны, очереди, комплексы) создаёт `ensureSeed` после первой синхронизации с `updatedAt = 1` и детерминированными id (`seed:*`, комплексы — `#001`…), чтобы первый вход с двух устройств не плодил дубли.
- Записи проверяются схемами из `shared/src/schemas` дважды: `saveRecord` на клиенте (бросает) и сервер (отклоняет по одной, `rejected` в ответе push). Новая коллекция или поле = схема в `shared`, запись в `RECORD_SCHEMAS`, индекс в `client/src/data/db.ts` (новая версия Dexie).
- Программы: коллекция `programs` (`queueId` + `complexQueueId` → существующие `queues` и `complexQueue`); активная — `settings.activeProgramId` (`domain/programs.ts`, `activeProgram`), без неё базовая `seed:program:basic`. Экраны — `client/src/features/programs/` (`ProgramsScreen` список, `ProgramScreen` одна программа); «Сегодня» берёт очередь активной программы. Очереди могут быть пустыми; `startTemplateWorkout(templateId, { queueId })` называет очередь явно.
- Следующий шаблон и комплекс вычисляются из истории завершённых тренировок, а не хранятся счётчиком.
- Клиентский слой синхронизации: `client/src/sync/` — `records.ts` (`saveRecord`/`deleteRecord`/`applyRemote`: всё, что меняет данные, обязано идти через них, иначе запись не попадёт в `outbox`), `engine.ts` (push → pull), `controller.ts` (состояния и single-flight), `runtime.ts` (браузерные триггеры). Аккаунт: `client/src/auth/store.ts`. Сервер: `server/src/{auth,sync,db}/`.
- Журнал (`client/src/features/workout/`): тренировка редактируется через чистые функции `domain/sessionEdit.ts` (каждая правка пересчитывает тип по блокам), а `useSessionDraft` держит копию в состоянии и пишет её через `saveRecord` с задержкой 300 мс и принудительно при уходе/скрытии вкладки. Подход считается выполненным (`done`), когда в него ввели значение; в итоги и «прошлый результат» идут только выполненные. Итоги (`summary.ts`), прошлый результат (`lastPerformance.ts`), результаты комплексов (`complexResults.ts`) — чистые функции над записями, ничего из этого не хранится.
- Импорт (`client/src/domain/importCsv.ts`) — чистая функция `buildImport(table, opts)`: строки шаблона → тренировки и отчёт (ошибки, предупреждения, новые и неоднозначные упражнения). Ничего не пишет; запись — `data/importService.ts` (`applyImport`), экран — `features/profile/ImportScreen.tsx`. Таблица (`domain/csvText.ts`) общая для CSV и Excel (`data/xlsxFile.ts`, грузится лениво). Экспорт — `domain/exportCsv.ts`; инвариант: импорт ∘ экспорт = тождество (тест). Копия шаблона `client/public/import_template.csv` должна совпадать с `docs/import_template.csv` (тест).
- Прогресс (`client/src/features/progress/`): всё считают чистые функции в `domain/` — `strengthMetrics.ts` (серии по типу нагрузки, Эпли ≤12 повторов), `cardioMetrics.ts` (группы Бег/Вело/Другое и «Все», темп только `role: main`), `balanceMetrics.ts` (баланс сила — выносливость за 4 недели по числу тренировок, недели, минуты, теплокарта, серия недель), `complexMetrics.ts`, `weeks.ts` (неделя с понедельника, даты строками без часовых поясов). Графики — Recharts в отдельном куске (`charts.tsx`, грузится лениво через `ChartBox.tsx`); в jsdom-тестах проверяются плитки и таблицы, не SVG графиков.
- Клиент и API на одном origin: в dev `/api` проксирует Vite, в проде — Caddy. Сессия — httpOnly-cookie.

## Данные и форматы

- Хранение: вес — кг, дистанция — м, время — с, темп — с/км, скорость — км/ч; даты `YYYY-MM-DD` в часовом поясе пользователя. Форматирование только на экране: «85 кг × 8», «7:46 /км», «3,09 км», десятичная запятая.
- Темп с часов (`recordedPace`) показывается, расчётный хранится всегда. Подходы с противовесом (`load: assisted`) не входят в 1ПМ и показываются отдельно от подходов с отягощением (`added`).
- Импорт идёт по колонкам `import_template.csv`. Повторный импорт не создаёт дублей (ключ — дата + название тренировки); экспорт → импорт даёт те же данные.

## Ограничения

- Медиа openGym (Gym visual) использовать нельзя. Картинки — RepDB free с видимой подписью «Exercise data by RepDB (repdb.co)» в «О приложении» и на экране упражнения; датасет отдельно не распространять. Слой медиа заменяемый (`media.source`, `media.license`).
- Каталог RepDB (`client/src/seed/generated/`, `client/public/media/repdb/`) и всё производное от него в git не добавлять: лицензия запрещает распространять набор данных. Проверенные вручную русские названия и сопоставления (`programExercises.ts`, `ownExercises.ts`) — наши, они в git.
- SheetJS ставить с cdn.sheetjs.com: пакет `xlsx` в npm устарел.
- Данные о программе и комплексах — только из документов.
- Новые зависимости — только с обоснованием в отчёте этапа.
- Цвета — только CSS-токены (тёмная тема по системной настройке). Цвета типов везде одни: сила `cobalt`, кардио `cardio`, комплекс `conditioning` (он же рекорд; не больше одного оранжевого элемента на экране), мобильность `mobility`.

## Порядок работы

- Этапы строго по очереди. В конце каждого:
  - `npm test`, `tsc --noEmit` и `npm run build` проходят;
  - README.md (запуск, структура, что готово) и DECISIONS.md обновлены;
  - короткий отчёт: что сделано, что проверить на iPhone, открытые вопросы;
  - остановиться и ждать подтверждения; коммит — после него.
- Неоднозначность — выбрать разумный вариант, записать в DECISIONS.md и продолжать.
- Окружение: Windows 11, Node 24, npm 11 (pnpm нет).
