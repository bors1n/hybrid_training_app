import { FORMATS, type ComplexQueueRecord, type ComplexRecord, type SessionRecord } from '@hybridlog/shared';
import { useMemo, useState, type ReactElement } from 'react';
import { ConfirmButton, NumberField } from '../../components/fields.tsx';
import { complexSourceUrl, isReadOnlyComplex } from '../../domain/complexLibrary.ts';
import { addComplexToProgram, removeComplexFromProgram } from '../../data/programService.ts';
import { attempts, bestAttempt, formatResult } from '../../domain/complexResults.ts';
import { todayKey } from '../../domain/history.ts';
import { formatDateShort } from '../../domain/lastPerformance.ts';
import { FORMAT_SHORT } from '../../domain/planFormat.ts';
import { complexMakeNext, type ComplexQueueDraft } from '../../domain/queueEdit.ts';
import { saveRecord } from '../../sync/records.ts';
import { FORMAT_LABELS } from '../workout/ConditioningCard.tsx';

interface Props {
  complex: ComplexRecord;
  sessions: readonly SessionRecord[];
  queue: ComplexQueueRecord | null | undefined;
  /** Позиция следующего комплекса в очереди. */
  queuePosition: number | null;
  isNext: boolean;
  onClose: () => void;
}

const HISTORY = 6;

/** Комплекс библиотеки: состав, история результатов и рекорд, «сделать следующим», правка. */
export function ComplexSheet({ complex: c, sessions, queue, queuePosition, isNext, onClose }: Props): ReactElement {
  const history = useMemo(() => attempts(c.id, sessions), [c.id, sessions]);
  const best = bestAttempt(history);
  const today = todayKey();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [format, setFormat] = useState(c.format);
  const [cap, setCap] = useState<number | undefined>(c.timeCapMin);
  const [description, setDescription] = useState(c.description);
  const [error, setError] = useState<string | null>(null);

  async function makeNext(): Promise<void> {
    if (!queue) return;
    const { updatedAt: _u, deletedAt: _d, ...draft } = queue;
    await saveRecord('complexQueue', complexMakeNext(draft as ComplexQueueDraft, c.id, queuePosition ?? 0, Date.now()));
    onClose();
  }

  async function save(): Promise<void> {
    if (title.trim() === '') return setError('Введите название');
    try {
      const { updatedAt: _u, deletedAt: _d, ...rest } = c;
      const next = { ...rest, title: title.trim(), format, description: description.trim() };
      if (cap === undefined) delete (next as { timeCapMin?: number }).timeCapMin;
      else next.timeCapMin = cap;
      await saveRecord('complexes', next);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label={c.id.startsWith('#') ? `Комплекс ${c.id}` : `Комплекс ${c.title}`}>
        <span className="cx__code">{c.id.startsWith('#') ? `КОМПЛЕКС ${c.id}` : 'КОМПЛЕКС'}</span>

        {editing ? (
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
              <textarea className="ex-note" aria-label="Состав комплекса" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
            </label>
            {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}
            <button type="button" className="htr-btn htr-btn--primary" onClick={() => void save()}>Сохранить</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => { setEditing(false); setTitle(c.title); setFormat(c.format); setCap(c.timeCapMin); setDescription(c.description); setError(null); }}>Отмена</button>
          </>
        ) : (
          <>
            <h2 className="sheet__title">{c.title}</h2>
            <p className="stub">{FORMAT_LABELS[c.format]}{c.timeCapMin !== undefined ? ` · ${c.timeCapMin} мин` : ''}{c.tags.length > 0 ? ` · ${c.tags.join(', ')}` : ''}</p>
            <p className="cx-desc">{c.description}</p>

            <div className="sheet__row">
              <span className="sheet__label">РЕЗУЛЬТАТЫ</span>
              {history.length === 0 ? (
                <span>Не делал</span>
              ) : (
                <ul className="cx-history">
                  {history.slice(0, HISTORY).map((a) => (
                    <li key={`${a.sessionId}:${a.block.id}`}>
                      <span>{formatDateShort(a.date, today)}</span>
                      <b>{formatResult(a.block.format, a.block.result)}</b>
                      {best && best.sessionId === a.sessionId && best.block.id === a.block.id ? <span className="cx-record">рекорд</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isNext ? <p className="item__hint">Этот комплекс — следующий в очереди.</p> : null}
            {queue ? (
              <button type="button" className="htr-btn htr-btn--primary" disabled={isNext} onClick={() => void makeNext()}>
                {isNext ? 'Уже следующий' : 'Сделать следующим'}
              </button>
            ) : null}
            {queue && !queue.order.includes(c.id) ? (
              <button type="button" className="htr-btn htr-btn--secondary" onClick={() => void addComplexToProgram(queue.id, c.id).then(onClose)}>Добавить в программу</button>
            ) : null}
            {isReadOnlyComplex(c.id) ? null : <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setEditing(true)}>Изменить</button>}
            {complexSourceUrl(c.id) ? <p className="item__hint">Источник: <a href={complexSourceUrl(c.id)!} target="_blank" rel="noreferrer">sportkuznica.com</a></p> : null}
            {queue?.order.includes(c.id) ? (
              <ConfirmButton
                label="Убрать из программы"
                confirmLabel="Убрать?"
                className="htr-btn htr-btn--ghost"
                onConfirm={() => void removeComplexFromProgram(queue.id, c.id).then(onClose)}
              />
            ) : null}
            <button type="button" className="htr-btn htr-btn--ghost" onClick={onClose}>Закрыть</button>
          </>
        )}
        <span className="sr-only">{FORMAT_SHORT[c.format]}</span>
      </section>
    </>
  );
}
