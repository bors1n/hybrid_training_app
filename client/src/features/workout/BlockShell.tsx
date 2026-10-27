import type { ReactElement, ReactNode } from 'react';
import { ConfirmButton } from '../../components/fields.tsx';

interface Props {
  /** «Блок 1 · Сила». */
  label: string;
  colorVar: string;
  index: number;
  count: number;
  ariaLabel: string;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
  /** Тёмная карточка (комплекс). */
  dark?: boolean;
}

/** Рамка блока: подпись с цветом типа, перемещение и удаление. */
export function BlockShell({ label, colorVar, index, count, ariaLabel, onMove, onRemove, children, dark }: Props): ReactElement {
  return (
    <section className={`block${dark ? ' block--dark' : ''}`} aria-label={ariaLabel}>
      <div className="block__label">
        <span className="dot" style={{ background: colorVar }} />
        {label}
      </div>
      <div className="block__body">{children}</div>
      <div className="block__tools">
        <button type="button" className="icon-btn" aria-label="Блок выше" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="icon-btn" aria-label="Блок ниже" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        <ConfirmButton label="Убрать блок" confirmLabel="Убрать?" onConfirm={onRemove} className="link-btn" />
      </div>
    </section>
  );
}
