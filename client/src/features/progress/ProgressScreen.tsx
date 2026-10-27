import type { ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { HistoryList } from './HistoryList.tsx';

export function ProgressScreen(): ReactElement {
  return (
    <>
      <ScreenHead title="Прогресс" />
      <p className="stub">Графики силы, кардио, комплексов и баланса появятся на этапе 5.</p>
      <HistoryList />
    </>
  );
}
