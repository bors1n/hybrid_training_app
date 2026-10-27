import type { MobilityBlock } from '@splav/shared';
import { useState, type ReactElement } from 'react';
import { ConfirmButton, DurationField } from '../../components/fields.tsx';
import { addMobilityItem, moveBlock, removeBlock, removeMobilityItem, updateMobilityItem } from '../../domain/sessionEdit.ts';
import { formatDuration } from '../../domain/units.ts';
import { BlockShell } from './BlockShell.tsx';
import { exerciseName, type WorkoutCtx } from './ctx.ts';
import { ExercisePicker } from './ExercisePicker.tsx';

interface Props {
  block: MobilityBlock;
  index: number;
  count: number;
  ctx: WorkoutCtx;
}

export function MobilityCard({ block, index, count, ctx }: Props): ReactElement {
  const [picking, setPicking] = useState(false);
  const total = block.items.reduce((sum, i) => sum + (i.durationSec ?? 0), 0);

  return (
    <BlockShell
      label={`Блок ${index + 1} · Мобильность`}
      colorVar="var(--mobility)"
      index={index}
      count={count}
      ariaLabel="Блок: мобильность"
      onMove={(d) => ctx.update((s) => moveBlock(s, block.id, d))}
      onRemove={() => ctx.update((s) => removeBlock(s, block.id))}
    >
      {block.items.map((item, i) => {
        const name = exerciseName(ctx, item.exerciseId);
        return (
          <div key={i} className="mob-row">
            <span className="mob-row__name">{name}</span>
            <DurationField
              label={`${name}, время`}
              value={item.durationSec}
              onCommit={(v) => ctx.update((s) => updateMobilityItem(s, block.id, i, { durationSec: v }))}
            />
            <ConfirmButton label="×" ariaLabel={`Убрать: ${name}`} confirmLabel="?" onConfirm={() => ctx.update((s) => removeMobilityItem(s, block.id, i))} className="icon-btn" />
          </div>
        );
      })}
      <div className="item__actions">
        <button type="button" className="pill-btn" onClick={() => setPicking(true)}>+ Упражнение</button>
        {total > 0 ? <span className="item__hint">Всего {formatDuration(total)}</span> : null}
      </div>

      {picking ? (
        <ExercisePicker
          title="Мобильность и кор"
          catalog={ctx.catalogList}
          sessions={ctx.sessions}
          kinds={['mobility', 'core']}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false);
            ctx.update((s) => addMobilityItem(s, e.id, undefined, block.id));
          }}
        />
      ) : null}
    </BlockShell>
  );
}
