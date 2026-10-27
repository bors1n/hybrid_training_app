import { MODALITIES, CARDIO_ROLES, type CardioBlock } from '@splav/shared';
import { useMemo, type ReactElement } from 'react';
import { DistanceField, DurationField, NumberField, RpePicker } from '../../components/fields.tsx';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { lastCardio } from '../../domain/recent.ts';
import { MODALITY_LABELS, ROLE_LABELS, moveBlock, removeBlock, updateCardio, type CardioPatch } from '../../domain/sessionEdit.ts';
import { formatKm, formatPaceLabel, paceDeviationPct } from '../../domain/units.ts';
import { BlockShell } from './BlockShell.tsx';
import type { WorkoutCtx } from './ctx.ts';

interface Props {
  block: CardioBlock;
  index: number;
  count: number;
  ctx: WorkoutCtx;
}

export function CardioCard({ block, index, count, ctx }: Props): ReactElement {
  const patch = (p: CardioPatch): void => ctx.update((s) => updateCardio(s, block.id, p));
  const last = useMemo(
    () => lastCardio(block.modality, block.role, ctx.sessions, { excludeSessionId: ctx.sessionId, onOrBefore: ctx.date }),
    [block.modality, block.role, ctx.sessions, ctx.sessionId, ctx.date],
  );

  const shownPace = block.recordedPace ?? block.paceSecPerKm;
  const paceNote = block.recordedPace !== undefined ? 'с часов' : block.paceSecPerKm !== undefined ? 'авто' : '';
  const paceDiffers =
    block.recordedPace !== undefined && block.paceSecPerKm !== undefined && paceDeviationPct(block.recordedPace, block.paceSecPerKm) > 5;
  const name = block.name ?? MODALITY_LABELS[block.modality];

  const lastText = last
    ? [
        last.block.distanceM !== undefined ? formatKm(last.block.distanceM) : null,
        last.block.durationSec !== undefined ? `${Math.round(last.block.durationSec / 60)} мин` : null,
        last.block.recordedPace ?? last.block.paceSecPerKm ? formatPaceLabel((last.block.recordedPace ?? last.block.paceSecPerKm)!) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <BlockShell
      label={`Блок ${index + 1} · Кардио`}
      colorVar="var(--cardio)"
      index={index}
      count={count}
      ariaLabel={`Блок: ${name}`}
      onMove={(d) => ctx.update((s) => moveBlock(s, block.id, d))}
      onRemove={() => ctx.update((s) => removeBlock(s, block.id))}
    >
      <div className="item__head">
        <div className="item__title">
          <span className="item__name">{name}</span>
          <span className="item__prev">{last ? `Прошлый раз ${formatDateShort(last.date, todayKey())}: ${lastText}` : 'Раньше не выполнялось'}</span>
        </div>
      </div>

      <div className="two">
        <label className="field-col">
          <span className="sheet__label">ВИД</span>
          <select
            aria-label="Вид кардио"
            value={block.modality}
            onChange={(e) => {
              const modality = e.target.value as CardioBlock['modality'];
              // Название следует за видом, пока его не меняли вручную.
              const followsModality = block.name === undefined || block.name === MODALITY_LABELS[block.modality];
              patch({ modality, ...(followsModality ? { name: MODALITY_LABELS[modality] } : {}) });
            }}
          >
            {MODALITIES.map((m) => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="field-col">
          <span className="sheet__label">РОЛЬ</span>
          <select aria-label="Роль" value={block.role} onChange={(e) => patch({ role: e.target.value as CardioBlock['role'] })}>
            {CARDIO_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
      </div>

      <div className="grid2">
        <label className="metric">
          <span className="sheet__label">ДИСТАНЦИЯ, КМ</span>
          <DistanceField className="metric__input" label="Дистанция, км" value={block.distanceM} min={0} onCommit={(v) => patch({ distanceM: v })} />
        </label>
        <label className="metric">
          <span className="sheet__label">ВРЕМЯ</span>
          <DurationField className="metric__input" label="Время" value={block.durationSec} onCommit={(v) => patch({ durationSec: v })} />
        </label>
        <div className="metric metric--auto">
          <span className="sheet__label">ТЕМП{paceNote ? ` · ${paceNote.toUpperCase()}` : ''}</span>
          <output className="metric__value" aria-label="Темп">{shownPace !== undefined ? formatPaceLabel(shownPace) : '–'}</output>
        </div>
        <label className="metric">
          <span className="sheet__label">ПУЛЬС СРЕДНИЙ</span>
          <NumberField className="metric__input" label="Пульс" value={block.avgHr} integer min={30} max={250} inputMode="numeric" onCommit={(v) => patch({ avgHr: v })} />
        </label>
        <label className="metric">
          <span className="sheet__label">ТЕМП С ЧАСОВ, /КМ</span>
          <DurationField className="metric__input" label="Темп с часов" value={block.recordedPace} min={1} onCommit={(v) => patch({ recordedPace: v })} />
        </label>
        {block.modality === 'stairs' ? (
          <label className="metric">
            <span className="sheet__label">ЭТАЖИ</span>
            <NumberField className="metric__input" label="Этажи" value={block.floors} integer min={0} inputMode="numeric" onCommit={(v) => patch({ floors: v })} />
          </label>
        ) : null}
        {block.modality === 'treadmill' ? (
          <label className="metric">
            <span className="sheet__label">НАКЛОН, %</span>
            <NumberField className="metric__input" label="Наклон" value={block.inclinePct} min={0} max={40} onCommit={(v) => patch({ inclinePct: v })} />
          </label>
        ) : null}
      </div>
      {paceDiffers ? (
        <p className="item__hint" role="note">
          Темп с часов отличается от расчётного ({formatPaceLabel(block.paceSecPerKm!)}) больше чем на 5%. Проверьте дистанцию и время.
        </p>
      ) : null}

      <div className="field-col">
        <span className="sheet__label">RPE · НАСКОЛЬКО ТЯЖЕЛО</span>
        <RpePicker label="RPE кардио" value={block.rpe} onChange={(v) => patch({ rpe: v })} />
      </div>
      <input
        className="field"
        aria-label="Заметка к кардио"
        placeholder="Заметка: зона 2, погода…"
        defaultValue={block.notes ?? ''}
        maxLength={2000}
        onBlur={(e) => {
          const text = e.target.value.trim();
          if (text !== (block.notes ?? '')) patch({ notes: text === '' ? undefined : text });
        }}
      />
    </BlockShell>
  );
}
