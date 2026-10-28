import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ConfirmButton, NumberField, RpeSlider } from '../../components/fields.tsx';
import { todayKey } from '../../domain/history.ts';
import {
  dropPendingSets,
  finishSession,
  isFinished,
  markPendingDone,
  reopenSession,
  updateSession,
} from '../../domain/sessionEdit.ts';
import { SESSION_TYPE_LABELS, sessionTypeColorVar } from '../../domain/sessionType.ts';
import { countPendingSets, sessionDurationMin, summarize } from '../../domain/summary.ts';
import { queueState } from '../../domain/queue.ts';
import { dropEmptyBlocks } from '../../domain/templateSession.ts';
import { formatDecimal, formatDuration } from '../../domain/units.ts';
import { deleteRecord } from '../../sync/records.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { useQueues } from '../plan/usePlanData.ts';
import { AddBlockSheet } from './AddBlockSheet.tsx';
import { CardioCard } from './CardioCard.tsx';
import { ConditioningCard } from './ConditioningCard.tsx';
import type { WorkoutCtx } from './ctx.ts';
import { MobilityCard } from './MobilityCard.tsx';
import { StrengthCard } from './StrengthCard.tsx';
import { useSessionDraft } from './useSessionDraft.ts';
import { useSessions } from './useSessions.ts';

/** Часы тренировки: сколько прошло с начала. Не таймер отдыха — только отсчёт для длительности. */
function Clock({ startedAt }: { startedAt: number }): ReactElement {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="wk-clock" aria-label="Время с начала тренировки">{formatDuration(Math.max(0, (now - startedAt) / 1000))}</span>;
}

type Asking = null | 'pending' | 'empty';

