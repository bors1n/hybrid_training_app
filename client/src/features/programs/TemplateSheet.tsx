import type { CatalogExercise, TemplateRecord } from '@splav/shared';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { startTemplateWorkout } from '../../data/templateService.ts';
import { describeBlock } from '../../domain/templateDescribe.ts';

interface Props {
  template: TemplateRecord;
  catalog: ReadonlyMap<string, CatalogExercise>;
  /** Шаблон стоит в очереди: тренировка из него её сдвинет. */
  inQueue: boolean;
  /** Очередь программы, из которой запускается шаблон. */
  queueId?: string;
  onClose: () => void;
}

/** Просмотр шаблона: из чего состоит, и запуск тренировки. */
export function TemplateSheet({ template: t, catalog, inQueue, queueId, onClose }: Props): ReactElement {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string): string => catalog.get(id)?.name ?? 'Упражнение удалено';

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const id = await startTemplateWorkout(t.id, inQueue && queueId ? { queueId } : {});
      onClose();
      navigate(`/workout/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать тренировку');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label={`Шаблон: ${t.title}`}>
        <h2 className="sheet__title">{t.title}</h2>
        {t.subtitle || t.durationHint ? <p className="stub">{[t.subtitle, t.durationHint].filter(Boolean).join(' · ')}</p> : null}
        <p className="item__hint">
          {inQueue ? 'В очереди: завершённая тренировка сдвинет очередь.' : 'Вне очереди: очередь не сдвигается.'}
        </p>

        {t.blocks.length === 0 ? <p className="stub">В шаблоне пока нет блоков. Откройте редактор и добавьте упражнения.</p> : null}
        <ol className="tpl-blocks">
          {t.blocks.map((b) => (
            <li key={b.id} className="tpl-block">
              {describeBlock(b, nameOf).map((l, i) => (
                <span key={i} className={l.group ? 'tpl-line tpl-line--ss' : 'tpl-line'}>{l.text}</span>
              ))}
            </li>
          ))}
        </ol>

        {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}
        <button type="button" className="htr-btn htr-btn--primary" disabled={busy} onClick={() => void start()}>Начать</button>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => { onClose(); navigate(`/template/${t.id}`); }}>Изменить шаблон</button>
        <button type="button" className="htr-btn htr-btn--ghost" onClick={onClose}>Закрыть</button>
      </section>
    </>
  );
}
