import type { CatalogExercise } from '@hybridlog/shared';

/**
 * Упражнения автора, которых нет в каталоге RepDB. Входят в статичный каталог (в базе не хранятся);
 * заметки к ним лежат в коллекции exerciseNotes, как и у остальных.
 */
type Own = Omit<CatalogExercise, 'id' | 'muscles' | 'perSide' | 'isCustom' | 'aliases'> &
  Partial<Pick<CatalogExercise, 'muscles' | 'perSide' | 'aliases'>>;

function own(slug: string, e: Own): CatalogExercise {
  return {
    id: `hybridlog:${slug}`,
    aliases: [],
    muscles: { primary: [], secondary: [] },
    perSide: false,
    isCustom: true,
    ...e,
  };
}

export const OWN_EXERCISES: CatalogExercise[] = [
  own('core-complex', {
    name: 'Кор-комплекс',
    aliases: ['Кор', 'Кор + таз', 'Кор + ягодицы', 'Кор, твой комплекс', 'Пресс, комплекс', 'Пресс, комплекс х 2'],
    kind: 'core',
    equipment: 'bodyweight',
    metrics: 'time',
    muscles: { primary: ['rectus_abdominis', 'transverse_abdominis'], secondary: ['obliques', 'gluteus_maximus'] },
  }),
  own('pelvis-mobility', {
    name: 'Мобильность таза',
    aliases: ['Мобильность ТБС', 'Мобильность таза, комплекс', 'Мобильность ТБС, Кор', 'Растяжка'],
    kind: 'mobility',
    equipment: 'bodyweight',
    metrics: 'time',
    muscles: { primary: ['hip_flexors'], secondary: ['gluteus_medius'] },
  }),
  own('machine-squat', {
    name: 'Присед в тренажёре',
    aliases: ['Приседания в тренажере', 'Присед в тренажере', 'Приседания в тренажёре'],
    kind: 'strength',
    equipment: 'machine',
    metrics: 'weight_reps',
    muscles: { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['hamstrings'] },
  }),
  own('side-back-extension', {
    name: 'Боковая гиперэкстензия',
    aliases: ['Гиперэкстензия, бок', 'Гиперэкстензия боковая'],
    kind: 'strength',
    equipment: 'bodyweight',
    metrics: 'reps',
    perSide: true,
    muscles: { primary: ['obliques', 'quadratus_lumborum'], secondary: ['erector_spinae'] },
  }),
  own('glute-airplane', {
    name: 'Самолёт для ягодиц',
    aliases: ['Самолет ягодицы', 'Самолёт', 'Самолет'],
    kind: 'core',
    equipment: 'bodyweight',
    metrics: 'reps',
    perSide: true,
    muscles: { primary: ['gluteus_medius'], secondary: ['gluteus_maximus', 'hamstrings'] },
  }),
  own('pallof-press', {
    name: 'Pallof press с резинкой',
    aliases: ['Payoff press (с резинкой)', 'Payoff press', 'Pallof press'],
    kind: 'core',
    equipment: 'band',
    metrics: 'reps',
    perSide: true,
    muscles: { primary: ['obliques', 'transverse_abdominis'], secondary: [] },
  }),
  own('hip-lift-blocks', {
    name: 'Подъём таза стоя на кубиках',
    aliases: ['Подьем таза стоя на кубиках'],
    kind: 'strength',
    equipment: 'bodyweight',
    metrics: 'reps',
    muscles: { primary: ['gluteus_maximus'], secondary: ['hamstrings'] },
  }),
  own('leg-abduction-cushion', {
    name: 'Отведение ноги с подушкой',
    aliases: [],
    kind: 'mobility',
    equipment: 'none',
    metrics: 'time',
    perSide: true,
    muscles: { primary: ['abductors'], secondary: ['gluteus_medius'] },
  }),
];
