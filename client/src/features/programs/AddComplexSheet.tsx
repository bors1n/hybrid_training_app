import { FORMATS, type ComplexRecord } from '@hybridlog/shared';
import { useState, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { NumberField } from '../../components/fields.tsx';
import { addComplexToProgram, createOwnComplex } from '../../data/programService.ts';
import { FORMAT_SHORT } from '../../domain/planFormat.ts';
import { FORMAT_LABELS } from '../workout/ConditioningCard.tsx';

interface Props {
  complexQueueId: string;
  library: readonly ComplexRecord[];
  /** Уже лежат в программе. */
  inProgram: ReadonlySet<string>;
  onClose: () => void;
}

/** «+ Комплекс»: выбрать из библиотеки или создать свой. */
const PAGE = 40;

export function AddComplexSheet({ complexQueueId, library, inProgram, onClose }: Props): ReactElement {
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ComplexRecord['format']>('FOR_TIME');
  const [cap, setCap] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const available = library.filter((c) => !inProgram.has(c.id) && (q === '' || `${c.id} ${c.title}`.toLowerCase().includes(q)));

  async function add(id: string): Promise<void> {
    await addComplexToProgram(complexQueueId, id);
  }

  async function create(): Promise<void> {
    if (title.trim() === '') return setError('Введите название');
    try {
      await createOwnComplex({ title, format, description, ...(cap !== undefined ? { timeCapMin: cap } : {}) }, complexQueueId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Добавить комплекс">
        <h2 className="sheet__title">Добавить комплекс</h2>
        <div className="chips" role="group" aria-label="Способ">
          <Chip on={mode === 'pick'} onClick={() => setMode('pick')}>Из библиотеки</Chip>
          <Chip on={mode === 'new'} onClick={() => setMode('new')}>Создать свой</Chip>
        </div>

        {mode === 'pick' ? (
          <>
            <input className="field" type="search" aria-label="Поиск комплекса" placeholder="Название или номер" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
            {available.length === 0 ? <p className="stub">{q ? 'Ничего не найдено.' : 'Все комплексы библиотеки уже в программе.'}</p> : null}
            <ul className="ex-list">
              {available.slice(0, limit).map((c) => (
                <li key={c.id}>
                  <button type="button" className="session-row" aria-label={`Добавить ${c.id} ${c.title}`} onClick={() => void add(c.id)}>
                    <span className="session-row__text">
                      <span className="session-row__title">{c.id.startsWith('#') ? `${c.id} · ${c.title}` : c.title}</span>
                      <span className="session-row__sub">{FORMAT_SHORT[c.format]}{c.timeCapMin !== undefined ? ` · ${c.timeCapMin} мин` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {available.length > limit ? (
              <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setLimit((n) => n + PAGE)}>Показать ещё {Math.min(PAGE, available.length - limit)}</button>
            ) : null}
          </>
        ) : (
          <>
            <label className="field-col">
              <span className="sheet__label">НАЗВАНИЕ</span>
              <input className="field" aria-label="Название комплекса" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </label>
            <div className="two">
              <label className="field-col">
                <span className="sheet__label">ФОРМАТ</span>
                <select aria-label="Формат комплекса" value={format} onChange={(e) => setFormat(e.target.value as ComplexRecord['format'])}>
                  {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
                </select>
              </label>
              <label className="field-col">
                <span className="sheet__label">ЛИМИТ, МИН</span>
                <NumberField className="field" label="Лимит времени, мин" value={cap} min={0} max={600} onCommit={setCap} />
              </label>
            </div>
            <label className="field-col">
              <span className="sheet__label">СОСТАВ</span>
              <textarea className="ex-note" aria-label="Состав комплекса" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
            </label>
            {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}
            <button type="button" className="htr-btn htr-btn--primary" onClick={() => void create()}>Создать и добавить</button>
          </>
        )}
        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Готово</button>
      </section>
    </>
  );
}
