import { CARDIO_ROLES, FORMATS, MODALITIES, TemplateRecordSchema, type CatalogExercise, type ComplexRecord } from '@hybridlog/shared';
import { useMemo, useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Chip } from '../../components/Chip.tsx';
import { ConfirmButton, NumberField } from '../../components/fields.tsx';
import { MinutesField } from '../../components/MinutesField.tsx';
import { useRecordDraft } from '../../data/useRecordDraft.ts';
import { deleteTemplate } from '../../data/templateService.ts';
import { MODALITY_LABELS, ROLE_LABELS } from '../../domain/sessionEdit.ts';
import {
  addCardio,
  addFixedComplex,
  addItemToBlock,
  addMobility,
  addMobilityItem,
  addQueuedComplex,
  addStrengthBlock,
  moveBlock,
  removeBlock,
  removeItem,
  removeMobilityItem,
  setItemNote,
  updateCardio,
  updateConditioning,
  updateItemPlan,
  updateMobility,
  updateTemplate,
  type TemplateDraft,
} from '../../domain/templateEdit.ts';
import { useCatalog } from '../library/useCatalog.ts';
import { FORMAT_LABELS } from '../workout/ConditioningCard.tsx';
import { BlockShell } from '../workout/BlockShell.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { useSessions } from '../workout/useSessions.ts';
import { useComplexes } from './useProgramData.ts';

function parseTemplate(row: unknown): TemplateDraft | null {
  const p = TemplateRecordSchema.safeParse(row);
  if (!p.success) return null;
  const { updatedAt: _u, deletedAt: _d, ...content } = p.data;
  return content;
}

type Block = TemplateDraft['blocks'][number];
type Update = (fn: (t: TemplateDraft) => TemplateDraft) => void;

interface Ctx {
  catalog: ReadonlyMap<string, CatalogExercise>;
  catalogList: readonly CatalogExercise[];
  sessions: Parameters<typeof ExercisePicker>[0]['sessions'];
  complexes: readonly ComplexRecord[];
  update: Update;
}

const nameOf = (ctx: Ctx, id: string): string => ctx.catalog.get(id)?.name ?? 'Упражнение удалено';

function StrengthEditor({ block, ctx }: { block: Extract<Block, { type: 'strength' }>; ctx: Ctx }): ReactElement {
  const [picking, setPicking] = useState(false);
  return (
    <>
      {block.items.map((item, i) => {
        const name = nameOf(ctx, item.exerciseId);
        const ex = ctx.catalog.get(item.exerciseId);
        const p = item.plan;
        const patch = (v: Parameters<typeof updateItemPlan>[3]): void => ctx.update((t) => updateItemPlan(t, block.id, i, v));
        const canChangeLoad = ex?.equipment === 'bodyweight' || ex?.equipment === 'machine' || p.load !== 'normal';
        return (
          <div key={i} className="item" role="group" aria-label={name}>
            <div className="item__head">
              <span className="item__name">{block.superset ? `${String.fromCharCode(65 + i)} · ` : ''}{name}</span>
              {block.superset ? (
                <ConfirmButton label="×" ariaLabel={`Убрать упражнение: ${name}`} confirmLabel="?" className="icon-btn" onConfirm={() => ctx.update((t) => removeItem(t, block.id, i))} />
              ) : null}
            </div>
            <div className="plan-grid">
              <label className="field-col"><span className="sheet__label">ПОДХОДЫ</span><NumberField label={`${name}: подходы`} value={p.sets} integer min={1} max={30} inputMode="numeric" onCommit={(v) => patch({ sets: v ?? 1 })} /></label>
              <label className="field-col"><span className="sheet__label">ПОВТ. ОТ</span><NumberField label={`${name}: повторы от`} value={p.repsMin} integer min={0} max={10000} inputMode="numeric" onCommit={(v) => patch({ repsMin: v })} /></label>
              <label className="field-col"><span className="sheet__label">ДО</span><NumberField label={`${name}: повторы до`} value={p.repsMax} integer min={0} max={10000} inputMode="numeric" onCommit={(v) => patch({ repsMax: v })} /></label>
              <label className="field-col"><span className="sheet__label">ВЕС, КГ</span><NumberField label={`${name}: вес`} value={p.weightKg} min={0} max={1000} onCommit={(v) => patch({ weightKg: v })} /></label>
              <label className="field-col"><span className="sheet__label">ДО</span><NumberField label={`${name}: вес до`} value={p.weightKgMax} min={0} max={1000} onCommit={(v) => patch({ weightKgMax: v })} /></label>
            </div>
            <label className="check">
              <input type="checkbox" checked={Boolean(p.perSide)} onChange={(e) => patch({ perSide: e.target.checked ? true : undefined })} />
              Повторы на каждую сторону
            </label>
            {canChangeLoad ? (
              <label className="item__load">
                <span className="sheet__label">НАГРУЗКА</span>
                <select aria-label={`${name}: нагрузка`} value={p.load} onChange={(e) => patch({ load: e.target.value as typeof p.load })}>
                  <option value="normal">Обычный вес</option>
                  <option value="added">С отягощением</option>
                  <option value="assisted">Противовес</option>
                </select>
              </label>
            ) : null}
            <input
              className="field"
              aria-label={`${name}: заметка`}
              placeholder="Заметка в шаблоне (вариант, как делать)"
              defaultValue={item.note ?? ''}
              maxLength={2000}
              onBlur={(e) => {
                if (e.target.value.trim() !== (item.note ?? '')) ctx.update((t) => setItemNote(t, block.id, i, e.target.value));
              }}
            />
          </div>
        );
      })}
      <div className="item__actions">
        <button type="button" className="pill-btn" onClick={() => setPicking(true)}>{block.superset ? '+ Упражнение в суперсет' : '+ В суперсет'}</button>
      </div>
      {picking ? (
        <ExercisePicker
          title="Упражнение в суперсет"
          catalog={ctx.catalogList}
          sessions={ctx.sessions}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false);
            ctx.update((t) => addItemToBlock(t, block.id, e.id, e.perSide));
          }}
        />
      ) : null}
    </>
  );
}

