import type { ReactElement } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { TabBar } from '../components/TabBar.tsx';
import { LibraryScreen } from '../features/library/LibraryScreen.tsx';
import { PlanScreen } from '../features/plan/PlanScreen.tsx';
import { ProgressScreen } from '../features/progress/ProgressScreen.tsx';
import { TodayScreen } from '../features/today/TodayScreen.tsx';
import { WorkoutScreen } from '../features/workout/WorkoutScreen.tsx';
import { ProfileProvider } from './profile.tsx';

function TabsLayout(): ReactElement {
  return (
    <div className="app">
      <main className="app__main"><Outlet /></main>
      <TabBar />
    </div>
  );
}

export function App(): ReactElement {
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
        </Routes>
      </ProfileProvider>
    </BrowserRouter>
  );
}
