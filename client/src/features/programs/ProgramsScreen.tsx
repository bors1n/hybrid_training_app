import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import { createProgram } from '../../data/programService.ts';
import { activeProgram, programSummary } from '../../domain/programs.ts';
import { plural } from '../../domain/complexResults.ts';
import { useComplexQueues, usePrograms, useQueues, useSettings } from './useProgramData.ts';

/** Список программ: выбрать, открыть или создать свою. Активная программа определяет очередь на «Сегодня». */
export function ProgramsScreen(): ReactElement {
  const navigate = useNavigate();
  const programs = usePrograms();
  const settings = useSettings();
  const queues = useQueues();
  const cqs = useComplexQueues();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const active = useMemo(() => (programs ? activeProgram(programs, settings) : null), [programs, settings]);

  async function create(): Promise<void> {
    const id = await createProgram(title);
    setCreating(false);
    setTitle('');
    navigate(`/programs/${id}`);
  }

  return (
    <>
      <ScreenHead title="Программы тренировок" />

      {programs && programs.length === 0 ? <p className="stub">Программы появятся после первой синхронизации. Свою можно создать уже сейчас.</p> : null}

      <ul className="prog-list" aria-label="Программы">
        {(programs ?? []).map((p) => {
          const s = programSummary(queues?.find((q) => q.id === p.queueId), cqs?.find((c) => c.id === p.complexQueueId));
          const isActive = active?.id === p.id;
          return (
            <li key={p.id}>
              <button type="button" className={`prog-card${isActive ? ' is-active' : ''}`} onClick={() => navigate(`/programs/${p.id}`)}>
                <span className="prog-card__head">
                  <span className="prog-card__title">{p.title}</span>
                  {isActive ? <span className="prog-card__badge">Активная</span> : null}
                </span>
                {p.description ? <span className="prog-card__desc">{p.description}</span> : null}
                <span className="prog-card__sub">
                  {s.templates} {plural(s.templates, 'тренировка', 'тренировки', 'тренировок')} · {s.complexes} {plural(s.complexes, 'комплекс', 'комплекса', 'комплексов')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <form className="prog-new" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label className="field-col">
            <span className="sheet__label">НАЗВАНИЕ ПРОГРАММЫ</span>
            <input className="field" aria-label="Название программы" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
          </label>
          <div className="two">
            <button type="submit" className="htr-btn htr-btn--primary">Создать</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => { setCreating(false); setTitle(''); }}>Отмена</button>
          </div>
        </form>
      ) : (
        <button type="button" className="htr-btn htr-btn--primary" onClick={() => setCreating(true)}>+ Создать программу</button>
      )}
    </>
  );
}
