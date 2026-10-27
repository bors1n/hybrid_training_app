import type { CatalogExercise } from '@splav/shared';
import { useDeferredValue, useMemo, useState, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { ScreenHead } from '../../components/ScreenHead.tsx';
import {
  EMPTY_FILTER,
  EQUIPMENT_LABELS,
  KIND_LABELS,
  MUSCLE_GROUP_LABELS,
  filterCatalog,
  kindColorVar,
  muscleGroups,
  rankByQuery,
  type CatalogFilter,
  type Equipment,
  type Kind,
  type MuscleGroup,
} from '../../domain/catalogFilter.ts';
import { HAS_REPDB_CATALOG } from '../../seed/catalog.ts';
import { ExerciseSheet } from './ExerciseSheet.tsx';
import { NewExerciseSheet } from './NewExerciseSheet.tsx';
import { useCatalog } from './useCatalog.ts';

const PAGE = 60;
const kinds = Object.keys(KIND_LABELS) as Kind[];
const groups = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
const equipments = Object.keys(EQUIPMENT_LABELS) as Equipment[];

function Thumb({ e }: { e: CatalogExercise }): ReactElement {
  if (e.media) return <img className="thumb" src={e.media.image} alt="" loading="lazy" width={56} height={56} />;
  return <span className="thumb thumb--empty">{e.isCustom ? 'Св' : e.name.slice(0, 1)}</span>;
}

function subtitle(e: CatalogExercise): string {
  const g = muscleGroups(e).map((x) => MUSCLE_GROUP_LABELS[x]);
  return [g[0] ?? KIND_LABELS[e.kind], EQUIPMENT_LABELS[e.equipment]].join(' · ');
}

export function LibraryScreen(): ReactElement {
  const catalog = useCatalog();
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const [creating, setCreating] = useState(false);

  // Поиск не блокирует ввод: список пересчитывается с отставанием.
  const deferred = useDeferredValue(filter);
  const found = useMemo(() => rankByQuery(filterCatalog(catalog, deferred), deferred.query), [catalog, deferred]);
  const customCount = useMemo(() => catalog.filter((e) => e.isCustom).length, [catalog]);

  const patch = (p: Partial<CatalogFilter>): void => {
    setFilter((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };
  const toggle = <K extends keyof CatalogFilter>(key: K, value: CatalogFilter[K]): void =>
    patch({ [key]: filter[key] === value ? EMPTY_FILTER[key] : value } as Partial<CatalogFilter>);
  const active = filter.kind || filter.group || filter.equipment || filter.onlyCustom || filter.query;

  return (
    <>
      <ScreenHead label={`${catalog.length} упражнений · ${customCount} своих`} title="Каталог" />

      <div className="lib-bar">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            placeholder="Найти: присед, sled, гребля…"
            aria-label="Поиск по каталогу"
            value={filter.query}
            onChange={(ev) => patch({ query: ev.target.value })}
            enterKeyHint="search"
          />
        </label>
        <button type="button" className="add-btn" aria-label="Своё упражнение" onClick={() => setCreating(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div className="chips" role="group" aria-label="Тип">
        <Chip on={!active} onClick={() => { setFilter(EMPTY_FILTER); setLimit(PAGE); }}>Все</Chip>
        {kinds.map((k) => (
          <Chip key={k} on={filter.kind === k} onClick={() => toggle('kind', k)}>
            <span className="dot" style={{ background: kindColorVar(k) }} />
            {KIND_LABELS[k]}
          </Chip>
        ))}
        <Chip on={filter.onlyCustom} onClick={() => patch({ onlyCustom: !filter.onlyCustom })}>Свои</Chip>
      </div>
      <div className="chips" role="group" aria-label="Мышцы">
        {groups.map((g) => (
          <Chip key={g} on={filter.group === g} onClick={() => toggle('group', g)}>{MUSCLE_GROUP_LABELS[g]}</Chip>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Оборудование">
        {equipments.map((q) => (
          <Chip key={q} on={filter.equipment === q} onClick={() => toggle('equipment', q)}>{EQUIPMENT_LABELS[q]}</Chip>
        ))}
      </div>

      <p className="lib-count" role="status">
        {found.length === catalog.length ? 'Все упражнения' : `Найдено: ${found.length}`}
      </p>

      <ul className="ex-list">
        {found.slice(0, limit).map((e) => (
          <li key={e.id}>
            <button type="button" className="ex-row" onClick={() => setSelected(e)}>
              <Thumb e={e} />
              <span className="ex-row__text">
                <span className="ex-row__name">{e.name}</span>
                <span className="ex-row__sub">{subtitle(e)}</span>
              </span>
              {e.isCustom ? <span className="ex-row__badge">своё</span> : <span className="dot" style={{ background: kindColorVar(e.kind) }} />}
            </button>
          </li>
        ))}
      </ul>

      {found.length === 0 ? <p className="stub">Ничего не найдено. Попробуйте другой запрос или сбросьте фильтры.</p> : null}
      {found.length > limit ? (
        <button type="button" className="htr-btn htr-btn--secondary lib-more" onClick={() => setLimit((n) => n + PAGE)}>
          Показать ещё {Math.min(PAGE, found.length - limit)}
        </button>
      ) : null}
      {!HAS_REPDB_CATALOG && import.meta.env.DEV ? (
        <p className="stub">Каталог RepDB не собран: выполните <code>npm run seed:media</code> и перезапустите dev-сервер. Сейчас показаны только упражнения автора.</p>
      ) : null}

      {selected ? <ExerciseSheet exercise={selected} onClose={() => setSelected(null)} /> : null}
      {creating ? (
        <NewExerciseSheet
          existing={catalog}
          onClose={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false);
            setSelected(e);
          }}
        />
      ) : null}
    </>
  );
}
