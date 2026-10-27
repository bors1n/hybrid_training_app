import type { ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';

export function TodayScreen(): ReactElement {
  return (
    <>
      <ScreenHead title="Сегодня" />
      <p className="stub">Экран появится на одном из следующих этапов.</p>
    </>
  );
}
