import type { CatalogExercise } from '@hybridlog/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { db } from '../../data/db.ts';
import { EQUIPMENT_LABELS, KIND_LABELS, kindColorVar, muscleLabel } from '../../domain/catalogFilter.ts';
import { MEDIA_SOURCE, REPDB_ATTRIBUTION, REPDB_URL } from '../../seed/catalog.ts';
import { deleteRecord, saveRecord } from '../../sync/records.ts';
import { useExerciseNote } from './useCatalog.ts';

interface Props {
  exercise: CatalogExercise;
  onClose: () => void;
}

export function ExerciseSheet({ exercise: e, onClose }: Props): ReactElement {
  const saved = useExerciseNote(e.id);
  const [text, setText] = useState(saved);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Заметка подтягивается из базы один раз, когда она загрузилась; дальше правит пользователь.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!synced && saved !== '') {
      setText(saved);
      setSynced(true);
    }
  }, [saved, synced]);

  async function saveNote(): Promise<void> {
    const value = text.trim();
    if (value === saved.trim()) return;
    if (value === '') {
      if (await db.rows('exerciseNotes').get(e.id)) await deleteRecord('exerciseNotes', e.id);
      return;
    }
    await saveRecord('exerciseNotes', { id: e.id, exerciseId: e.id, text: value });
  }

  async function close(): Promise<void> {
    await saveNote();
    onClose();
  }

  async function remove(): Promise<void> {
    await deleteRecord('exercises', e.id);
    onClose();
  }

  const fromRepdb = e.media?.source === MEDIA_SOURCE;
  const userCreated = e.isCustom && !e.id.startsWith('hybridlog:');

  return (
    <>
      <div className="sheet-backdrop" onClick={() => void close()} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label={e.name}>
        {e.media ? (
          <div className="ex-pics">
            {e.media.imageStart ? <img src={e.media.imageStart} alt="" loading="lazy" /> : null}
            <img src={e.media.image} alt={`Иллюстрация: ${e.name}`} loading="lazy" />
          </div>
        ) : null}

        <h2 className="sheet__title">{e.name}</h2>
        <div className="ex-tags">
          <span className="htr-tag">
            <span className="htr-tag__dot" style={{ background: kindColorVar(e.kind) }} />
            {KIND_LABELS[e.kind]}
          </span>
          <span className="htr-tag">{EQUIPMENT_LABELS[e.equipment]}</span>
          {e.isCustom ? <span className="htr-tag">своё</span> : null}
        </div>

        {e.muscles.primary.length > 0 ? (
          <div className="sheet__row">
            <span className="sheet__label">Основные мышцы</span>
            <span>{e.muscles.primary.map(muscleLabel).join(', ')}</span>
          </div>
        ) : null}
        {e.muscles.secondary.length > 0 ? (
          <div className="sheet__row">
            <span className="sheet__label">Вспомогательные</span>
            <span>{e.muscles.secondary.map(muscleLabel).join(', ')}</span>
          </div>
        ) : null}
        {e.perSide ? <p className="stub">Повторы считаются на каждую сторону.</p> : null}
        {e.aliases.length > 0 ? <p className="stub">Также: {e.aliases.slice(0, 4).join(' · ')}</p> : null}

        <label className="sheet__row">
          <span className="sheet__label">Заметка</span>
          <textarea
            className="ex-note"
            rows={3}
            placeholder="Настройка тренажёра, угол, хват…"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            onBlur={() => void saveNote()}
            maxLength={2000}
          />
        </label>

        {fromRepdb ? (
          <p className="sheet__credit">
            <a href={REPDB_URL} target="_blank" rel="noreferrer">{REPDB_ATTRIBUTION}</a>
          </p>
        ) : null}

        {userCreated ? (
          confirmDelete ? (
            <div className="sheet__confirm" role="alert">
              <p>Удалить упражнение? Тренировки, где оно использовано, сохранятся.</p>
              <button type="button" className="htr-btn htr-btn--danger" onClick={() => void remove()}>Удалить</button>
              <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setConfirmDelete(false)}>Отмена</button>
            </div>
          ) : (
            <button type="button" className="htr-btn htr-btn--ghost" onClick={() => setConfirmDelete(true)}>Удалить упражнение</button>
          )
        ) : null}
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => void close()}>Закрыть</button>
      </section>
    </>
  );
}
