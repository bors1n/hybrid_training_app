import type { CatalogExercise } from '@splav/shared';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Chip } from '../../components/Chip.tsx';
import { defaultMetrics, EQUIPMENT_LABELS, KIND_LABELS, type Equipment, type Kind } from '../../domain/catalogFilter.ts';
import { normalizeName } from '../../domain/matching.ts';
import { saveRecord } from '../../sync/records.ts';

interface Props {
  existing: readonly CatalogExercise[];
  onClose: () => void;
  onCreated: (e: CatalogExercise) => void;
}

const kinds = Object.keys(KIND_LABELS) as Kind[];
const equipments = Object.keys(EQUIPMENT_LABELS) as Equipment[];

export function NewExerciseSheet({ existing, onClose, onCreated }: Props): ReactElement {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('strength');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [perSide, setPerSide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return setError('Введите название');
    const key = normalizeName(trimmed);
    if (existing.some((x) => normalizeName(x.name) === key)) return setError('Упражнение с таким названием уже есть');
    const content = {
      name: trimmed,
      aliases: [],
      kind,
      equipment,
      muscles: { primary: [], secondary: [] },
      perSide,
      metrics: defaultMetrics(kind),
      isCustom: true as const,
    };
    const row = await saveRecord('exercises', { id: crypto.randomUUID(), ...content });
    onCreated({ ...content, id: row.id });
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <form className="sheet sheet--tall" role="dialog" aria-modal="true" aria-label="Своё упражнение" onSubmit={(ev) => void submit(ev)}>
        <h2 className="sheet__title">Своё упражнение</h2>

        <label className="sheet__row">
          <span className="sheet__label">НАЗВАНИЕ</span>
          <input className="field" value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Фермерская прогулка 2 × 24" maxLength={200} autoFocus />
        </label>

        <div className="sheet__row">
          <span className="sheet__label">ТИП</span>
          <div className="chips chips--wrap">
            {kinds.map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABELS[k]}</Chip>
            ))}
          </div>
        </div>

        <div className="sheet__row">
          <span className="sheet__label">ОБОРУДОВАНИЕ</span>
          <div className="chips chips--wrap">
            {equipments.map((q) => (
              <Chip key={q} on={equipment === q} onClick={() => setEquipment(q)}>{EQUIPMENT_LABELS[q]}</Chip>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={perSide} onChange={(ev) => setPerSide(ev.target.checked)} />
          Повторы на каждую сторону
        </label>

        {error ? <p className="login__error sheet__error" role="alert">{error}</p> : null}
        <button type="submit" className="htr-btn htr-btn--primary">Сохранить</button>
        <button type="button" className="htr-btn htr-btn--secondary" onClick={onClose}>Отмена</button>
      </form>
    </>
  );
}
