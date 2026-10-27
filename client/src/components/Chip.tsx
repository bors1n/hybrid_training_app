import type { ReactElement, ReactNode } from 'react';

/** Кнопка-фильтр: включена — aria-pressed. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }): ReactElement {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
