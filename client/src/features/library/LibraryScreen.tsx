import type { ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';

export function LibraryScreen(): ReactElement {
  return (
    <>
      <ScreenHead title="Каталог" />
      <p className="stub">Экран появится на одном из следующих этапов.</p>
    </>
  );
}
