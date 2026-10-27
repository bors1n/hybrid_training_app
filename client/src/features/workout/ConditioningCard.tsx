import { FORMATS, type ConditioningBlock } from '@splav/shared';
import { useMemo, type ReactElement } from 'react';
import { DurationField, NumberField, RpePicker } from '../../components/fields.tsx';
import { attempts, bestAttempt, formatResult, isTimeFormat } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { moveBlock, removeBlock, updateConditioning } from '../../domain/sessionEdit.ts';
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

type Patch = Parameters<typeof updateConditioning>[2];

export function ConditioningCard({ block, index, count, ctx }: Props): ReactElement {
  const patch = (p: Patch): void => ctx.update((s) => updateConditioning(s, block.id, p));
  const r = block.result;
  const timed = isTimeFormat(block.format);

  const history = useMemo(
    () => (block.complexId ? attempts(block.complexId, ctx.sessions, { excludeSessionId: ctx.sessionId }) : []),
    [block.complexId, ctx.sessions, ctx.sessionId],
  );
  const last = history[0];
  const best = bestAttempt(history);
  const today = todayKey();
  const title = block.name ?? (block.complexId ? `Комплекс ${block.complexId}` : 'Комплекс');

  return (
    <BlockShell
      label={`Блок ${index + 1} · Комплекс`}
      colorVar="var(--conditioning)"
      index={index}
      count={count}
      ariaLabel={`Блок: ${title}`}
      onMove={(d) => ctx.update((s) => moveBlock(s, block.id, d))}
      onRemove={() => ctx.update((s) => removeBlock(s, block.id))}
      dark
    >
      <div className="cx__head">
        {block.complexId ? <span className="cx__code">КОМПЛЕКС {block.complexId}</span> : <span className="cx__code">СВОЙ КОМПЛЕКС</span>}
        <input
          className="cx__title"
          aria-label="Название комплекса"
          defaultValue={title}
          maxLength={200}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== '' && v !== title) patch({ name: v });
          }}
        />
        <div className="cx__prev">
          {last ? (
            <>
              Прошлый раз {formatDateShort(last.date, today)}: {formatResult(last.block.format, last.block.result)}
              {best ? <> · рекорд {formatResult(best.block.format, best.block.result)}</> : null}
            </>
          ) : block.complexId ? (
            'Раньше не выполнялся'
          ) : null}
        </div>
      </div>

      {block.description ? (
        <details className="cx__desc">
          <summary>Состав</summary>
          <p>{block.description}</p>
        </details>
      ) : null}

      <div className="two">
        <label className="field-col">
          <span className="sheet__label cx__label">ФОРМАТ</span>
          <select aria-label="Формат комплекса" value={block.format} onChange={(e) => patch({ format: e.target.value as ConditioningBlock['format'] })}>
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
          </select>
        </label>
        <label className="field-col">
          <span className="sheet__label cx__label">ЛИМИТ, МИН</span>
          <NumberField className="field" label="Лимит времени, мин" value={block.timeCapMin} min={0} max={600} onCommit={(v) => patch({ timeCapMin: v })} />
        </label>
      </div>

      <div className="cx__result">
        <span className="sheet__label">РЕЗУЛЬТАТ</span>
        {timed ? (
          <div className="two">
            <label className="field-col">
              <span className="cx__small">Время</span>
              <DurationField className="field" label="Время результата" value={r.timeSec} onCommit={(v) => patch({ result: { timeSec: v } })} />
            </label>
            <label className="check cx__check">
              <input
                type="checkbox"
                checked={r.finished === false}
                onChange={(e) => patch({ result: { finished: e.target.checked ? false : undefined } })}
              />
              Не уложился
            </label>
          </div>
        ) : null}

        {!timed || r.finished === false ? (
          <div className="two">
            <div className="field-col">
              <span className="cx__small">Раунды</span>
              <div className="stepper">
                <button type="button" className="step" aria-label="Минус раунд" disabled={!r.rounds} onClick={() => patch({ result: { rounds: r.rounds && r.rounds > 1 ? r.rounds - 1 : undefined } })}>−</button>
                <NumberField className="stepper__value" label="Раунды" value={r.rounds} integer min={0} max={1000} inputMode="numeric" placeholder="0" onCommit={(v) => patch({ result: { rounds: v } })} />
                <button type="button" className="step step--plus" aria-label="Плюс раунд" onClick={() => patch({ result: { rounds: (r.rounds ?? 0) + 1 } })}>+</button>
              </div>
            </div>
            <label className="field-col">
              <span className="cx__small">Повторы сверху</span>
              <NumberField className="field" label="Повторы сверху" value={r.extraReps} integer min={0} inputMode="numeric" onCommit={(v) => patch({ result: { extraReps: v } })} />
            </label>
          </div>
        ) : null}

        {block.format === 'EMOM' || block.format === 'TABATA' || block.format === 'INTERVALS' || block.format === 'OTHER' || r.finished === false ? (
          <label className="field-col">
            <span className="cx__small">Всего повторов</span>
            <NumberField className="field" label="Всего повторов" value={r.totalReps} integer min={0} inputMode="numeric" onCommit={(v) => patch({ result: { totalReps: v } })} />
          </label>
        ) : null}

        <div className="field-col">
          <span className="cx__small">RPE</span>
          <RpePicker label="RPE комплекса" value={block.rpe} onChange={(v) => patch({ rpe: v })} />
        </div>
      </div>
    </BlockShell>
  );
}
