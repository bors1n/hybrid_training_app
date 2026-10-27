import type { ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';

export function PlanScreen(): ReactElement {
  return (
    <>
      <ScreenHead title="План" />
      <p className="stub">Экран появится на одном из следующих этапов.</p>
    </>
  );
}
