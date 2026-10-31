import type { CatalogExercise, ExerciseContent } from '@hybridlog/shared';
import { normalizeName } from './matching.ts';

export type Kind = ExerciseContent['kind'];
export type Equipment = ExerciseContent['equipment'];

export const KIND_LABELS: Record<Kind, string> = {
  strength: 'Сила',
  bodyweight: 'Свой вес',
  cardio: 'Кардио',
  core: 'Кор',
  mobility: 'Мобильность',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Штанга',
  dumbbell: 'Гантели',
  kettlebell: 'Гиря',
  machine: 'Тренажёр',
  cable: 'Блок',
  smith: 'Смит',
  bodyweight: 'Собственный вес',
  band: 'Резинка',
  erg: 'Эргометр',
  none: 'Без оборудования',
};

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  arms: 'Руки',
  legs: 'Ноги',
  glutes: 'Ягодицы',
  core: 'Кор',
};

/** Мышцы RepDB по группам. */
const GROUP_OF: Record<string, MuscleGroup> = {
  pectoralis_major: 'chest',
  latissimus_dorsi: 'back',
  rhomboids: 'back',
  trapezius: 'back',
  erector_spinae: 'back',
  quadratus_lumborum: 'back',
  anterior_deltoid: 'shoulders',
  lateral_deltoid: 'shoulders',
  posterior_deltoid: 'shoulders',
  supraspinatus: 'shoulders',
  biceps_brachii: 'arms',
  triceps_brachii: 'arms',
  brachialis: 'arms',
  brachioradialis: 'arms',
  forearm_flexors: 'arms',
  forearm_extensors: 'arms',
  forearms: 'arms',
  quadriceps: 'legs',
  hamstrings: 'legs',
  gastrocnemius: 'legs',
  soleus: 'legs',
  tibialis_anterior: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  hip_flexors: 'legs',
  gluteus_maximus: 'glutes',
  gluteus_medius: 'glutes',
  rectus_abdominis: 'core',
  transverse_abdominis: 'core',
  obliques: 'core',
  serratus_anterior: 'core',
};

export const MUSCLE_LABELS: Record<string, string> = {
  pectoralis_major: 'грудь',
  latissimus_dorsi: 'широчайшие',
  rhomboids: 'ромбовидные',
  trapezius: 'трапеции',
  erector_spinae: 'разгибатели спины',
  quadratus_lumborum: 'квадратная мышца поясницы',
  anterior_deltoid: 'передние дельты',
  lateral_deltoid: 'средние дельты',
  posterior_deltoid: 'задние дельты',
  supraspinatus: 'надостная',
  biceps_brachii: 'бицепс',
  triceps_brachii: 'трицепс',
  brachialis: 'брахиалис',
  brachioradialis: 'плечелучевая',
  forearm_flexors: 'сгибатели предплечья',
  forearm_extensors: 'разгибатели предплечья',
  forearms: 'предплечья',
  quadriceps: 'квадрицепс',
  hamstrings: 'задняя поверхность бедра',
  gastrocnemius: 'икры',
  soleus: 'камбаловидная',
  tibialis_anterior: 'передняя большеберцовая',
  adductors: 'приводящие',
  abductors: 'отводящие',
  hip_flexors: 'сгибатели бедра',
  gluteus_maximus: 'большая ягодичная',
  gluteus_medius: 'средняя ягодичная',
  rectus_abdominis: 'пресс',
  transverse_abdominis: 'поперечная мышца живота',
  obliques: 'косые мышцы',
  serratus_anterior: 'зубчатая',
};

export const muscleLabel = (key: string): string => MUSCLE_LABELS[key] ?? key.replace(/_/g, ' ');

/** Группы, в которые входят основные мышцы упражнения. */
export function muscleGroups(e: Pick<CatalogExercise, 'muscles'>): MuscleGroup[] {
  const groups = new Set<MuscleGroup>();
  for (const m of e.muscles.primary) {
    const g = GROUP_OF[m];
    if (g) groups.add(g);
  }
  return [...groups];
}

/** Цвет вида: у каждого свой токен; комплекс — цвет типа «комплекс». */
export function kindColorVar(kind: Kind | 'complex'): string {
  return { strength: 'var(--strength)', bodyweight: 'var(--bodyweight)', cardio: 'var(--cardio)', core: 'var(--core)', mobility: 'var(--mobility)', complex: 'var(--conditioning)' }[kind];
}

export interface CatalogFilter {
  query: string;
  kind: Kind | null;
  group: MuscleGroup | null;
  equipment: Equipment | null;
  onlyCustom: boolean;
}

export const EMPTY_FILTER: CatalogFilter = { query: '', kind: null, group: null, equipment: null, onlyCustom: false };

/**
 * Поиск: все слова запроса должны встретиться в одном названии или в одном псевдониме
 * (ё/е и регистр не важны). Слова из разных псевдонимов не складываются: так поиск не шумит.
 */
export function filterCatalog(items: readonly CatalogExercise[], f: CatalogFilter): CatalogExercise[] {
  const words = normalizeName(f.query).split(' ').filter(Boolean);
  return items.filter((e) => {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.equipment && e.equipment !== f.equipment) return false;
    if (f.onlyCustom && !e.isCustom) return false;
    if (f.group && !muscleGroups(e).includes(f.group)) return false;
    if (words.length === 0) return true;
    return [e.name, ...e.aliases].some((label) => {
      const n = normalizeName(label);
      return words.every((w) => n.includes(w));
    });
  });
}

/** Результаты поиска: сначала те, у кого запрос в начале названия. Остальной порядок сохраняется. */
export function rankByQuery(items: CatalogExercise[], query: string): CatalogExercise[] {
  const q = normalizeName(query);
  if (!q) return items;
  const score = (e: CatalogExercise): number => {
    const n = normalizeName(e.name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(' ').some((w) => w.startsWith(q))) return 2;
    return 3;
  };
  return items.map((e, i) => ({ e, i, s: score(e) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.e);
}

/** Режим ввода по типу упражнения для новых своих упражнений. */
export function defaultMetrics(kind: Kind): ExerciseContent['metrics'] {
  if (kind === 'cardio') return 'distance_time';
  if (kind === 'mobility') return 'time';
  if (kind === 'bodyweight' || kind === 'core') return 'reps';
  return 'weight_reps';
}
