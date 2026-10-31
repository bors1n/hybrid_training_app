import { ComplexRecordSchema, MODALITIES, CARDIO_ROLES, type CardioBlock, type ComplexRecord } from '@hybridlog/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { normalizeName } from '../../domain/matching.ts';
import { ROLE_LABELS, MODALITY_LABELS, addCardioBlock, addConditioningBlock, addMobilityItem, addStrengthBlock, copySet } from '../../domain/sessionEdit.ts';
import { listRecords } from '../../sync/records.ts';
import type { WorkoutCtx } from './ctx.ts';
import { ExercisePicker } from './ExercisePicker.tsx';
import { lastPerformanceFor } from './StrengthCard.tsx';

type Step = 'menu' | 'strength' | 'cardio' | 'complex' | 'mobility';

interface Props {
  ctx: WorkoutCtx;
  onClose: () => void;
}

function useComplexes(): ComplexRecord[] {
  const rows = useLiveQuery(() => listRecords('complexes'), [], []);
  return useMemo(
    () =>
      rows
        .flatMap((r) => {
          const p = ComplexRecordSchema.safeParse(r);
          return p.success ? [p.data] : [];
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    [rows],
  );
}

export function AddBlockSheet({ ctx, onClose }: Props): ReactElement {
  const [step, setStep] = useState<Step>('menu');
  const [role, setRole] = useState<CardioBlock['role']>('main');
  const [query, setQuery] = useState('');
  const complexes = useComplexes();

  const shownComplexes = useMemo(() => {
    const words = normalizeName(query).split(' ').filter(Boolean);
    return complexes.filter((c) => {
      const hay = normalizeName(`${c.id} ${c.title} ${c.description}`);
      return words.every((w) => hay.includes(w));
    });
  }, [complexes, query]);

  if (step === 'strength') {
    return (
      <ExercisePicker
        title="Силовое упражнение"
        catalog={ctx.catalogList}
        sessions={ctx.sessions}
        onClose={onClose}
        onPick={(e) => {
          const prev = lastPerformanceFor(ctx, e.id);
          ctx.update((s) => addStrengthBlock(s, { exerciseId: e.id, perSide: e.perSide || undefined, ...(prev ? { sets: [copySet(prev)] } : {}) }));
          onClose();
        }}
      />
    );
  }

  if (step === 'mobility') {
    return (
      <ExercisePicker
        title="Мобильность и кор"
        catalog={ctx.catalogList}
        sessions={ctx.sessions}
        kinds={['mobility', 'core']}
        onClose={onClose}
        onPick={(e) => {
          ctx.update((s) => addMobilityItem(s, e.id));
          onClose();
        }}
      />
    );
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section
        className="sheet sheet--tall"
        role="dialog"
        aria-modal="true"
        aria-label={step === 'cardio' ? 'Кардио' : step === 'complex' ? 'Комплекс' : 'Добавить блок'}
      >
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
              <span className="sheet__label">Роль</span>
              <div className="chips chips--wrap">
                {CARDIO_ROLES.map((r) => (
                  <Chip key={r} on={role === r} onClick={() => setRole(r)}>{ROLE_LABELS[r]}</Chip>
                ))}
              </div>
            </div>
            <div className="sheet__row">
              <span className="sheet__label">Вид</span>
              <div className="chips chips--wrap">
                {MODALITIES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chip"
                    onClick={() => {
                      ctx.update((s) => addCardioBlock(s, m, role));
                      onClose();
                    }}
                  >
                    {MODALITY_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setStep('menu')}>Назад</button>
          </>
        ) : null}

        {step === 'complex' ? (
          <>
            <h2 className="sheet__title">Комплекс</h2>
            <label className="search">
              <input type="search" aria-label="Поиск комплекса" placeholder="Номер или название…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button
              type="button"
              className="menu-btn"
              onClick={() => {
                ctx.update((s) => addConditioningBlock(s, { name: 'Комплекс', format: 'AMRAP' }));
                onClose();
              }}
            >
              <span className="dot" style={{ background: 'var(--conditioning)' }} />Свой комплекс (не из библиотеки)
            </button>
            <ul className="ex-list">
              {shownComplexes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="pick-row"
                    onClick={() => {
                      ctx.update((s) =>
                        addConditioningBlock(s, {
                          complexId: c.id,
                          name: c.title,
                          format: c.format,
                          ...(c.timeCapMin !== undefined ? { timeCapMin: c.timeCapMin } : {}),
                          description: c.description,
                        }),
                      );
                      onClose();
                    }}
                  >
                    <span className="pick-row__text">
                      <span className="pick-row__name">{c.id} · {c.title}</span>
                      <span className="pick-row__sub">{c.description.slice(0, 90)}{c.description.length > 90 ? '…' : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {shownComplexes.length === 0 ? <p className="stub">Библиотека комплексов пуста или ничего не найдено.</p> : null}
            <button type="button" className="htr-btn htr-btn--secondary" onClick={() => setStep('menu')}>Назад</button>
          </>
        ) : null}
      </section>
    </>
  );
}
