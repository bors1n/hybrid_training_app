import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@splav/design/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/journal.css';
import './styles/import.css';
import './styles/plan.css';
import './styles/htr.css';
import { App } from './app/App.tsx';
import { requestPersistentStorage } from './app/storage.ts';

void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
