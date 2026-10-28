import type { SetEntry, StrengthBlock } from '@splav/shared';
import { useMemo, useState, type ReactElement } from 'react';
import { ConfirmButton, DurationField, NumberField } from '../../components/fields.tsx';
import { copySet, addItemToBlock, addSet, moveBlock, removeBlock, removeItem, removeSet, setItemLoad, updateSet, LOAD_LABELS } from '../../domain/sessionEdit.ts';
import { formatDateShort, formatSet, lastPerformance } from '../../domain/lastPerformance.ts';
import { todayKey } from '../../domain/history.ts';
import { useExerciseNote } from '../library/useCatalog.ts';
import { BlockShell } from './BlockShell.tsx';
import { exerciseName, type WorkoutCtx } from './ctx.ts';
import { ExercisePicker } from './ExercisePicker.tsx';

interface CardProps {
  block: StrengthBlock;
  index: number;
  count: number;
  ctx: WorkoutCtx;
}

interface ItemProps {
  block: StrengthBlock;
  itemIndex: number;
  ctx: WorkoutCtx;
}

function ItemEditor({ block, itemIndex, ctx }: ItemProps): ReactElement {
  const item = block.items[itemIndex]!;
  const ex = ctx.catalog.get(item.exerciseId);
  const name = exerciseName(ctx, item.exerciseId);
  const note = useExerciseNote(item.exerciseId);
  const last = useMemo(
    () => lastPerformance(item.exerciseId, ctx.sessions, { excludeSessionId: ctx.sessionId, onOrBefore: ctx.date }),
    [item.exerciseId, ctx.sessions, ctx.sessionId, ctx.date],
  );

  const metrics = ex?.metrics ?? 'weight_reps';
  const load = item.sets[0]?.load ?? 'normal';
  const showWeight = metrics === 'weight_reps' || load !== 'normal' || item.sets.some((s) => s.weightKg !== undefined);
  // Время подхода (планка, статика) доступно любому упражнению: кнопка «+ Время» включает колонку.
  const [timeOn, setTimeOn] = useState(false);
  const showTime = timeOn || metrics === 'time' || item.sets.some((s) => s.durationSec !== undefined);
  const showReps = metrics !== 'time' || item.sets.some((s) => s.reps !== undefined);
  const canChangeLoad = ex?.equipment === 'bodyweight' || ex?.equipment === 'machine' || load !== 'normal';

  const cols = ['26px', 'minmax(0,1fr)', ...(showWeight ? ['56px'] : []), ...(showReps ? ['46px'] : []), ...(showTime ? ['62px'] : []), '40px', '36px'];
  const grid = { gridTemplateColumns: cols.join(' ') };
  const weightLabel = load === 'added' ? '+КГ' : load === 'assisted' ? '−КГ' : 'КГ';
  const prefix = block.superset ? `${String.fromCharCode(65 + itemIndex)}` : '';

  const patch = (setIndex: number, p: Partial<SetEntry>): void => ctx.update((s) => updateSet(s, block.id, itemIndex, setIndex, p));
  const today = todayKey();

  return (
    <div className="item" role="group" aria-label={name}>
      <div className="item__head">
        <div className="item__title">
          <span className="item__name">{prefix ? `${prefix} · ` : ''}{name}</span>
          <span className="item__prev">
            {last ? `Прошлый раз ${formatDateShort(last.date, today)}: ${last.sets.map(formatSet).join(' · ')}` : 'Раньше не выполнялось'}
          </span>
        </div>
        {block.superset ? (
          <ConfirmButton label="×" ariaLabel={`Убрать упражнение: ${name}`} confirmLabel="Убрать?" onConfirm={() => ctx.update((s) => removeItem(s, block.id, itemIndex))} className="icon-btn" />
        ) : null}
      </div>

      {note ? <p className="item__note">Заметка: {note}</p> : null}
      {item.note ? <p className="item__note item__note--tpl">{item.note}</p> : null}
      {ex?.perSide ? <p className="item__hint">Повторы считаются на каждую сторону</p> : null}

      {canChangeLoad ? (
        <label className="item__load">
          <span className="sheet__label">НАГРУЗКА</span>
          <select
            aria-label="Тип нагрузки"
            value={load}
            onChange={(e) => ctx.update((s) => setItemLoad(s, block.id, itemIndex, e.target.value as SetEntry['load']))}
          >
            {(Object.keys(LOAD_LABELS) as SetEntry['load'][]).map((l) => (
              <option key={l} value={l}>{LOAD_LABELS[l]}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="setrow setrow--head" style={grid} aria-hidden="true">
        <span>№</span>
        <span>ПРОШЛЫЙ</span>
        {showWeight ? <span className="c">{weightLabel}</span> : null}
        {showReps ? <span className="c">ПОВТ</span> : null}
        {showTime ? <span className="c">ВРЕМЯ</span> : null}
        <span className="c">RPE</span>
        <span />
      </div>

      {item.sets.map((set, i) => {
        const n = i + 1;
        const prev = last?.sets[i];
        return (
          <div key={i} className={`setrow${set.done ? ' is-done' : ''}`} style={grid}>
            <span className="setrow__no">{n}</span>
            <span className="setrow__prev">{prev ? formatSet(prev) : '–'}</span>
            {showWeight ? <NumberField label={`Подход ${n}, вес`} value={set.weightKg} min={0} max={1000} onCommit={(v) => patch(i, { weightKg: v })} /> : null}
            {showReps ? <NumberField label={`Подход ${n}, повторы`} value={set.reps} integer min={0} max={10000} inputMode="numeric" onCommit={(v) => patch(i, { reps: v })} /> : null}
            {showTime ? <DurationField label={`Подход ${n}, время`} value={set.durationSec} onCommit={(v) => patch(i, { durationSec: v })} /> : null}
            <NumberField label={`Подход ${n}, RPE`} value={set.rpe} integer min={1} max={10} inputMode="numeric" onCommit={(v) => patch(i, { rpe: v })} />
            <button
              type="button"
              className="check-btn"
              aria-pressed={set.done}
              aria-label={`Подход ${n}, выполнен`}
              onClick={() => patch(i, { done: !set.done })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
            </button>
          </div>
        );
      })}

      <div className="item__actions">
        <button
          type="button"
          className="pill-btn"
          onClick={() => ctx.update((s) => addSet(s, block.id, itemIndex, last?.sets[item.sets.length] ?? last?.sets.at(-1)))}
        >
          + Подход (копия)
        </button>
        <button
          type="button"
          className="pill-btn pill-btn--quiet"
          disabled={item.sets.length <= 1}
          onClick={() => ctx.update((s) => removeSet(s, block.id, itemIndex, item.sets.length - 1))}
        >
          − Подход
        </button>
        {!showTime ? (
          <button type="button" className="pill-btn pill-btn--quiet" onClick={() => setTimeOn(true)}>+ Время</button>
        ) : null}
      </div>
    </div>
  );
}

/** Строка суперсета по макету: название, прошлый результат, подход текущего круга; по нажатию раскрывается ввод. */
function SupersetRow({ block, itemIndex, round, ctx }: ItemProps & { round: number }): ReactElement {
  const [open, setOpen] = useState(false);
  const item = block.items[itemIndex]!;
  const name = exerciseName(ctx, item.exerciseId);
  const last = useMemo(
    () => lastPerformance(item.exerciseId, ctx.sessions, { excludeSessionId: ctx.sessionId, onOrBefore: ctx.date }),
    [item.exerciseId, ctx.sessions, ctx.sessionId, ctx.date],
  );
  const current = item.sets[round];
  const lastTop = last?.sets[last.sets.length - 1];
  return (
    <div className="ss-item">
      <button type="button" className="ss-item__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ss-item__text">
          <span className="ss-item__name">{String.fromCharCode(65)}{itemIndex + 1} · {name}</span>
          <span className="ss-item__prev">
            {lastTop ? `Прошлый: ${formatSet(lastTop)}${lastTop.rpe !== undefined ? ` · RPE ${lastTop.rpe}` : ''}` : 'Раньше не выполнялось'}
          </span>
        </span>
        <span className={`ss-item__now${current?.done ? ' is-done' : ''}`}>{current ? formatSet(current) : '–'}</span>
      </button>
      {open ? <ItemEditor block={block} itemIndex={itemIndex} ctx={ctx} /> : null}
    </div>
  );
}

function SupersetBody({ block, ctx }: { block: StrengthBlock; ctx: WorkoutCtx }): ReactElement {
  const rounds = Math.max(...block.items.map((i) => i.sets.length));
  const roundDone = (r: number): boolean => block.items.every((i) => i.sets[r]?.done);
  const firstOpen = Array.from({ length: rounds }, (_, r) => r).find((r) => !roundDone(r));
  const round = firstOpen ?? rounds - 1;
  return (
    <>
      {block.items.map((_, i) => (
        <SupersetRow key={i} block={block} itemIndex={i} round={round} ctx={ctx} />
      ))}
      <div className="ss-rounds" role="img" aria-label={`Круг ${round + 1} из ${rounds}`}>
        {Array.from({ length: rounds }, (_, r) => <span key={r} className={roundDone(r) ? 'is-done' : ''} />)}
      </div>
      <span className="item__hint">Круг {round + 1} из {rounds} · нажми на упражнение, чтобы внести подход</span>
    </>
  );
}

export function StrengthCard({ block, index, count, ctx }: CardProps): ReactElement {
  const [picking, setPicking] = useState(false);
  const rounds = Math.max(...block.items.map((i) => i.sets.length));
  const label = block.superset ? `Блок ${index + 1} · Суперсет · ${rounds} ${rounds === 1 ? 'круг' : rounds < 5 ? 'круга' : 'кругов'}` : `Блок ${index + 1} · Сила`;
  const first = exerciseName(ctx, block.items[0]!.exerciseId);

  return (
    <BlockShell
      label={label}
      colorVar="var(--strength)"
      index={index}
      count={count}
      ariaLabel={`Блок: ${block.superset ? 'суперсет' : first}`}
      onMove={(d) => ctx.update((s) => moveBlock(s, block.id, d))}
      onRemove={() => ctx.update((s) => removeBlock(s, block.id))}
    >
      {block.superset ? (
        <SupersetBody block={block} ctx={ctx} />
      ) : (
        block.items.map((_, i) => <ItemEditor key={i} block={block} itemIndex={i} ctx={ctx} />)
      )}

      <div className="item__actions">
        <button type="button" className="pill-btn" onClick={() => setPicking(true)}>
          {block.superset ? '+ Упражнение в суперсет' : '+ В суперсет'}
        </button>
        {block.superset ? (
          <button
            type="button"
            className="pill-btn"
            onClick={() =>
              ctx.update((s) => block.items.reduce((acc, _, i) => addSet(acc, block.id, i), s))
            }
          >
            + Круг
          </button>
        ) : null}
      </div>

      {picking ? (
        <ExercisePicker
          title="Упражнение в суперсет"
          catalog={ctx.catalogList}
          sessions={ctx.sessions}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false);
            const prev = lastPerformanceFor(ctx, e.id);
            ctx.update((s) => addItemToBlock(s, block.id, { exerciseId: e.id, perSide: e.perSide || undefined, ...(prev ? { sets: [copySet(prev)] } : {}) }));
          }}
        />
      ) : null}
    </BlockShell>
  );
}

/** Первый подход прошлого результата: новое упражнение начинается с него (копия, не рекомендация). */
export function lastPerformanceFor(ctx: Pick<WorkoutCtx, 'sessions' | 'sessionId' | 'date'>, exerciseId: string): SetEntry | null {
  const p = lastPerformance(exerciseId, ctx.sessions, { excludeSessionId: ctx.sessionId, onOrBefore: ctx.date });
  return p?.sets[0] ?? null;
}
