import type { CatalogExercise, SessionRecord } from '@hybridlog/shared';
import { useDeferredValue, useMemo, useState, type ReactElement } from 'react';
import { EMPTY_FILTER, EQUIPMENT_LABELS, KIND_LABELS, filterCatalog, kindColorVar, rankByQuery, type Kind } from '../../domain/catalogFilter.ts';
import { recentExerciseIds } from '../../domain/recent.ts';

interface Props {
  title: string;
  catalog: readonly CatalogExercise[];
  sessions: readonly SessionRecord[];
  /** Ограничение по типам (например, для мобильности — мобильность и кор). */
  kinds?: readonly Kind[];
  onPick: (exercise: CatalogExercise) => void;
  onClose: () => void;
}

const LIMIT = 50;

/** Лист выбора упражнения: недавние сверху, дальше поиск по всему каталогу и своим. */
export function ExercisePicker({ title, catalog, sessions, kinds, onPick, onClose }: Props): ReactElement {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const allowed = useMemo(() => (kinds ? catalog.filter((e) => kinds.includes(e.kind)) : catalog), [catalog, kinds]);
  const byId = useMemo(() => new Map(allowed.map((e) => [e.id, e])), [allowed]);
  const recent = useMemo(
    () => recentExerciseIds(sessions, 8).flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    [sessions, byId],
  );
  const found = useMemo(
    () => rankByQuery(filterCatalog(allowed, { ...EMPTY_FILTER, query: deferred }), deferred).slice(0, LIMIT),
    [allowed, deferred],
  );

  const row = (e: CatalogExercise): ReactElement => (
    <li key={e.id}>
      <button type="button" className="pick-row" onClick={() => onPick(e)}>
        {e.media ? <img className="thumb thumb--sm" src={e.media.image} alt="" loading="lazy" width={40} height={40} /> : <span className="thumb thumb--sm thumb--empty">{e.isCustom ? 'Св' : e.name.slice(0, 1)}</span>}
        <span className="pick-row__text">
          <span className="pick-row__name">{e.name}</span>
          <span className="pick-row__sub">{KIND_LABELS[e.kind]} · {EQUIPMENT_LABELS[e.equipment]}</span>
        </span>
        <span className="dot" style={{ background: kindColorVar(e.kind) }} />
      </button>
    </li>
  );

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="sheet__title">{title}</h2>
        <label className="search">
          <input
            type="search"
            aria-label="Поиск упражнения"
            placeholder="Найти упражнение…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </label>

        {query.trim() === '' && recent.length > 0 ? (
          <>
            <span className="sheet__label">НЕДАВНИЕ</span>
            <ul className="ex-list">{recent.map(row)}</ul>
            <span className="sheet__label">ВСЕ УПРАЖНЕНИЯ</span>
          </>
        ) : null}
        <ul className="ex-list">{found.map(row)}</ul>
        {found.length === 0 ? <p className="stub">Ничего не найдено. Своё упражнение можно создать на вкладке «Каталог».</p> : null}
        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Отмена</button>
      </section>
    </>
  );
}
