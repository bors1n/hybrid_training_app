import { FORMATS, type CatalogExercise, type ComplexRecord } from '@splav/shared';
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
import { complexSource } from '../../domain/complexLibrary.ts';
import { frequentExercises } from '../../domain/exerciseHeadline.ts';
import { FORMAT_SHORT } from '../../domain/planFormat.ts';
import { complexQueueState } from '../../domain/queue.ts';
import { normalizeName } from '../../domain/matching.ts';
import { HAS_REPDB_CATALOG } from '../../seed/catalog.ts';
import { HAS_WODS } from '../../seed/wods.ts';
import { ComplexSheet } from '../programs/ComplexSheet.tsx';
import { useActiveProgram, useComplexes } from '../programs/useProgramData.ts';
import { useSessions } from '../workout/useSessions.ts';
import { ExerciseSheet } from './ExerciseSheet.tsx';
import { NewExerciseSheet } from './NewExerciseSheet.tsx';
import { useCatalog } from './useCatalog.ts';

const PAGE = 60;
const kinds = Object.keys(KIND_LABELS) as Kind[];
const groups = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
const equipments = Object.keys(EQUIPMENT_LABELS) as Equipment[];

function ComplexRow({ c, onOpen }: { c: ComplexRecord; onOpen: () => void }): ReactElement {
  const source = complexSource(c.id);
  const sub = [c.id.startsWith('#') ? c.id : null, FORMAT_SHORT[c.format], c.timeCapMin !== undefined ? `${c.timeCapMin} мин` : null, source === 'own' ? 'свой' : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <span className="thumb thumb--empty">{c.id.startsWith('#') ? c.id.slice(1) : c.title.slice(0, 1)}</span>
        <span className="ex-row__text">
          <span className="ex-row__name">{c.title}</span>
          <span className="ex-row__sub">{sub}</span>
        </span>
        <span className="dot" style={{ background: kindColorVar('complex') }} />
      </button>
    </li>
  );
}

function Thumb({ e }: { e: CatalogExercise }): ReactElement {
  if (e.media) return <img className="thumb" src={e.media.image} alt="" loading="lazy" width={56} height={56} />;
  return <span className="thumb thumb--empty">{e.isCustom ? 'Св' : e.name.slice(0, 1)}</span>;
}

function subtitle(e: CatalogExercise): string {
  const g = muscleGroups(e).map((x) => MUSCLE_GROUP_LABELS[x]);
  return [g[0] ?? KIND_LABELS[e.kind], EQUIPMENT_LABELS[e.equipment]].join(' · ');
}

function ExerciseRow({ e, stat, onOpen }: { e: CatalogExercise; stat?: string | null; onOpen: () => void }): ReactElement {
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <Thumb e={e} />
        <span className="ex-row__text">
          <span className="ex-row__name">{e.name}</span>
          <span className="ex-row__sub">{stat ? `${subtitle(e)} · ${stat}` : subtitle(e)}</span>
        </span>
        {e.isCustom ? <span className="ex-row__badge">своё</span> : <span className="dot" style={{ background: kindColorVar(e.kind) }} />}
      </button>
    </li>
  );
}

