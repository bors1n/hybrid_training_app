import type { ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';

export function ProgressScreen(): ReactElement {
  return (
    <>
      <ScreenHead title="Прогресс" />
      <p className="stub">Экран появится на одном из следующих этапов.</p>
    </>
  );
}
