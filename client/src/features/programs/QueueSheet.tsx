import type { QueueRecord, TemplateRecord } from '@splav/shared';
import { useState, type ReactElement } from 'react';
import { ConfirmButton } from '../../components/fields.tsx';
import { queueAddTemplate, queueMoveTemplate, queueRemoveTemplate, queueSetPosition, type QueueDraft } from '../../domain/queueEdit.ts';
import { saveRecord } from '../../sync/records.ts';

interface Props {
  queue: QueueRecord;
  templates: readonly TemplateRecord[];
  /** Номер следующего слота — подсказка, с чего человек начнёт, если ничего не менять. */
  position: number;
  onClose: () => void;
}

/** Редактор очереди: порядок шаблонов, состав, «начать с…». Каждое действие сразу сохраняется. */
export function QueueSheet({ queue, templates, position, onClose }: Props): ReactElement {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const outside = templates.filter((t) => !queue.templateIds.includes(t.id));
  const [toAdd, setToAdd] = useState('');
  const [startAt, setStartAt] = useState(String(position));

  const draft = (): QueueDraft => {
    const { updatedAt: _u, deletedAt: _d, ...rest } = queue;
    return rest;
  };
  const apply = (fn: (q: QueueDraft) => QueueDraft): Promise<unknown> => saveRecord('queues', fn(draft()));

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Очередь">
        <h2 className="sheet__title">Очередь тренировок</h2>
        <p className="stub">Шаблоны идут по кругу. Очередь сдвигается, только когда завершена тренировка из неё: свободные тренировки и пробежки её не трогают.</p>

        <ol className="q-edit">
          {queue.templateIds.map((id, i) => {
            const t = byId.get(id);
            return (
              <li key={id} className="q-edit__row">
                <span className="q-edit__no">{i + 1}</span>
                <span className="q-edit__name">{t?.title ?? 'Шаблон удалён'}</span>
                <button type="button" className="icon-btn" aria-label={`${t?.title ?? 'Шаблон'}: выше`} disabled={i === 0} onClick={() => void apply((q) => queueMoveTemplate(q, i, -1))}>↑</button>
                <button type="button" className="icon-btn" aria-label={`${t?.title ?? 'Шаблон'}: ниже`} disabled={i === queue.templateIds.length - 1} onClick={() => void apply((q) => queueMoveTemplate(q, i, 1))}>↓</button>
                <ConfirmButton
                  label="×"
                  ariaLabel={`Убрать из очереди: ${t?.title ?? 'шаблон'}`}
                  confirmLabel="?"
                  className="icon-btn"
                  onConfirm={() => void apply((q) => queueRemoveTemplate(q, i))}
                />
              </li>
            );
          })}
        </ol>

        {outside.length > 0 ? (
          <div className="two">
            <label className="field-col">
              <span className="sheet__label">ДОБАВИТЬ В ОЧЕРЕДЬ</span>
              <select aria-label="Шаблон для добавления" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
                <option value="">Выберите шаблон…</option>
                {outside.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="pill-btn"
              disabled={toAdd === ''}
              onClick={() => {
                void apply((q) => queueAddTemplate(q, toAdd));
                setToAdd('');
              }}
            >
              Добавить
            </button>
          </div>
        ) : null}

        <div className="two">
          <label className="field-col">
            <span className="sheet__label">НАЧАТЬ С</span>
            <select aria-label="Начать с шаблона" value={startAt} onChange={(e) => setStartAt(e.target.value)}>
              {queue.templateIds.map((id, i) => <option key={id} value={i}>{i + 1}. {byId.get(id)?.title ?? 'Шаблон удалён'}</option>)}
            </select>
          </label>
          <button type="button" className="pill-btn" onClick={() => void apply((q) => queueSetPosition(q, Number(startAt), Date.now()))}>Применить</button>
        </div>
        <p className="item__hint">«Начать с» действует до первой завершённой тренировки очереди, дальше очередь снова считается по истории.</p>

        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Готово</button>
      </section>
    </>
  );
}
