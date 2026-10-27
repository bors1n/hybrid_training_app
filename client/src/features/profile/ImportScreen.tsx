import { ComplexRecordSchema, type CatalogExercise } from '@splav/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Chip } from '../../components/Chip.tsx';
import { applyImport, type ApplyResult } from '../../data/importService.ts';
import { decodeCsvBytes, parseCsvText, type Table } from '../../domain/csvText.ts';
import { todayKey } from '../../domain/history.ts';
import { buildImport, type ImportIssue, type ImportPlan, type LibraryComplex } from '../../domain/importCsv.ts';
import { classifyPlan } from '../../domain/importPlan.ts';
import { createMatcher } from '../../domain/matching.ts';
import { listRecords } from '../../sync/records.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { useSessions } from '../workout/useSessions.ts';

type Phase =
  | { name: 'pick' }
  | { name: 'review'; fileName: string; table: Table }
  | { name: 'done'; fileName: string; result: ApplyResult };

const MAX_ISSUES = 100;
const ruDate = (iso: string): string => iso.split('-').reverse().join('.');

function IssueList({ title, issues, open }: { title: string; issues: ImportIssue[]; open?: boolean }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <details className="imp-issues" open={open}>
      <summary>{title} ({issues.length})</summary>
      <ul>
        {issues.slice(0, MAX_ISSUES).map((i, n) => (
          <li key={n}>
            <span className="imp-issues__row">{i.row === null ? 'Файл' : `Строка ${i.row}`}</span> {i.message}
          </li>
        ))}
      </ul>
      {issues.length > MAX_ISSUES ? <p className="stub">…и ещё {issues.length - MAX_ISSUES}</p> : null}
    </details>
  );
}

