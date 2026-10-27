import { useMemo, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { SessionRow } from '../../components/SessionRow.tsx';
import { sortSessions } from '../../domain/history.ts';
import { startFreeWorkout } from '../workout/startWorkout.ts';
import { useSessions } from '../workout/useSessions.ts';

const RECENT = 6;

/** «ВТОРНИК, 27 ОКТЯБРЯ». */
function todayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now).toUpperCase();
}

export function TodayScreen(): ReactElement {
  const navigate = useNavigate();
  const sessions = useSessions();
  const sorted = useMemo(() => sortSessions(sessions ?? []), [sessions]);
  // Незавершённая тренировка: закрыли приложение посреди занятия — её можно продолжить.
  const inProgress = sorted.find((s) => s.finishedAt === undefined);
  const recent = sorted.filter((s) => s !== inProgress).slice(0, RECENT);

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

      <button type="button" className="htr-btn htr-btn--secondary free-btn" onClick={() => void startFree()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Свободная тренировка
      </button>

      <div className="today-list">
        <span className="sheet__label">ПОСЛЕДНИЕ</span>
        {sessions !== undefined && recent.length === 0 && !inProgress ? (
          <p className="stub">Здесь появятся ваши тренировки. Начните со свободной — шаблоны и очередь Т1 → Т2 → Т3 появятся на вкладке «План».</p>
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
