import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { useAuth } from '../auth/store.ts';
import { TabBar } from '../components/TabBar.tsx';
import { LoginScreen } from '../features/auth/LoginScreen.tsx';
import { LibraryScreen } from '../features/library/LibraryScreen.tsx';
import { PlanScreen } from '../features/plan/PlanScreen.tsx';
import { TemplateEditor } from '../features/plan/TemplateEditor.tsx';
import { ProgressScreen } from '../features/progress/ProgressScreen.tsx';
import { TodayScreen } from '../features/today/TodayScreen.tsx';
import { WorkoutScreen } from '../features/workout/WorkoutScreen.tsx';
import { startSync } from '../sync/runtime.ts';
import { ProfileProvider } from './profile.tsx';

// Импорт нужен редко: разбор CSV и Excel подгружается отдельным куском.
const ImportScreen = lazy(() => import('../features/profile/ImportScreen.tsx').then((m) => ({ default: m.ImportScreen })));

function TabsLayout(): ReactElement {
  return (
    <div className="app">
      <main className="app__main"><Outlet /></main>
      <TabBar />
    </div>
  );
}

function Authed(): ReactElement {
  const markUnauthenticated = useAuth((s) => s.markUnauthenticated);
  useEffect(() => startSync(markUnauthenticated), [markUnauthenticated]);
  return (
    <BrowserRouter>
      <ProfileProvider>
        <Routes>
          <Route element={<TabsLayout />}>
            <Route index element={<TodayScreen />} />
            <Route path="plan" element={<PlanScreen />} />
            <Route path="progress" element={<ProgressScreen />} />
            <Route path="library" element={<LibraryScreen />} />
          </Route>
          <Route path="workout/:id" element={<WorkoutScreen />} />
          <Route path="template/:id" element={<TemplateEditor />} />
          <Route path="import" element={<Suspense fallback={<div className="fullscreen" aria-busy="true" />}><ImportScreen /></Suspense>} />
        </Routes>
      </ProfileProvider>
    </BrowserRouter>
  );
}

export function App(): ReactElement | null {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'loading') return <div className="splash" aria-busy="true" />;
  if (status === 'anon') return <LoginScreen />;
  return <Authed />;
}
