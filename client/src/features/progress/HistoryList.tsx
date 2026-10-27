import { SESSION_TYPES, type SessionType } from '@splav/shared';
import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Chip } from '../../components/Chip.tsx';
import { SessionRow } from '../../components/SessionRow.tsx';
import { filterSessions, sortSessions } from '../../domain/history.ts';
import { SESSION_TYPE_LABELS, sessionTypeColorVar } from '../../domain/sessionType.ts';
import { startFreeWorkout } from '../workout/startWorkout.ts';
import { useSessions } from '../workout/useSessions.ts';

const PAGE = 30;

/**
 * История тренировок: поиск, фильтр по типу, открытие для правки и удаления.
 * Отдельного экрана истории нет — список живёт под графиками вкладки «Прогресс».
 */
export function HistoryList(): ReactElement {
  const navigate = useNavigate();
  const sessions = useSessions();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SessionType | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => filterSessions(sortSessions(sessions ?? []), { query, type }), [sessions, query, type]);

  async function addPast(): Promise<void> {
    const id = await startFreeWorkout();
    navigate(`/workout/${id}`);
  }

  return (
    <section aria-label="История">
      <div className="history__head">
        <h2 className="history__title">История</h2>
        <button type="button" className="pill-btn" onClick={() => void addPast()}>+ Внести тренировку</button>
      </div>

      <label className="search history__search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          type="search"
          aria-label="Поиск по истории"
          placeholder="Название, заметка или дата 20.10.2026"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
      </label>

      <div className="chips" role="group" aria-label="Тип тренировки">
        <Chip on={type === null} onClick={() => setType(null)}>Все</Chip>
        {SESSION_TYPES.map((t) => (
          <Chip key={t} on={type === t} onClick={() => { setType(type === t ? null : t); setLimit(PAGE); }}>
            <span className="dot" style={{ background: sessionTypeColorVar(t) }} />
            {SESSION_TYPE_LABELS[t]}
          </Chip>
        ))}
      </div>

      {sessions === undefined ? null : shown.length === 0 ? (
        <p className="stub">{sessions.length === 0 ? 'Тренировок пока нет. Внесите первую — можно и задним числом.' : 'Ничего не найдено.'}</p>
      ) : (
        <ul className="ex-list">
          {shown.slice(0, limit).map((s) => (
            <li key={s.id}>
              <SessionRow session={s} onOpen={() => navigate(`/workout/${s.id}`)} />
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit ? (
        <button type="button" className="htr-btn htr-btn--secondary lib-more" onClick={() => setLimit((n) => n + PAGE)}>
          Показать ещё {Math.min(PAGE, shown.length - limit)}
        </button>
      ) : null}
    </section>
  );
}
