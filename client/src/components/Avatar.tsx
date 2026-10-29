import { useMemo, type ReactElement } from 'react';
import { identicon, IDENTICON_SIZE } from '../domain/identicon.ts';

/** Аватар-узор по id пользователя (как на GitHub): клетки цвета токена на `--surface`. */
export function Avatar({ seed, size = 44 }: { seed: string; size?: number }): ReactElement {
  const pic = useMemo(() => identicon(seed), [seed]);
  // Поля в одну клетку, чтобы узор не прилипал к краю круга.
  const n = IDENTICON_SIZE + 2;
  return (
    <svg className="avatar" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Аватар" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="var(--surface)" />
      {pic.cells.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}:${y}`} x={x + 1} y={y + 1} width={1} height={1} style={{ fill: pic.color }} /> : null)))}
    </svg>
  );
}
