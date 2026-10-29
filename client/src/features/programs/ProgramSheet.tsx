import type { ProgramRecord } from '@splav/shared';
import { useState, type ReactElement } from 'react';
import { ConfirmButton } from '../../components/fields.tsx';
import { deleteProgram, setActiveProgram, updateProgram } from '../../data/programService.ts';

interface Props {
  program: ProgramRecord;
  isActive: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/** Название, описание, «Сделать активной» и удаление программы. */
export function ProgramSheet({ program, isActive, onClose, onDeleted }: Props): ReactElement {
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (title.trim() === '') return setError('Введите название');
    try {
      await updateProgram(program.id, { title, description });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="О программе">
        <h2 className="sheet__title">О программе</h2>
        <label className="field-col">
          <span className="sheet__label">НАЗВАНИЕ</span>
          <input className="field" aria-label="Название программы" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="field-col">
          <span className="sheet__label">ОПИСАНИЕ</span>
          <textarea className="ex-note" aria-label="Описание программы" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}
        <button type="button" className="htr-btn htr-btn--primary" onClick={() => void save()}>Сохранить</button>
        <button type="button" className="htr-btn htr-btn--secondary" disabled={isActive} onClick={() => void setActiveProgram(program.id).then(onClose)}>
          {isActive ? 'Уже активная' : 'Сделать активной'}
        </button>
        <p className="item__hint">Активная программа — та, чью очередь показывает «Сегодня». Записанные тренировки не меняются.</p>
        <ConfirmButton
          label="Удалить программу"
          confirmLabel="Удалить насовсем?"
          className="htr-btn htr-btn--ghost"
          onConfirm={() => void deleteProgram(program.id).then(onDeleted)}
        />
        <button type="button" className="htr-btn htr-btn--ghost" onClick={onClose}>Закрыть</button>
      </section>
    </>
  );
}