function CardioEditor({ block, ctx }: { block: Extract<Block, { type: 'cardio' }>; ctx: Ctx }): ReactElement {
  const patch = (v: Parameters<typeof updateCardio>[2]): void => ctx.update((t) => updateCardio(t, block.id, v));
  return (
    <>
      <div className="two">
        <label className="field-col">
          <span className="sheet__label">ВИД</span>
          <select
            aria-label="Вид кардио"
            value={block.modality}
            onChange={(e) => {
              const modality = e.target.value as typeof block.modality;
              patch({ modality, ...(block.name === undefined || block.name === MODALITY_LABELS[block.modality] ? { name: MODALITY_LABELS[modality] } : {}) });
            }}
          >
            {MODALITIES.map((m) => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="field-col">
          <span className="sheet__label">РОЛЬ</span>
          <select aria-label="Роль" value={block.role} onChange={(e) => patch({ role: e.target.value as typeof block.role })}>
            {CARDIO_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
      </div>
      <div className="two">
        <label className="field-col"><span className="sheet__label">ВРЕМЯ ОТ, МИН</span><MinutesField label="Время от, мин" className="field" value={block.durationSec} onCommit={(v) => patch({ durationSec: v })} /></label>
        <label className="field-col"><span className="sheet__label">ДО, МИН</span><MinutesField label="Время до, мин" className="field" value={block.durationSecMax} onCommit={(v) => patch({ durationSecMax: v })} /></label>
      </div>
      <input className="field" aria-label="Заметка к кардио" placeholder="Заметка (дорожка, гребля или лестница)" defaultValue={block.note ?? ''} maxLength={2000} onBlur={(e) => { if (e.target.value.trim() !== (block.note ?? '')) patch({ note: e.target.value.trim() }); }} />
    </>
  );
}

function ConditioningEditor({ block, ctx }: { block: Extract<Block, { type: 'conditioning' }>; ctx: Ctx }): ReactElement {
  const patch = (v: Parameters<typeof updateConditioning>[2]): void => ctx.update((t) => updateConditioning(t, block.id, v));
  return (
    <>
      <div className="chips chips--wrap" role="group" aria-label="Откуда комплекс">
        <Chip on={block.fromQueue} onClick={() => patch({ fromQueue: true })}>Следующий из очереди</Chip>
        <Chip on={!block.fromQueue} onClick={() => patch({ fromQueue: false, name: block.name ?? 'Комплекс', format: block.format ?? 'AMRAP' })}>Конкретный</Chip>
      </div>
      {block.fromQueue ? (
        <p className="item__hint">В тренировку подставится следующий комплекс из очереди комплексов.</p>
      ) : (
        <>
          <label className="field-col">
            <span className="sheet__label">ИЗ БИБЛИОТЕКИ</span>
            <select
              aria-label="Комплекс из библиотеки"
              value={block.complexId ?? ''}
              onChange={(e) => {
                const c = ctx.complexes.find((x) => x.id === e.target.value);
                patch(c ? { complexId: c.id, name: c.title, format: c.format, timeCapMin: c.timeCapMin, description: c.description } : { complexId: undefined });
              }}
            >
              <option value="">Свой комплекс</option>
              {ctx.complexes.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
            </select>
          </label>
          <label className="field-col">
            <span className="sheet__label">НАЗВАНИЕ</span>
            <input className="field" aria-label="Название комплекса" defaultValue={block.name ?? ''} maxLength={200} onBlur={(e) => patch({ name: e.target.value.trim() || undefined })} />
          </label>
          <div className="two">
            <label className="field-col">
              <span className="sheet__label">ФОРМАТ</span>
              <select aria-label="Формат комплекса" value={block.format ?? 'AMRAP'} onChange={(e) => patch({ format: e.target.value as NonNullable<typeof block.format> })}>
                {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
              </select>
            </label>
            <label className="field-col">
              <span className="sheet__label">ЛИМИТ, МИН</span>
              <NumberField className="field" label="Лимит времени, мин" value={block.timeCapMin} min={0} max={600} onCommit={(v) => patch({ timeCapMin: v })} />
            </label>
          </div>
          <label className="field-col">
            <span className="sheet__label">СОСТАВ</span>
            <textarea className="ex-note" aria-label="Состав комплекса" rows={3} defaultValue={block.description ?? ''} maxLength={4000} onBlur={(e) => patch({ description: e.target.value.trim() || undefined })} />
          </label>
        </>
      )}
    </>
  );
}

function MobilityEditor({ block, ctx }: { block: Extract<Block, { type: 'mobility' }>; ctx: Ctx }): ReactElement {
  const [picking, setPicking] = useState(false);
  return (
    <>
      {block.items.map((item, i) => {
        const name = nameOf(ctx, item.exerciseId);
        return (
          <div key={i} className="mob-row mob-row--tpl">
            <span className="mob-row__name">{name}</span>
            <ConfirmButton label="×" ariaLabel={`Убрать: ${name}`} confirmLabel="?" className="icon-btn" onConfirm={() => ctx.update((t) => removeMobilityItem(t, block.id, i))} />
          </div>
        );
      })}
      <div className="two">
        <label className="field-col"><span className="sheet__label">ВРЕМЯ ОТ, МИН</span><MinutesField label="Мобильность: время от, мин" className="field" value={block.durationSec} onCommit={(v) => ctx.update((t) => updateMobility(t, block.id, { durationSec: v }))} /></label>
        <label className="field-col"><span className="sheet__label">ДО, МИН</span><MinutesField label="Мобильность: время до, мин" className="field" value={block.durationSecMax} onCommit={(v) => ctx.update((t) => updateMobility(t, block.id, { durationSecMax: v }))} /></label>
      </div>
      <div className="item__actions"><button type="button" className="pill-btn" onClick={() => setPicking(true)}>+ Упражнение</button></div>
      {picking ? (
        <ExercisePicker
          title="Мобильность и кор"
          catalog={ctx.catalogList}
          sessions={ctx.sessions}
          kinds={['mobility', 'core']}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false);
            ctx.update((t) => addMobilityItem(t, block.id, e.id));
          }}
        />
      ) : null}
    </>
  );
}

type Step = 'menu' | 'strength' | 'cardio' | 'complex' | 'mobility';

function AddBlock({ ctx, onClose }: { ctx: Ctx; onClose: () => void }): ReactElement {
  const [step, setStep] = useState<Step>('menu');
  const [role, setRole] = useState<'main' | 'warmup' | 'finisher'>('main');

  if (step === 'strength') {
    return (
      <ExercisePicker title="Силовое упражнение" catalog={ctx.catalogList} sessions={ctx.sessions} onClose={onClose} onPick={(e) => { ctx.update((t) => addStrengthBlock(t, e.id, e.perSide)); onClose(); }} />
    );
  }
  if (step === 'mobility') {
    return (
      <ExercisePicker title="Мобильность и кор" catalog={ctx.catalogList} sessions={ctx.sessions} kinds={['mobility', 'core']} onClose={onClose} onPick={(e) => { ctx.update((t) => addMobility(t, e.id)); onClose(); }} />
    );
  }
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label={step === 'cardio' ? 'Кардио' : step === 'complex' ? 'Комплекс' : 'Добавить блок'}>
        {step === 'menu' ? (
          <>
            <h2 className="sheet__title">Добавить блок</h2>
            <button type="button" className="menu-btn" onClick={() => setStep('strength')}><span className="dot" style={{ background: 'var(--strength)' }} />Силовое упражнение</button>
            <button type="button" className="menu-btn" onClick={() => setStep('cardio')}><span className="dot" style={{ background: 'var(--cardio)' }} />Кардио</button>
            <button type="button" className="menu-btn" onClick={() => setStep('complex')}><span className="dot" style={{ background: 'var(--conditioning)' }} />Комплекс</button>
            <button type="button" className="menu-btn" onClick={() => setStep('mobility')}><span className="dot" style={{ background: 'var(--mobility)' }} />Мобильность или кор</button>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Отмена</button>
          </>
        ) : null}
        {step === 'cardio' ? (
          <>
            <h2 className="sheet__title">Кардио</h2>
            <div className="sheet__row">
              <span className="sheet__label">РОЛЬ</span>
              <div className="chips chips--wrap">{CARDIO_ROLES.map((r) => <Chip key={r} on={role === r} onClick={() => setRole(r)}>{ROLE_LABELS[r]}</Chip>)}</div>
            </div>
            <div className="sheet__row">
              <span className="sheet__label">ВИД</span>
              <div className="chips chips--wrap">
                {MODALITIES.map((m) => <button key={m} type="button" className="chip" onClick={() => { ctx.update((t) => addCardio(t, m, role)); onClose(); }}>{MODALITY_LABELS[m]}</button>)}
              </div>
            </div>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setStep('menu')}>Назад</button>
          </>
        ) : null}
        {step === 'complex' ? (
          <>
            <h2 className="sheet__title">Комплекс</h2>
            <button type="button" className="menu-btn" onClick={() => { ctx.update((t) => addQueuedComplex(t)); onClose(); }}><span className="dot" style={{ background: 'var(--conditioning)' }} />Следующий из очереди комплексов</button>
            <button type="button" className="menu-btn" onClick={() => { ctx.update((t) => addFixedComplex(t, { name: 'Комплекс', format: 'AMRAP' })); onClose(); }}><span className="dot" style={{ background: 'var(--conditioning)' }} />Свой комплекс</button>
            <ul className="ex-list">
              {ctx.complexes.map((c) => (
                <li key={c.id}>
                  <button type="button" className="pick-row" onClick={() => { ctx.update((t) => addFixedComplex(t, c)); onClose(); }}>
                    <span className="pick-row__text"><span className="pick-row__name">{c.id} · {c.title}</span><span className="pick-row__sub">{c.description.slice(0, 80)}{c.description.length > 80 ? '…' : ''}</span></span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setStep('menu')}>Назад</button>
          </>
        ) : null}
      </section>
    </>
  );
}

const blockLabel = (b: Block): { label: string; color: string; aria: string } =>
  b.type === 'strength' ? { label: b.superset ? 'Суперсет' : 'Сила', color: 'var(--strength)', aria: '' }
  : b.type === 'cardio' ? { label: `Кардио · ${ROLE_LABELS[b.role]}`, color: 'var(--cardio)', aria: '' }
  : b.type === 'conditioning' ? { label: 'Комплекс', color: 'var(--conditioning)', aria: '' }
  : { label: 'Мобильность', color: 'var(--mobility)', aria: '' };

/** Редактор шаблона: блоки с плановыми значениями, отметка «в короткой версии», порядок, удаление. */
export function TemplateEditor(): ReactElement {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { draft, status, update, flush, saveError } = useRecordDraft<TemplateDraft>('templates', parseTemplate, id);
  const catalogList = useCatalog();
  const sessions = useSessions();
  const complexes = useComplexes();
  const catalog = useMemo(() => new Map(catalogList.map((e) => [e.id, e])), [catalogList]);
  const [adding, setAdding] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const leave = async (): Promise<void> => {
    await flush();
    if (location.key === 'default') navigate('/programs', { replace: true });
    else navigate(-1);
  };

  if (status === 'loading') return <div className="fullscreen" aria-busy="true" />;
  if (status === 'missing' || !draft) {
    return (
      <div className="fullscreen tpl">
        <p className="stub">Шаблон не найден: возможно, он удалён.</p>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={() => navigate('/programs', { replace: true })}>К программам</button>
      </div>
    );
  }

  const ctx: Ctx = { catalog, catalogList, sessions: sessions ?? [], complexes: complexes ?? [], update };

  return (
    <div className="fullscreen tpl">
      <header className="imp__head">
        <button type="button" className="round-btn round-btn--light" aria-label="Назад" onClick={() => void leave()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <h1 className="imp__title">Шаблон</h1>
      </header>

      {saveError ? <p className="login__error sheet__error" role="alert">Не удалось сохранить: {saveError}</p> : null}

      <div className="tpl__body">
        <label className="field-col">
          <span className="sheet__label">НАЗВАНИЕ</span>
          <input className="field" aria-label="Название шаблона" defaultValue={draft.title} maxLength={200} onBlur={(e) => { const v = e.target.value.trim(); if (v === '') e.target.value = draft.title; else if (v !== draft.title) update((t) => updateTemplate(t, { title: v })); }} />
        </label>
        <div className="two">
          <label className="field-col">
            <span className="sheet__label">ПОДЗАГОЛОВОК</span>
            <input className="field" aria-label="Подзаголовок" placeholder="Всё тело A" defaultValue={draft.subtitle ?? ''} maxLength={200} onBlur={(e) => { if (e.target.value.trim() !== (draft.subtitle ?? '')) update((t) => updateTemplate(t, { subtitle: e.target.value.trim() })); }} />
          </label>
          <label className="field-col">
            <span className="sheet__label">ДЛИТЕЛЬНОСТЬ</span>
            <input className="field" aria-label="Длительность" placeholder="65–70 мин" defaultValue={draft.durationHint ?? ''} maxLength={200} onBlur={(e) => { if (e.target.value.trim() !== (draft.durationHint ?? '')) update((t) => updateTemplate(t, { durationHint: e.target.value.trim() })); }} />
          </label>
        </div>

        {draft.blocks.length === 0 ? <p className="stub">Блоков пока нет. Добавьте упражнения, кардио, комплекс или мобильность.</p> : null}

        {draft.blocks.map((b, i) => {
          const l = blockLabel(b);
          const aria = b.type === 'strength' ? `Блок: ${b.superset ? 'суперсет' : nameOf(ctx, b.items[0]!.exerciseId)}` : b.type === 'cardio' ? `Блок: ${b.name ?? MODALITY_LABELS[b.modality]}` : b.type === 'conditioning' ? 'Блок: комплекс' : 'Блок: мобильность';
          return (
            <BlockShell
              key={b.id}
              label={`Блок ${i + 1} · ${l.label}`}
              colorVar={l.color}
              index={i}
              count={draft.blocks.length}
              ariaLabel={aria}
              onMove={(d) => update((t) => moveBlock(t, b.id, d))}
              onRemove={() => update((t) => removeBlock(t, b.id))}
            >
              {b.type === 'strength' ? <StrengthEditor block={b} ctx={ctx} /> : null}
              {b.type === 'cardio' ? <CardioEditor block={b} ctx={ctx} /> : null}
              {b.type === 'conditioning' ? <ConditioningEditor block={b} ctx={ctx} /> : null}
              {b.type === 'mobility' ? <MobilityEditor block={b} ctx={ctx} /> : null}
            </BlockShell>
          );
        })}

        <button type="button" className="add-block" onClick={() => setAdding(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Добавить блок
        </button>

        {deleteError ? <p className="login__error sheet__error" role="alert">{deleteError}</p> : null}
        <ConfirmButton
          label="Удалить шаблон"
          confirmLabel="Удалить насовсем?"
          className="htr-btn htr-btn--ghost"
          onConfirm={() => {
            void (async () => {
              await flush();
              const r = await deleteTemplate(draft.id);
              if (r.ok) navigate('/programs', { replace: true });
              else setDeleteError(r.reason);
            })();
          }}
        />
        <button type="button" className="htr-btn htr-btn--primary" onClick={() => void leave()}>Готово</button>
      </div>

      {adding ? <AddBlock ctx={ctx} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
