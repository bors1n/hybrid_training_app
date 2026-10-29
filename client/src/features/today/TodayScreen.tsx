import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { SessionRow } from '../../components/SessionRow.tsx';
import { startTemplateWorkout } from '../../data/templateService.ts';
import { sortSessions, todayKey } from '../../domain/history.ts';
import { formatResult, lastComplexAttempt } from '../../domain/complexResults.ts';
import { lastCardioEntry } from '../../domain/lastCardio.ts';
import { formatDateShort, formatSet, lastPerformance } from '../../domain/lastPerformance.ts';
import { FORMAT_SHORT, formatPlan } from '../../domain/planFormat.ts';
import { queueState } from '../../domain/queue.ts';
import { MODALITY_LABELS } from '../../domain/sessionEdit.ts';
import { formatDecimal, formatDuration, formatKm, formatPaceLabel } from '../../domain/units.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { useQueues, useTemplates } from '../plan/usePlanData.ts';
import { startFreeWorkout } from '../workout/startWorkout.ts';
import { useSessions } from '../workout/useSessions.ts';

const RECENT = 6;
const SHOWN_EXERCISES = 3;

/** «ВТОРНИК, 27 ОКТЯБРЯ». */
function todayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now).toUpperCase();
}

export function TodayScreen(): ReactElement {
  const navigate = useNavigate();
  const sessions = useSessions();
  const templates = useTemplates();
  const queues = useQueues();
  const catalogList = useCatalog();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => sortSessions(sessions ?? []), [sessions]);
  // Незавершённая тренировка: закрыли приложение посреди занятия — её можно продолжить.
  const inProgress = sorted.find((s) => s.finishedAt === undefined);
  const recent = sorted.filter((s) => s !== inProgress).slice(0, RECENT);

  const queue = queues?.[0];
  const state = useMemo(() => (queue && sessions ? queueState(queue, sessions) : null), [queue, sessions]);
  const template = state ? templates?.find((t) => t.id === state.templateId) : undefined;
  const lastComplex = useMemo(() => (sessions ? lastComplexAttempt(sessions) : null), [sessions]);
  const lastCardio = useMemo(() => (sessions ? lastCardioEntry(sessions) : null), [sessions]);
  const today = todayKey();

  const exercises = template?.blocks.flatMap((b) => (b.type === 'strength' ? b.items : [])) ?? [];
  const shown = exercises.slice(0, SHOWN_EXERCISES).map((item) => {
    const last = lastPerformance(item.exerciseId, sessions ?? [], { onOrBefore: today });
    return { id: item.exerciseId, name: catalog.get(item.exerciseId)?.name ?? 'Упражнение удалено', value: last ? formatSet(last.sets[0]!) : formatPlan(item.plan) };
  });
  const rest = [
    exercises.length > SHOWN_EXERCISES ? `и ещё ${exercises.length - SHOWN_EXERCISES}` : null,
    template?.blocks.some((b) => b.type === 'conditioning') ? 'комплекс' : null,
    template?.blocks.some((b) => b.type === 'cardio' && b.role === 'finisher') ? 'финиш' : null,
    template?.blocks.some((b) => b.type === 'mobility') ? 'мобильность' : null,
  ].filter(Boolean).join(' · ');

  async function start(templateId: string): Promise<void> {
    setError(null);
    try {
      navigate(`/workout/${await startTemplateWorkout(templateId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать тренировку');
    }
  }

  async function startFree(): Promise<void> {
    const id = await startFreeWorkout();
    navigate(`/workout/${id}`);
  }

  return (
    <>
      <ScreenHead label={todayLabel()} title="Сегодня" />

      {inProgress ? (
        <section className="resume" aria-label="Незавершённая тренировка">
          <span className="resume__label">НЕ ЗАВЕРШЕНА</span>
          <span className="resume__title">{inProgress.title}</span>
          <button type="button" className="htr-btn htr-btn--night" onClick={() => navigate(`/workout/${inProgress.id}`)}>Продолжить</button>
        </section>
      ) : null}

      {template && state ? (
        <section className="next-card" aria-label="Следующая тренировка">
          <div className="next-card__head">
            <span className="next-card__label">СЛЕДУЮЩАЯ ПО ОЧЕРЕДИ</span>
            <span className="next-card__cycle">ЦИКЛ {state.cycle}</span>
          </div>
          <div className="next-card__title">
            <span className="next-card__name">{template.title}</span>
            {template.subtitle || template.durationHint ? <span className="next-card__sub">{[template.subtitle, template.durationHint].filter(Boolean).join(' · ')}</span> : null}
          </div>
          <ul className="next-card__list">
            {shown.map((r, i) => (
              <li key={`${r.id}:${i}`}><span>{r.name}</span><span className="mono">{r.value}</span></li>
            ))}
          </ul>
          {rest ? <p className="next-card__rest">{rest}</p> : null}
          <div className="next-card__actions">
            <button type="button" className="htr-btn htr-btn--night next-card__start" onClick={() => void start(template.id)}>Начать</button>
          </div>
        </section>
      ) : queue && state && templates !== undefined ? (
        <p className="stub">Следующий шаблон очереди удалён. Откройте вкладку «План» и поправьте очередь.</p>
      ) : null}
      {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}

      <button type="button" className="htr-btn htr-btn--secondary free-btn" onClick={() => void startFree()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Свободная тренировка
      </button>

      <div className="today-list">
        <span className="sheet__label">ПОСЛЕДНИЕ</span>
        {lastComplex || lastCardio ? (
          <div className="recent-cards">
            {lastComplex ? (
              <button type="button" className="recent-card" aria-label="Последний комплекс" onClick={() => navigate(`/workout/${lastComplex.sessionId}`)}>
                <span className="recent-card__main">
                  <span className="recent-card__label"><span className="dot" style={{ background: 'var(--conditioning)' }} />КОМПЛЕКС</span>
                  <span className="recent-card__title">{[lastComplex.block.complexId, lastComplex.block.name].filter(Boolean).join(' · ') || 'Комплекс'}</span>
                  <span className="recent-card__sub">{FORMAT_SHORT[lastComplex.block.format]}</span>
                </span>
                <span className="recent-card__value">
                  {formatResult(lastComplex.block.format, lastComplex.block.result)}
                  <small>{formatDateShort(lastComplex.date, today)}</small>
                </span>
              </button>
            ) : null}
            {lastCardio ? (
              <button type="button" className="recent-card" aria-label="Последнее кардио" onClick={() => navigate(`/workout/${lastCardio.sessionId}`)}>
                <span className="recent-card__main">
                  <span className="recent-card__label"><span className="dot" style={{ background: 'var(--cardio)' }} />КАРДИО</span>
                  <span className="recent-card__title">{lastCardio.block.name ?? MODALITY_LABELS[lastCardio.block.modality]}</span>
                  <span className="recent-card__sub">
                    {[
                      lastCardio.block.durationSec !== undefined ? formatDuration(lastCardio.block.durationSec) : null,
                      lastCardio.group === 'run' && lastCardio.paceSecPerKm !== null ? formatPaceLabel(lastCardio.paceSecPerKm) : null,
                      lastCardio.group !== 'run' && lastCardio.speedKmh !== null ? `${formatDecimal(lastCardio.speedKmh, 1)} км/ч` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="recent-card__value">
                  {lastCardio.block.distanceM !== undefined ? formatKm(lastCardio.block.distanceM) : formatDuration(lastCardio.block.durationSec ?? 0)}
                  <small>{formatDateShort(lastCardio.date, today)}</small>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
        {sessions !== undefined && recent.length === 0 && !inProgress ? (
          <p className="stub">Здесь появятся ваши тренировки. Начните с шаблона из очереди или со свободной тренировки.</p>
        ) : null}
        <ul className="ex-list">
          {recent.map((s) => (
            <li key={s.id}>
              <SessionRow session={s} onOpen={() => navigate(`/workout/${s.id}`)} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
