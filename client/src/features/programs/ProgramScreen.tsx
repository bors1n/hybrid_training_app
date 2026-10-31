import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { createTemplate } from '../../data/templateService.ts';
import { attempts, bestAttempt } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { FORMAT_SHORT, shortResult } from '../../domain/planFormat.ts';
import { activeProgram } from '../../domain/programs.ts';
import { complexQueueState, queueState } from '../../domain/queue.ts';
import { templateSummary } from '../../domain/templateEdit.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { startFreeWorkout } from '../workout/startWorkout.ts';
import { useSessions } from '../workout/useSessions.ts';
import { AddComplexSheet } from './AddComplexSheet.tsx';
import { ComplexSheet } from './ComplexSheet.tsx';
import { ProgramSheet } from './ProgramSheet.tsx';
import { QueueSheet } from './QueueSheet.tsx';
import { TemplateSheet } from './TemplateSheet.tsx';
import { useComplexes, useComplexQueues, usePrograms, useQueues, useSettings, useTemplates } from './useProgramData.ts';

type Sheet = { kind: 'template'; id: string } | { kind: 'queue' } | { kind: 'complex'; id: string } | { kind: 'addComplex' } | { kind: 'program' } | null;

/** Одна программа: очередь шаблонов, комплексы и тренировка вне очереди. */
export function ProgramScreen(): ReactElement {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const programs = usePrograms();
  const settings = useSettings();
  const templates = useTemplates();
  const queues = useQueues();
  const complexes = useComplexes();
  const cqs = useComplexQueues();
  const sessions = useSessions();
  const catalogList = useCatalog();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [sheet, setSheet] = useState<Sheet>(null);

  const program = programs?.find((p) => p.id === id);
  const queue = queues?.find((q) => q.id === program?.queueId);
  const cq = cqs?.find((c) => c.id === program?.complexQueueId);
  const isActive = Boolean(programs && program && activeProgram(programs, settings)?.id === program.id);

  const state = useMemo(() => (queue && sessions ? queueState(queue, sessions) : null), [queue, sessions]);
  const cqState = useMemo(() => (cq && sessions ? complexQueueState(cq, sessions) : null), [cq, sessions]);
  const byId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  const complexById = useMemo(() => new Map((complexes ?? []).map((c) => [c.id, c])), [complexes]);
  // Шаблон «вне очереди» — тот, что не стоит ни в одной программе.
  const placed = useMemo(() => new Set((queues ?? []).flatMap((q) => q.templateIds)), [queues]);
  const outside = (templates ?? []).filter((t) => !placed.has(t.id));
  const today = todayKey();

  const programComplexes = (cq?.order ?? []).flatMap((cid) => {
    const c = complexById.get(cid);
    return c ? [c] : [];
  });
  const stats = useMemo(
    () =>
      new Map(
        programComplexes.map((c) => {
          const list = attempts(c.id, sessions ?? []);
          return [c.id, { count: list.length, best: bestAttempt(list) }] as const;
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cq, complexes, sessions],
  );

  async function newTemplate(): Promise<void> {
    const tid = await createTemplate();
    navigate(`/template/${tid}`);
  }

  async function startFree(): Promise<void> {
    navigate(`/workout/${await startFreeWorkout()}`);
  }

  if (programs === undefined) return <div aria-busy="true" />;
  if (!program) {
    return (
      <>
        <ScreenHead title="Программа" />
        <p className="stub">Программа не найдена: возможно, она удалена.</p>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => navigate('/programs', { replace: true })}>К программам</button>
      </>
    );
  }

  const openTemplate = sheet?.kind === 'template' ? byId.get(sheet.id) : undefined;
  const openComplex = sheet?.kind === 'complex' ? complexById.get(sheet.id) : undefined;

  return (
    <>
      <button type="button" className="back-link" onClick={() => navigate('/programs')}>← Программы</button>
      <ScreenHead label={state ? `Цикл ${state.cycle}` : undefined} title={program.title} />
      <div className="prog-meta">
        {isActive ? <span className="prog-card__badge">Активная</span> : null}
        {program.description ? <p className="prog-card__desc">{program.description}</p> : null}
        <button type="button" className="track__edit" onClick={() => setSheet({ kind: 'program' })}>О программе</button>
      </div>

      <section className="track" aria-label="Очередь тренировок">
        <div className="track__head">
          <span className="track__label">Очередь · по кругу</span>
          <button type="button" className="track__edit" onClick={() => setSheet({ kind: 'queue' })}>Изменить</button>
        </div>
        {queue && queue.templateIds.length > 0 ? (
          <ol className="track__lanes">
            {queue.templateIds.map((tid, i) => {
              const t = byId.get(tid);
              const isNext = state?.position === i;
              const done = state?.doneInCycle[i];
              return (
                <li key={tid}>
                  <button type="button" className="lane" disabled={!t} onClick={() => setSheet({ kind: 'template', id: tid })}>
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
        ) : (
          <p className="stub">В очереди пока нет тренировок. Создайте шаблон кнопкой «+ Шаблон» и добавьте его через «Изменить».</p>
        )}
      </section>

      <div className="two plan-actions">
        <button type="button" className="htr-btn htr-btn--primary" onClick={() => void newTemplate()}>+ Шаблон</button>
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
          <span className="sheet__label">{programComplexes.length}</span>
        </div>
        {programComplexes.length === 0 ? <p className="stub">В программе пока нет комплексов. Добавьте из библиотеки или создайте свой.</p> : null}
        <div className="cx-grid">
          {programComplexes.map((c) => {
            const s = stats.get(c.id)!;
            const isNext = cqState?.complexId === c.id;
            const status = isNext ? 'следующий' : s.best ? shortResult(s.best.block.format, s.best.block.result) : s.count === 0 ? 'не делал' : FORMAT_SHORT[c.format];
            const code = c.id.startsWith('#') ? c.id : c.title;
            return (
              <button
                key={c.id}
                type="button"
                className={`cx-tile${s.best ? ' has-record' : ''}${isNext ? ' is-next' : ''}${s.count === 0 && !isNext ? ' is-new' : ''}`}
                aria-label={`${code}: ${isNext ? 'следующий' : s.best ? 'рекорд ' + shortResult(s.best.block.format, s.best.block.result) : 'не делал'}`}
                onClick={() => setSheet({ kind: 'complex', id: c.id })}
              >
                <span className="cx-tile__code">{code}</span>
                <span className="cx-tile__sub">{status}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setSheet({ kind: 'addComplex' })}>+ Комплекс</button>
      </section>

      <button type="button" className="free-card" onClick={() => void startFree()}>
        <span className="free-card__title">Тренировка вне очереди</span>
        <span className="free-card__sub">Разовая тренировка не из очереди: соберите блоки на ходу. Очередь не сдвинется.</span>
      </button>

      {sheet?.kind === 'queue' && queue ? (
        <QueueSheet queue={queue} templates={templates ?? []} position={state?.position ?? 0} onClose={() => setSheet(null)} />
      ) : null}
      {openTemplate ? (
        <TemplateSheet template={openTemplate} catalog={catalog} inQueue={Boolean(queue?.templateIds.includes(openTemplate.id))} queueId={queue?.id} onClose={() => setSheet(null)} />
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
      {sheet?.kind === 'addComplex' && cq ? (
        <AddComplexSheet complexQueueId={cq.id} library={complexes ?? []} inProgram={new Set(cq.order)} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'program' ? (
        <ProgramSheet program={program} isActive={isActive} onClose={() => setSheet(null)} onDeleted={() => navigate('/programs', { replace: true })} />
      ) : null}
    </>
  );
}
