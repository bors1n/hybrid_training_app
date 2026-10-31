import { FORMATS, type ConditioningBlock } from '@hybridlog/shared';
import { useMemo, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DurationField, NumberField, RpePicker } from '../../components/fields.tsx';
import { attempts, bestAttempt, formatResult, isTimeFormat } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { updateConditioning } from '../../domain/sessionEdit.ts';
import { FORMAT_LABELS } from './ConditioningCard.tsx';
import { useSessionDraft } from './useSessionDraft.ts';
import { useSessions } from './useSessions.ts';

type Patch = Parameters<typeof updateConditioning>[2];

const FORMAT_HINTS: Record<ConditioningBlock['format'], string> = {
  AMRAP: 'Максимум раундов за отведённое время',
  EMOM: 'Каждую минуту — задание, остаток минуты отдых',
  FOR_TIME: 'Выполнить задание как можно быстрее',
  TABATA: 'Интервалы работы и отдыха',
  INTERVALS: 'Работа и отдых интервалами',
  LADDER: 'Лесенка: число повторов растёт или убывает',
  ROUNDS: 'Заданное число раундов на время',
  OTHER: 'Свой формат',
};

/** Состав комплекса — по строкам или по стрелкам «→»: каждая часть отдельной строкой. */
function movements(description: string | undefined): string[] {
  if (!description) return [];
  return description.split(/\n|\s*→\s*/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Полноэкранный комплекс по макету WorkoutComplex: название, состав и белая панель результата.
 * Таймера нет — в MVP его не делаем; результат вносится вручную.
 */
export function ConditioningScreen(): ReactElement {
  const { id = '', blockId = '' } = useParams();
  const navigate = useNavigate();
  const { draft, status, update, flush, saveError } = useSessionDraft(id);
  const sessions = useSessions();
  const block = draft?.blocks.find((b): b is ConditioningBlock => b.id === blockId && b.type === 'conditioning');
  const complexId = block?.complexId;
  const history = useMemo(() => (complexId ? attempts(complexId, sessions ?? [], { excludeSessionId: id }) : []), [complexId, sessions, id]);

  const back = async (): Promise<void> => {
    await flush();
    navigate(`/workout/${id}`, { replace: true });
  };

  if (status === 'loading') return <div className="fullscreen" aria-busy="true" />;
  if (!draft || !block) {
    return (
      <div className="fullscreen">
        <p className="stub">Комплекс не найден: возможно, блок удалён.</p>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => navigate(`/workout/${id}`, { replace: true })}>К тренировке</button>
      </div>
    );
  }

  const patch = (p: Patch): void => update((s) => updateConditioning(s, block.id, p));
  const r = block.result;
  const timed = isTimeFormat(block.format);
  const index = draft.blocks.findIndex((b) => b.id === block.id);
  const best = bestAttempt(history);
  const last = history[0];
  const title = block.name ?? (block.complexId ? `Комплекс ${block.complexId}` : 'Комплекс');
  const parts = movements(block.description);

  return (
    <div className="fullscreen cxs">
      <svg className="cxs__track" width="390" height="300" viewBox="0 0 390 300" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <g stroke="#2A3140" strokeWidth="2"><path d="M0 100 H390" /><path d="M0 200 H390" /><path d="M0 300 H390" /></g>
        <rect x="352" y="0" width="5" height="300" fill="#2A3140" />
      </svg>

      <div className="cxs__body">
        <div className="cxs__bar">
          <button type="button" className="round-btn" aria-label="Назад к тренировке" onClick={() => void back()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span className="cxs__crumb">Блок {index + 1} · {draft.title}</span>
          <span className="cxs__spacer" />
        </div>

        {saveError ? <p className="login__error sheet__error" role="alert">Не удалось сохранить: {saveError}</p> : null}

        <div className="cxs__head">
          <span className="cxs__kind"><span className="dot" style={{ background: 'var(--conditioning)' }} />{block.complexId ? `Комплекс ${block.complexId}` : 'Свой комплекс'}</span>
          <input
            className="cxs__title"
            aria-label="Название комплекса"
            defaultValue={title}
            maxLength={200}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== '' && v !== title) patch({ name: v });
            }}
          />
          <span className="cxs__sub">{FORMAT_HINTS[block.format]}{block.timeCapMin ? ` · ${block.timeCapMin} мин` : ''}</span>
        </div>

        {parts.length > 0 ? (
          <ul className="cxs__moves" aria-label="Состав">
            {parts.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        ) : null}

        <details className="cxs__params">
          <summary>Параметры комплекса</summary>
          <div className="two">
            <label className="field-col">
              <span className="sheet__label cx__label">Формат</span>
              <select aria-label="Формат комплекса" value={block.format} onChange={(e) => patch({ format: e.target.value as ConditioningBlock['format'] })}>
                {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
              </select>
            </label>
            <label className="field-col">
              <span className="sheet__label cx__label">Лимит, мин</span>
              <NumberField className="field" label="Лимит времени, мин" value={block.timeCapMin} min={0} max={600} onCommit={(v) => patch({ timeCapMin: v })} />
            </label>
          </div>
        </details>

        <section className="cxs__result" aria-label="Результат">
          <div className="cxs__result-head">
            <span className="sheet__label">Результат</span>
            <span className="cxs__record">
              {best ? `Рекорд ${formatResult(best.block.format, best.block.result)}` : block.complexId ? 'Раньше не выполнялся' : ''}
              {last && best && last !== best ? ` · прошлый раз ${formatDateShort(last.date, todayKey())}: ${formatResult(last.block.format, last.block.result)}` : ''}
            </span>
          </div>

          {timed ? (
            <div className="two">
              <label className="field-col">
                <span className="cx__small">Время</span>
                <DurationField className="field" label="Время результата" value={r.timeSec} onCommit={(v) => patch({ result: { timeSec: v } })} />
              </label>
              <label className="check cx__check">
                <input type="checkbox" checked={r.finished === false} onChange={(e) => patch({ result: { finished: e.target.checked ? false : undefined } })} />
                Не уложился
              </label>
            </div>
          ) : null}

          {!timed || r.finished === false ? (
            <div className="two">
              <div className="field-col cxs__rounds">
                <span className="cx__small">Раунды</span>
                <div className="stepper">
                  <button type="button" className="step" aria-label="Минус раунд" disabled={!r.rounds} onClick={() => patch({ result: { rounds: r.rounds && r.rounds > 1 ? r.rounds - 1 : undefined } })}>−</button>
                  <NumberField className="stepper__value" label="Раунды" value={r.rounds} integer min={0} max={1000} inputMode="numeric" placeholder="0" onCommit={(v) => patch({ result: { rounds: v } })} />
                  <button type="button" className="step step--plus" aria-label="Плюс раунд" onClick={() => patch({ result: { rounds: (r.rounds ?? 0) + 1 } })}>+</button>
                </div>
              </div>
              <label className="field-col cxs__rounds">
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
        </section>

        <div className="cxs__actions">
          <button type="button" className="htr-btn htr-btn--night cxs__save" onClick={() => void back()}>Записать результат</button>
        </div>
      </div>
    </div>
  );
}