export function LibraryScreen(): ReactElement {
  const catalog = useCatalog();
  const sessions = useSessions();
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const [creating, setCreating] = useState(false);
  // Комплексы — отдельный вид каталога: свой список, поиск и фильтр по формату.
  const [complexMode, setComplexMode] = useState(false);
  const [format, setFormat] = useState<ComplexRecord['format'] | null>(null);
  const [openComplexId, setOpenComplexId] = useState<string | null>(null);
  const complexes = useComplexes();
  const active = useActiveProgram();

  // Поиск не блокирует ввод: список пересчитывается с отставанием.
  const deferred = useDeferredValue(filter);
  const found = useMemo(() => rankByQuery(filterCatalog(catalog, deferred), deferred.query), [catalog, deferred]);
  const customCount = useMemo(() => catalog.filter((e) => e.isCustom).length, [catalog]);

  const foundComplexes = useMemo(() => {
    const q = normalizeName(deferred.query);
    return (complexes ?? []).filter((c) => (format === null || c.format === format) && (q === '' || normalizeName(`${c.id} ${c.title} ${c.description}`).includes(q)));
  }, [complexes, deferred.query, format]);
  const openComplex = complexes?.find((c) => c.id === openComplexId);
  const cq = active?.complexQueue;
  const cqState = useMemo(() => (cq && sessions ? complexQueueState(cq, sessions) : null), [cq, sessions]);

  const patch = (p: Partial<CatalogFilter>): void => {
    setFilter((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };
  const toggle = <K extends keyof CatalogFilter>(key: K, value: CatalogFilter[K]): void =>
    patch({ [key]: filter[key] === value ? EMPTY_FILTER[key] : value } as Partial<CatalogFilter>);
  const filtered = filter.kind || filter.group || filter.equipment || filter.onlyCustom || filter.query;
  const frequent = useMemo(() => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    return frequentExercises(sessions ?? []).flatMap((f) => {
      const e = byId.get(f.exerciseId);
      return e ? [{ e, headline: f.headline }] : [];
    });
  }, [catalog, sessions]);

  return (
    <>
      <ScreenHead label={complexMode ? `${complexes?.length ?? 0} комплексов` : `${catalog.length} упражнений · ${customCount} своих`} title="Каталог" />

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
        <Chip on={!filtered && !complexMode} onClick={() => { setFilter(EMPTY_FILTER); setComplexMode(false); setFormat(null); setLimit(PAGE); }}>Все</Chip>
        {kinds.map((k) => (
          <Chip key={k} on={!complexMode && filter.kind === k} onClick={() => { setComplexMode(false); toggle('kind', k); }}>
            <span className="dot" style={{ background: kindColorVar(k) }} />
            {KIND_LABELS[k]}
          </Chip>
        ))}
        <Chip on={complexMode} onClick={() => { setComplexMode(!complexMode); setLimit(PAGE); }}>
          <span className="dot" style={{ background: kindColorVar('complex') }} />
          Комплексы
        </Chip>
        <Chip on={!complexMode && filter.onlyCustom} onClick={() => { setComplexMode(false); patch({ onlyCustom: !filter.onlyCustom }); }}>Свои</Chip>
      </div>
      {complexMode ? (
        <>
          <div className="chips" role="group" aria-label="Формат">
            {FORMATS.map((f) => (
              <Chip key={f} on={format === f} onClick={() => { setFormat(format === f ? null : f); setLimit(PAGE); }}>{FORMAT_SHORT[f]}</Chip>
            ))}
          </div>
          <p className="lib-count" role="status">{foundComplexes.length === (complexes?.length ?? 0) ? 'Все комплексы' : `Найдено: ${foundComplexes.length}`}</p>
          <ul className="ex-list" aria-label="Комплексы">
            {foundComplexes.slice(0, limit).map((c) => (
              <ComplexRow key={c.id} c={c} onOpen={() => setOpenComplexId(c.id)} />
            ))}
          </ul>
          {foundComplexes.length === 0 ? <p className="stub">Комплексов не найдено. Попробуйте другой запрос или формат.</p> : null}
          {foundComplexes.length > limit ? (
            <button type="button" className="htr-btn htr-btn--secondary lib-more" onClick={() => setLimit((n) => n + PAGE)}>
              Показать ещё {Math.min(PAGE, foundComplexes.length - limit)}
            </button>
          ) : null}
          {!HAS_WODS && import.meta.env.DEV ? (
            <p className="stub">Библиотека sportkuznica не собрана: выполните <code>npm run seed:wods</code> и перезапустите dev-сервер. Сейчас показаны только комплексы автора и свои.</p>
          ) : null}
        </>
      ) : null}
      {complexMode ? null : (
        <>
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

        {!active && frequent.length > 0 ? (
          <section aria-label="Часто делаешь">
            <p className="lib-count">Часто делаешь</p>
            <ul className="ex-list">
              {frequent.map(({ e, headline }) => (
                <ExerciseRow key={e.id} e={e} stat={headline} onOpen={() => setSelected(e)} />
              ))}
            </ul>
          </section>
        ) : null}

        <p className="lib-count" role="status">
          {found.length === catalog.length ? 'Все упражнения' : `Найдено: ${found.length}`}
        </p>

        <ul className="ex-list">
          {found.slice(0, limit).map((e) => (
            <ExerciseRow key={e.id} e={e} onOpen={() => setSelected(e)} />
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
        </>
      )}

      {selected ? <ExerciseSheet exercise={selected} onClose={() => setSelected(null)} /> : null}
      {openComplex ? (
        <ComplexSheet
          complex={openComplex}
          sessions={sessions ?? []}
          queue={cq}
          queuePosition={cqState?.position ?? null}
          isNext={cqState?.complexId === openComplex.id}
          onClose={() => setOpenComplexId(null)}
        />
      ) : null}
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
