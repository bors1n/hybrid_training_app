import { type ConditioningBlock } from '@hybridlog/shared';
import { useMemo, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { attempts, bestAttempt, formatResult } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { moveBlock, removeBlock } from '../../domain/sessionEdit.ts';
import { BlockShell } from './BlockShell.tsx';
import type { WorkoutCtx } from './ctx.ts';

export const FORMAT_LABELS: Record<ConditioningBlock['format'], string> = {
  AMRAP: 'AMRAP — максимум раундов',
  EMOM: 'EMOM — каждую минуту',
  FOR_TIME: 'На время',
  TABATA: 'Табата',
  INTERVALS: 'Интервалы',
  LADDER: 'Лесенка',
  ROUNDS: 'Раунды на время',
  OTHER: 'Другое',
};

interface Props {
  block: ConditioningBlock;
  index: number;
  count: number;
  ctx: WorkoutCtx;
}

/** Есть ли у блока хоть какой-то результат: тогда на карточке показываем его, а не прошлый рекорд. */
const hasResult = (b: ConditioningBlock): boolean => Object.values(b.result).some((v) => v !== undefined);

/**
 * Комплекс в тренировке — тёмная карточка-сводка (как на макете Workout): название, рекорд и кнопка «Открыть».
 * Ввод результата — на отдельном экране комплекса (`ConditioningScreen`).
 */
export function ConditioningCard({ block, index, count, ctx }: Props): ReactElement {
  const navigate = useNavigate();
  const history = useMemo(
    () => (block.complexId ? attempts(block.complexId, ctx.sessions, { excludeSessionId: ctx.sessionId }) : []),
    [block.complexId, ctx.sessions, ctx.sessionId],
  );
  const best = bestAttempt(history);
  const last = history[0];
  const base = block.name ?? (block.complexId ? `Комплекс ${block.complexId}` : 'Комплекс');
  const heading = block.complexId && block.name ? `${block.complexId} · ${block.name}` : base;
  const sub = hasResult(block)
    ? `Результат: ${formatResult(block.format, block.result)}`
    : best
      ? `Рекорд: ${formatResult(best.block.format, best.block.result)}${last ? ` · прошлый раз ${formatDateShort(last.date, todayKey())}` : ''}`
      : block.complexId
        ? 'Раньше не выполнялся'
        : 'Свой комплекс';

  return (
    <BlockShell
      label={`Блок ${index + 1} · Комплекс`}
      colorVar="var(--conditioning)"
      index={index}
      count={count}
      ariaLabel={`Блок: ${base}`}
      onMove={(d) => ctx.update((s) => moveBlock(s, block.id, d))}
      onRemove={() => ctx.update((s) => removeBlock(s, block.id))}
      dark
    >
      <div className="cx-sum">
        <div className="cx-sum__text">
          <span className="cx-sum__title">{heading}</span>
          <span className="cx-sum__sub">{sub}</span>
        </div>
        <button type="button" className="cx-sum__open" onClick={() => void ctx.flush().then(() => navigate(`/workout/${ctx.sessionId}/complex/${block.id}`))}>
          Открыть
        </button>
      </div>
    </BlockShell>
  );
}
