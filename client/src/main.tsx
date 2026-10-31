import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@hybridlog/design/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/journal.css';
import './styles/import.css';
import './styles/plan.css';
import './styles/progress.css';
import './styles/htr.css';
import { App } from './app/App.tsx';
import { requestPersistentStorage } from './app/storage.ts';
import { migrateLegacyDb } from './data/legacyMigration.ts';

void requestPersistentStorage();

// Данные из старой базы `splav` переносятся до первого чтения. Приложение открывается при любом исходе:
// сбой пишется в консоль, а зависшая миграция не держит экран дольше 5 секунд (повторный запуск доделает остальное).
const MIGRATION_WAIT_MS = 5000;
const migration = migrateLegacyDb().catch((e: unknown) => console.error('Не удалось перенести данные из базы splav', e));
void Promise.race([migration, new Promise((resolve) => setTimeout(resolve, MIGRATION_WAIT_MS))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
