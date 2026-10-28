import { useMemo, useState, type ReactElement } from 'react';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { useCatalog } from '../library/useCatalog.ts';
import { useSessions } from '../workout/useSessions.ts';
import { BalanceTab } from './BalanceTab.tsx';
import { CardioTab } from './CardioTab.tsx';
import { ComplexTab } from './ComplexTab.tsx';
import { HistoryList } from './HistoryList.tsx';
import { StrengthTab } from './StrengthTab.tsx';

const TABS = [
  { id: 'strength', label: 'Сила' },
  { id: 'cardio', label: 'Кардио' },
  { id: 'complex', label: 'Комплексы' },
  { id: 'balance', label: 'Баланс' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ProgressScreen(): ReactElement {
  const sessions = useSessions();
  const catalogList = useCatalog();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [tab, setTab] = useState<TabId>('strength');
  const live = sessions ?? [];

  return (
    <>
      <ScreenHead title="Прогресс" />
      <div className="pg-tabs" role="tablist" aria-label="Разделы прогресса">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`pg-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="pg-panel" className="pg-tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="pg-panel" role="tabpanel" aria-labelledby={`pg-tab-${tab}`} className="pg-panel">
        {sessions === undefined ? <div aria-busy="true" /> : null}
        {sessions !== undefined && tab === 'strength' ? <StrengthTab sessions={live} catalog={catalog} /> : null}
        {sessions !== undefined && tab === 'cardio' ? <CardioTab sessions={live} /> : null}
        {sessions !== undefined && tab === 'complex' ? <ComplexTab sessions={live} /> : null}
        {sessions !== undefined && tab === 'balance' ? <BalanceTab sessions={live} /> : null}
      </div>
      <HistoryList />
    </>
  );
}