/** Полноэкранная тренировка поверх вкладок. Любую тренировку можно внести без шаблона и задним числом. */
export function WorkoutScreen(): ReactElement {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { draft, status, update, flush, saveError } = useSessionDraft(id);
  const sessions = useSessions();
  const queues = useQueues();
  const catalogList = useCatalog();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);

  const leave = async (): Promise<void> => {
    await flush();
    if (location.key === 'default') navigate('/', { replace: true });
    else navigate(-1);
  };

  if (status === 'loading') return <div className="fullscreen" aria-busy="true" />;
  if (status === 'missing' || !draft) {
    return (
      <div className="fullscreen">
        <p className="stub">Тренировка не найдена: возможно, она удалена.</p>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => navigate('/', { replace: true })}>На главный экран</button>
      </div>
    );
  }

  const today = todayKey();
  const finished = isFinished(draft);
  const ctx: WorkoutCtx = { sessionId: draft.id, date: draft.date, sessions: sessions ?? [], catalog, catalogList, update, flush };
  const summary = summarize(draft);
  const autoDuration = sessionDurationMin({ startedAt: draft.startedAt, finishedAt: draft.finishedAt ?? Date.now() });
  // Номер цикла показываем, пока тренировка из очереди идёт: у завершённой он уже мог смениться.
  const queue = draft.queueId && !finished ? queues?.find((q) => q.id === draft.queueId) : undefined;
  const cycle = queue ? queueState(queue, (sessions ?? []).filter((s) => s.id !== draft.id))?.cycle : undefined;
  const showClock = !finished && draft.startedAt !== undefined && draft.date === today;

  async function complete(mode: 'keep' | 'mark' | 'drop'): Promise<void> {
    // Заготовки из шаблона, в которые так ничего и не внесли (разминка, комплекс без результата), не сохраняются.
    update((s) => {
      const handled = mode === 'mark' ? markPendingDone(s) : mode === 'drop' ? dropPendingSets(s) : s;
      return finishSession(dropEmptyBlocks(handled).session, Date.now());
    });
    await flush();
    navigate('/', { replace: true });
  }

  async function removeSession(): Promise<void> {
    await flush();
    await deleteRecord('sessions', draft!.id);
    navigate('/', { replace: true });
  }

  function onFinish(): void {
    const cleaned = dropEmptyBlocks(draft!).session;
    if (cleaned.blocks.length === 0) setAsking('empty');
    else if (countPendingSets(cleaned) > 0) setAsking('pending');
    else void complete('keep');
  }

  return (
    <div className="fullscreen fullscreen--workout">
      <header className="wk-head">
        <div className="wk-head__row">
          <button type="button" className="round-btn" aria-label="Свернуть" onClick={() => void leave()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showClock ? <Clock startedAt={draft.startedAt!} /> : <span className="wk-clock wk-clock--off">{finished ? 'Завершена' : ''}</span>}
          {finished ? (
            <button type="button" className="htr-btn htr-btn--night wk-finish" onClick={() => void leave()}>Готово</button>
          ) : (
            <button type="button" className="htr-btn htr-btn--night wk-finish" onClick={onFinish}>Завершить</button>
          )}
        </div>
        <input
          className="wk-title"
          aria-label="Название тренировки"
          defaultValue={draft.title}
          maxLength={200}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v === '') e.target.value = draft.title;
            else if (v !== draft.title) update((s) => updateSession(s, { title: v }));
          }}
        />
        <div className="wk-head__row wk-head__meta">
          <label className="wk-date">
            <span className="sr-only">Дата тренировки</span>
            <input
              type="date"
              aria-label="Дата тренировки"
              value={draft.date}
              max={today}
              onChange={(e) => {
                if (e.target.value) update((s) => updateSession(s, { date: e.target.value }));
              }}
            />
          </label>
          <span className="wk-meta">
            <span className="dot" style={{ background: sessionTypeColorVar(draft.type) }} />
            {cycle !== undefined ? `Цикл ${cycle} · ` : ''}{SESSION_TYPE_LABELS[draft.type]} · {summary.doneSets}/{summary.totalSets} подходов · {draft.blocks.length} {draft.blocks.length === 1 ? 'блок' : 'блока'}
          </span>
        </div>
      </header>

      <div className="wk-body">
        {saveError ? <p className="login__error sheet__error" role="alert">Не удалось сохранить: {saveError}</p> : null}

        {draft.blocks.length === 0 ? (
          <p className="stub wk-empty">Пока пусто. Добавьте блок: силовое упражнение, кардио, комплекс или мобильность. Тренировку можно внести задним числом — выберите дату выше.</p>
        ) : null}

        {draft.blocks.map((b, i) => {
          const props = { index: i, count: draft.blocks.length, ctx };
          if (b.type === 'strength') return <StrengthCard key={b.id} block={b} {...props} />;
          if (b.type === 'cardio') return <CardioCard key={b.id} block={b} {...props} />;
          if (b.type === 'conditioning') return <ConditioningCard key={b.id} block={b} {...props} />;
          return <MobilityCard key={b.id} block={b} {...props} />;
        })}

        <button type="button" className="add-block" onClick={() => setAdding(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Добавить блок
        </button>

        <section className="block summary" aria-label="Итог тренировки">
          <h2 className="summary__title">Итог тренировки</h2>
          <div className="grid3">
            <label className="metric">
              <span className="sheet__label">ВРЕМЯ, МИН</span>
              <NumberField
                className="metric__input"
                label="Время тренировки, мин"
                value={draft.durationMin}
                integer
                min={0}
                max={1440}
                inputMode="numeric"
                placeholder={autoDuration !== null ? String(autoDuration) : '–'}
                onCommit={(v) => update((s) => updateSession(s, { durationMin: v }))}
              />
            </label>
            <div className="metric metric--auto">
              <span className="sheet__label">ТОННАЖ, КГ</span>
              <output className="metric__value" aria-label="Тоннаж">{summary.tonnageKg > 0 ? formatDecimal(summary.tonnageKg, 1) : '–'}</output>
            </div>
            <div className="metric metric--auto">
              <span className="sheet__label">КМ</span>
              <output className="metric__value" aria-label="Километры">{summary.distanceM > 0 ? formatDecimal(summary.distanceM / 1000, 2) : '–'}</output>
            </div>
          </div>

          <div className="field-col">
            <span className="sheet__label">RPE ВСЕЙ ТРЕНИРОВКИ</span>
            <RpeSlider label="RPE тренировки" value={draft.rpe} onChange={(v) => update((s) => updateSession(s, { rpe: v }))} />
          </div>

          <label className="field-col">
            <span className="sheet__label">ЗАМЕТКА</span>
            <textarea
              className="ex-note"
              aria-label="Заметка к тренировке"
              rows={2}
              maxLength={2000}
              defaultValue={draft.notes ?? ''}
              placeholder="Как спал, что болело, что получилось…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (draft.notes ?? '')) update((s) => updateSession(s, { notes: v === '' ? undefined : v }));
              }}
            />
          </label>

          {finished ? (
            <div className="summary__actions">
              <button type="button" className="htr-btn htr-btn--secondary" onClick={() => update(reopenSession)}>Продолжить тренировку</button>
              <ConfirmButton label="Удалить тренировку" confirmLabel="Удалить насовсем?" onConfirm={() => void removeSession()} className="htr-btn htr-btn--ghost" />
            </div>
          ) : (
            <button type="button" className="htr-btn htr-btn--primary" onClick={onFinish}>Завершить тренировку</button>
          )}
        </section>
      </div>

      {adding ? <AddBlockSheet ctx={ctx} onClose={() => setAdding(false)} /> : null}

      {asking === 'pending' ? (
        <>
          <div className="sheet-backdrop" onClick={() => setAsking(null)} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Невыполненные подходы">
            <h2 className="sheet__title">Есть неотмеченные подходы</h2>
            <p className="stub">
              {countPendingSets(draft)} подходов не отмечены выполненными (например, копии прошлого результата). В итоги и прогресс попадают только выполненные.
            </p>
            <button type="button" className="htr-btn htr-btn--primary" onClick={() => void complete('mark')}>Отметить выполненными</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => void complete('drop')}>Убрать эти подходы</button>
            <button type="button" className="htr-btn htr-btn--ghost" onClick={() => setAsking(null)}>Назад к тренировке</button>
          </section>
        </>
      ) : null}

      {asking === 'empty' ? (
        <>
          <div className="sheet-backdrop" onClick={() => setAsking(null)} />
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Пустая тренировка">
            <h2 className="sheet__title">Тренировка пустая</h2>
            <p className="stub">В ней нет ни одного блока. Пустые тренировки не сохраняются.</p>
            <button type="button" className="htr-btn htr-btn--danger" onClick={() => void removeSession()}>Удалить</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setAsking(null)}>Назад к тренировке</button>
          </section>
        </>
      ) : null}
    </div>
  );
}
