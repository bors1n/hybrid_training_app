import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmButton } from '../../components/fields.tsx';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { createTemplate } from '../../data/templateService.ts';
import { attempts, bestAttempt } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { FORMAT_SHORT, shortResult } from '../../domain/planFormat.ts';
import { complexQueueState, queueState } from '../../domain/queue.ts';
import { queueNewCycle } from '../../domain/queueEdit.ts';
import { templateSummary } from '../../domain/templateEdit.ts';
import { saveRecord } from '../../sync/records.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { startFreeWorkout } from '../workout/startWorkout.ts';
import { useSessions } from '../workout/useSessions.ts';
import { ComplexSheet } from './ComplexSheet.tsx';
import { QueueSheet } from './QueueSheet.tsx';
import { TemplateSheet } from './TemplateSheet.tsx';
import { useComplexes, useComplexQueue, useQueues, useTemplates } from './usePlanData.ts';

type Sheet = { kind: 'template'; id: string } | { kind: 'queue' } | { kind: 'complex'; id: string } | null;

export function PlanScreen(): ReactElement {
  const navigate = useNavigate();
  const templates = useTemplates();
  const queues = useQueues();
  const complexes = useComplexes();
  const cq = useComplexQueue();
  const sessions = useSessions();
  const catalogList = useCatalog();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [sheet, setSheet] = useState<Sheet>(null);

  // В интерфейсе одна очередь (в данных их может быть несколько).
  const queue = queues?.[0];
  const state = useMemo(() => (queue && sessions ? queueState(queue, sessions) : null), [queue, sessions]);
  const cqState = useMemo(() => (cq && sessions ? complexQueueState(cq, sessions) : null), [cq, sessions]);
  const byId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  const outside = (templates ?? []).filter((t) => !queue?.templateIds.includes(t.id));
  const today = todayKey();

  const stats = useMemo(
    () =>
      new Map(
        (complexes ?? []).map((c) => {
          const list = attempts(c.id, sessions ?? []);
          return [c.id, { count: list.length, best: bestAttempt(list) }] as const;
        }),
      ),
    [complexes, sessions],
  );

  async function newTemplate(): Promise<void> {
    const id = await createTemplate();
    navigate(`/template/${id}`);
  }

  async function startFree(): Promise<void> {
    navigate(`/workout/${await startFreeWorkout()}`);
  }

  const openTemplate = sheet?.kind === 'template' ? byId.get(sheet.id) : undefined;
  const openComplex = sheet?.kind === 'complex' ? complexes?.find((c) => c.id === sheet.id) : undefined;

  return (
    <>
      <ScreenHead label={state ? `ЦИКЛ ${state.cycle}` : undefined} title="План" />

      {queue ? (
        <section className="track" aria-label="Очередь тренировок">
          <div className="track__head">
            <span className="track__label">ОЧЕРЕДЬ · ПО КРУГУ</span>
            <button type="button" className="track__edit" onClick={() => setSheet({ kind: 'queue' })}>ИЗМЕНИТЬ</button>
          </div>
          <ol className="track__lanes">
            {queue.templateIds.map((id, i) => {
              const t = byId.get(id);
              const isNext = state?.position === i;
              const done = state?.doneInCycle[i];
              return (
                <li key={id}>
                  <button type="button" className="lane" disabled={!t} onClick={() => setSheet({ kind: 'template', id })}>
                    <span className={`lane__num${isNext ? ' is-next' : ''}`}>{i + 1}</span>
                    <span className="lane__text">
                      <span className="lane__title">{t?.title ?? 'Шаблон удалён'}</span>
                      <span className="lane__sub">{t ? [t.subtitle, templateSummary(t)].filter(Boolean).join(' · ') : 'Откройте «Изменить», чтобы убрать его из очереди'}</span>
                    </span>
                    {isNext ? <span className="lane__badge">Следующая</span> : done ? <span className="lane__date">{formatDateShort(done, today)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <p className="stub">{queues === undefined ? '' : 'Шаблоны и очередь появятся после первой синхронизации. Свободную тренировку можно вносить уже сейчас.'}</p>
      )}

      <div className="two plan-actions">
        <button type="button" className="htr-btn htr-btn--primary" onClick={() => void newTemplate()}>+ Шаблон</button>
        {queue ? (
          <ConfirmButton
            label="Новый цикл"
            confirmLabel="Начать с первой?"
            className="htr-btn htr-btn--secondary"
            onConfirm={() => {
              const { updatedAt: _u, deletedAt: _d, ...draft } = queue;
              void saveRecord('queues', queueNewCycle(draft, Date.now()));
            }}
          />
        ) : null}
      </div>

      {outside.length > 0 ? (
        <section className="plan-section" aria-label="Шаблоны вне очереди">
          <div className="plan-section__head"><span className="plan-section__title">Шаблоны вне очереди</span><span className="sheet__label">{outside.length}</span></div>
          <ul className="ex-list">
            {outside.map((t) => (
              <li key={t.id}>
                <button type="button" className="session-row" onClick={() => setSheet({ kind: 'template', id: t.id })}>
                  <span className="session-row__text">
                    <span className="session-row__title">{t.title}</span>
                    <span className="session-row__sub">{[t.subtitle, templateSummary(t)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="plan-section" aria-label="Комплексы">
        <div className="plan-section__head">
          <span className="plan-section__title"><span className="dot" style={{ background: 'var(--conditioning)' }} />Комплексы</span>
          <span className="sheet__label">{complexes?.length ?? 0} · ВСЕ</span>
        </div>
        <div className="cx-grid">
          {(complexes ?? []).map((c) => {
            const s = stats.get(c.id)!;
            const isNext = cqState?.complexId === c.id;
            const status = isNext ? 'следующий' : s.best ? shortResult(s.best.block.format, s.best.block.result) : s.count === 0 ? 'не делал' : FORMAT_SHORT[c.format];
            return (
              <button
                key={c.id}
                type="button"
                className={`cx-tile${s.best ? ' has-record' : ''}${isNext ? ' is-next' : ''}${s.count === 0 && !isNext ? ' is-new' : ''}`}
                aria-label={`${c.id}: ${isNext ? 'следующий' : s.best ? 'рекорд ' + shortResult(s.best.block.format, s.best.block.result) : 'не делал'}`}
                onClick={() => setSheet({ kind: 'complex', id: c.id })}
              >
                <span className="cx-tile__code">{c.id}</span>
                <span className="cx-tile__sub">{status}</span>
              </button>
            );
          })}
        </div>
      </section>

      <button type="button" className="free-card" onClick={() => void startFree()}>
        <span className="free-card__title">Свободная тренировка</span>
        <span className="free-card__sub">Без шаблона: собери блоки на ходу. Очередь не сдвинется.</span>
      </button>

      {sheet?.kind === 'queue' && queue ? (
        <QueueSheet queue={queue} templates={templates ?? []} position={state?.position ?? 0} onClose={() => setSheet(null)} />
      ) : null}
      {openTemplate ? (
        <TemplateSheet template={openTemplate} catalog={catalog} inQueue={Boolean(queue?.templateIds.includes(openTemplate.id))} onClose={() => setSheet(null)} />
      ) : null}
      {openComplex ? (
        <ComplexSheet
          complex={openComplex}
          sessions={sessions ?? []}
          queue={cq}
          queuePosition={cqState?.position ?? null}
          isNext={cqState?.complexId === openComplex.id}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