/** Импорт CSV и Excel по шаблону: разбор, проверка со сводкой, и только после подтверждения запись. */
export function ImportScreen(): ReactElement {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const sessions = useSessions();
  const [phase, setPhase] = useState<Phase>({ name: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  const [picking, setPicking] = useState<{ key: string; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Пока справочники не загрузились, файл выбрать нельзя: иначе план мог бы собраться без библиотеки комплексов и сохранённых сопоставлений.
  const complexRowsLive = useLiveQuery(() => listRecords('complexes'), []);
  const aliasRowsLive = useLiveQuery(() => listRecords('exerciseAliases'), []);
  const ready = complexRowsLive !== undefined && aliasRowsLive !== undefined && sessions !== undefined;
  const complexRows = complexRowsLive ?? [];
  const aliasRows = aliasRowsLive ?? [];
  const complexes = useMemo<LibraryComplex[]>(
    () =>
      complexRows.flatMap((r) => {
        const p = ComplexRecordSchema.safeParse(r);
        return p.success ? [{ id: p.data.id, title: p.data.title, format: p.data.format, timeCapMin: p.data.timeCapMin, description: p.data.description }] : [];
      }),
    [complexRows],
  );
  const matcher = useMemo(
    () => createMatcher(catalog, { remembered: aliasRows.map((r) => ({ alias: String(r['alias']), exerciseId: String(r['exerciseId']) })) }),
    [catalog, aliasRows],
  );
  const catalogById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  const table = phase.name === 'review' ? phase.table : null;
  const existing = sessions ?? [];

  // Выбор человека не меняет список «что решать»: он строится по разбору без выбора.
  const base = useMemo<ImportPlan | null>(
    () => (table ? buildImport(table, { today: todayKey(), matcher, complexes, existing }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, matcher, complexes],
  );
  const plan = useMemo<ImportPlan | null>(
    () => (table ? buildImport(table, { today: todayKey(), matcher, complexes, existing, resolutions }) : null),
    [table, matcher, complexes, existing, resolutions],
  );
  const classified = useMemo(() => (plan ? classifyPlan(plan, existing) : null), [plan, existing]);

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = /\.(xlsx|xls)$/i.test(file.name)
        ? (await import('../../data/xlsxFile.ts')).tableFromXlsx(bytes)
        : parseCsvText(decodeCsvBytes(bytes));
      setResolutions({});
      setNames({});
      setReplace(false);
      setPhase({ name: 'review', fileName: file.name, table: parsed });
    } catch {
      setError('Не удалось прочитать файл. Подойдут CSV и Excel (.xlsx) по шаблону.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function choose(key: string, name: string, value: string | null): void {
    setNames((n) => ({ ...n, [key]: name }));
    setResolutions((r) => {
      const next = { ...r };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function run(): Promise<void> {
    if (!plan || phase.name !== 'review') return;
    setBusy(true);
    setError(null);
    try {
      const manualMatches = Object.entries(resolutions)
        .filter(([, id]) => id !== 'new')
        .map(([key, exerciseId]) => ({ name: names[key] ?? key, exerciseId }));
      const result = await applyImport(plan, { replaceExisting: replace, manualMatches });
      setPhase({ name: 'done', fileName: phase.fileName, result });
    } catch (e) {
      setError(e instanceof Error ? `Не удалось импортировать: ${e.message}` : 'Не удалось импортировать');
    } finally {
      setBusy(false);
    }
  }

  const errors = plan?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = plan?.issues.filter((i) => i.severity === 'warning') ?? [];
  const toWrite = classified ? classified.added.length + (replace ? classified.replaced.length : 0) : 0;

  return (
    <div className="fullscreen imp">
      <header className="imp__head">
        <button type="button" className="round-btn round-btn--light" aria-label="Назад" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <h1 className="imp__title">Импорт тренировок</h1>
      </header>

      {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}

      {phase.name === 'pick' ? (
        <section className="imp__body">
          <p>
            Загрузите файл CSV или Excel (первый лист) по шаблону: одна строка — один подход, кардио-запись, результат комплекса или упражнение мобильности.
            Перед записью будет экран проверки: ничего не сохранится, пока вы не подтвердите.
          </p>
          <a className="htr-btn htr-btn--secondary imp__link" href="/import_template.csv" download="import_template.csv">Скачать шаблон с примерами</a>
          <label className="htr-btn htr-btn--primary imp__file">
            {busy ? 'Читаю файл…' : 'Выбрать файл'}
            <input
              ref={input}
              type="file"
              className="sr-only"
              aria-label="Файл для импорта"
              accept=".csv,.txt,.xlsx,.xls,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              disabled={busy || !ready}
            />
          </label>
          <p className="stub">
            Даты — ДД.ММ.ГГГГ, время — мм:сс, десятичная точка или запятая. В Excel для колонок со временем удобнее формат «Текст».
            Повторный импорт того же файла дубликатов не создаёт.
          </p>
        </section>
      ) : null}

      {phase.name === 'review' && plan && base && classified ? (
        <section className="imp__body" aria-label="Проверка импорта">
          <p className="imp__file-name">{phase.fileName}</p>

          <div className="imp-tiles">
            <div className="imp-tile"><span className="sheet__label">ТРЕНИРОВОК</span><output aria-label="Тренировок">{plan.stats.sessions}</output></div>
            <div className="imp-tile"><span className="sheet__label">ПОДХОДОВ</span><output aria-label="Подходов">{plan.stats.sets}</output></div>
            <div className="imp-tile"><span className="sheet__label">КАРДИО</span><output aria-label="Кардио">{plan.stats.cardio}</output></div>
            <div className="imp-tile"><span className="sheet__label">КОМПЛЕКСОВ</span><output aria-label="Комплексов">{plan.stats.complexes}</output></div>
          </div>
          <p className="imp__counts">
            Строк в файле: {plan.stats.rows}. Принято: {plan.stats.importedRows}. С ошибками: {plan.stats.skippedRows}.
            {plan.stats.mobility > 0 ? ` Мобильность: ${plan.stats.mobility}.` : ''}
          </p>

          <IssueList title="Ошибки: строки не импортируются" issues={errors} open />
          <IssueList title="Предупреждения: строки импортируются" issues={warnings} />

          {base.newExercises.length + base.ambiguous.length > 0 ? (
            <section aria-label="Упражнения" className="imp-block">
              <h2 className="imp-block__title">Упражнения, которых нет в каталоге ({base.newExercises.length + base.ambiguous.length})</h2>
              <p className="stub">По умолчанию для них создаются свои упражнения. Если это то же упражнение под другим названием, сопоставьте его с каталогом: выбор запомнится.</p>
              <ul className="imp-ex-list">
                {base.newExercises.map((e) => {
                  const chosen = resolutions[e.key];
                  const target = chosen && chosen !== 'new' ? catalogById.get(chosen) : undefined;
                  return (
                    <li key={e.key} className="imp-ex" aria-label={`Новое упражнение «${e.name}»`}>
                      <span className="imp-ex__name">«{e.name}» <span className="item__hint">строки: {e.rows.slice(0, 4).join(', ')}{e.rows.length > 4 ? '…' : ''}</span></span>
                      <div className="chips chips--wrap">
                        <Chip on={!target} onClick={() => choose(e.key, e.name, null)}>Создать своё</Chip>
                        <Chip on={Boolean(target)} onClick={() => setPicking({ key: e.key, name: e.name })}>{target ? `→ ${target.name}` : 'Сопоставить с каталогом…'}</Chip>
                      </div>
                    </li>
                  );
                })}
                {base.ambiguous.map((a) => (
                  <li key={a.key} className="imp-ex" aria-label={`Неоднозначное название «${a.name}»`}>
                    <span className="imp-ex__name">«{a.name}» подходит нескольким упражнениям</span>
                    <select
                      aria-label={`Выбор для «${a.name}»`}
                      value={resolutions[a.key] ?? a.chosen}
                      onChange={(ev) => choose(a.key, a.name, ev.target.value)}
                    >
                      {a.candidates.map((id) => (
                        <option key={id} value={id}>{catalogById.get(id)?.name ?? id}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Что изменится" className="imp-block">
            <h2 className="imp-block__title">Что изменится в журнале</h2>
            <ul className="imp-changes">
              <li>Добавится: <b>{classified.added.length}</b></li>
              <li>Уже есть и совпадает: <b>{classified.unchanged.length}</b></li>
              <li>Уже есть, но отличается: <b>{classified.replaced.length}</b></li>
            </ul>
            {classified.replaced.length > 0 ? (
              <label className="check">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                <span>
                  Заменить {classified.replaced.length} существующих тренировок данными из файла
                  <span className="item__hint"> {classified.replaced.slice(0, 3).map((s) => `${s.draft.title} ${ruDate(s.draft.date)}`).join('; ')}{classified.replaced.length > 3 ? '…' : ''}</span>
                </span>
              </label>
            ) : null}
          </section>

          <div className="imp__actions">
            <button type="button" className="htr-btn htr-btn--primary" disabled={busy || toWrite === 0 || errors.length === plan.stats.rows} onClick={() => void run()}>
              {busy ? 'Записываю…' : `Импортировать${toWrite > 0 ? ` (${toWrite})` : ''}`}
            </button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setPhase({ name: 'pick' })}>Другой файл</button>
          </div>
          {toWrite === 0 && classified.unchanged.length > 0 && classified.replaced.length === 0 ? (
            <p className="stub" role="status">Всё из этого файла уже есть в журнале — импортировать нечего.</p>
          ) : null}
        </section>
      ) : null}

      {phase.name === 'done' ? (
        <section className="imp__body" aria-label="Результат импорта">
          <h2 className="imp-block__title" role="status">Готово</h2>
          <ul className="imp-changes">
            <li>Добавлено тренировок: <b>{phase.result.added}</b></li>
            <li>Заменено: <b>{phase.result.replaced}</b></li>
            <li>Без изменений: <b>{phase.result.unchanged}</b></li>
            {phase.result.keptExisting > 0 ? <li>Оставлено без замены: <b>{phase.result.keptExisting}</b></li> : null}
            <li>Создано упражнений: <b>{phase.result.exercisesCreated}</b></li>
          </ul>
          <p className="stub">Данные уйдут на сервер при первой связи.</p>
          <div className="imp__actions">
            <button type="button" className="htr-btn htr-btn--primary" onClick={() => navigate('/progress', { replace: true })}>Открыть историю</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setPhase({ name: 'pick' })}>Импортировать ещё</button>
          </div>
        </section>
      ) : null}

      {picking ? (
        <ExercisePicker
          title={`Сопоставить «${picking.name}»`}
          catalog={catalog as readonly CatalogExercise[]}
          sessions={existing}
          onClose={() => setPicking(null)}
          onPick={(e) => {
            choose(picking.key, picking.name, e.id);
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}
