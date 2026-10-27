import type { PlanSets, QueueRecord, TemplateBlock, TemplateRecord } from '@splav/shared';

type Seed<T> = Omit<T, 'updatedAt' | 'deletedAt'>;

const ex = (slug: string): string => `repdb:${slug}`;
const own = (slug: string): string => `splav:${slug}`;

let seq = 0;
const bid = (prefix: string): string => `${prefix}-${++seq}`;

/** Упражнение: 3 подхода по 6–8 с весом. */
const sets = (p: Omit<PlanSets, 'load'> & { load?: PlanSets['load'] }): PlanSets => ({ load: 'normal', ...p });

function strength(
  slug: string,
  plan: Omit<PlanSets, 'load'> & { load?: PlanSets['load'] },
  opts: { inShort?: boolean; note?: string; id?: string } = {},
): TemplateBlock {
  return {
    type: 'strength',
    id: opts.id ?? bid('s'),
    superset: false,
    items: [{ exerciseId: ex(slug), plan: sets(plan), ...(opts.note ? { note: opts.note } : {}) }],
    inShort: opts.inShort ?? true,
  };
}

function superset(
  items: { exerciseId: string; plan: Omit<PlanSets, 'load'> }[],
  opts: { inShort?: boolean } = {},
): TemplateBlock {
  return {
    type: 'strength',
    id: bid('ss'),
    superset: true,
    items: items.map((i) => ({ exerciseId: i.exerciseId, plan: sets(i.plan) })),
    inShort: opts.inShort ?? true,
  };
}

const warmup = (note: string, inShort = true): TemplateBlock => ({
  type: 'cardio',
  id: bid('c'),
  modality: 'treadmill',
  role: 'warmup',
  name: 'Разминка',
  durationSec: 300,
  durationSecMax: 600,
  note,
  inShort,
});

const finisher = (): TemplateBlock => ({
  type: 'cardio',
  id: bid('c'),
  modality: 'treadmill',
  role: 'finisher',
  name: 'Финиш: зона 2',
  durationSec: 900,
  note: 'Дорожка, гребля, лестница или вело. Если бегаешь 2 раза в неделю, замени его заминкой 5–10 мин.',
  inShort: false,
});

const mobility = (items: { slug: string; note?: string }[], min: number, max: number | undefined, inShort = true): TemplateBlock => ({
  type: 'mobility',
  id: bid('m'),
  items: items.map((i) => ({ exerciseId: own(i.slug), ...(i.note ? { note: i.note } : {}) })),
  durationSec: min * 60,
  ...(max ? { durationSecMax: max * 60 } : {}),
  inShort,
});

const T1: Seed<TemplateRecord> = {
  id: 'seed:template:t1',
  title: 'Тренировка 1',
  subtitle: 'Всё тело A',
  durationHint: 'около 65–70 мин с заминкой или около 80 мин с финишем зоны 2',
  blocks: [
    warmup('Дорожка, гребля или лестница, затем мобильность таза.'),
    mobility([{ slug: 'pelvis-mobility' }], 3, 5),
    strength('squat', { sets: 3, repsMin: 6, repsMax: 8, weightKg: 85 }, { note: 'Перед первым силовым упражнением 2 разминочных подхода.' }),
    strength('bench-press', { sets: 3, repsMin: 6, repsMax: 8, weightKg: 80 }),
    strength('seated-cable-row', { sets: 3, repsMin: 10, repsMax: 12, weightKg: 59 }),
    strength('db-lunge', { sets: 3, repsMin: 10, repsMax: 12, weightKg: 14, weightKgMax: 16, perSide: true }, { inShort: false }),
    superset(
      [
        { exerciseId: ex('tricep-pushdown'), plan: { sets: 3, repsMin: 12, repsMax: 15, weightKg: 27, weightKgMax: 32 } },
        { exerciseId: ex('cable-lateral-raise'), plan: { sets: 3, repsMin: 12, repsMax: 15, weightKg: 6.8 } },
      ],
      { inShort: false },
    ),
    {
      type: 'strength',
      id: bid('s'),
      superset: false,
      items: [{ exerciseId: own('side-back-extension'), plan: sets({ sets: 2, repsMin: 12, repsMax: 15, perSide: true }) }],
      inShort: false,
    },
    mobility([{ slug: 'core-complex', note: 'Планка, dead bug, ягодичный мост, «самолёт»' }], 8, 10),
    finisher(),
  ],
};

const T2: Seed<TemplateRecord> = {
  id: 'seed:template:t2',
  title: 'Тренировка 2',
  subtitle: 'Всё тело B',
  durationHint: 'около 60 мин с заминкой или около 70 мин с финишем',
  blocks: [
    warmup('Дорожка, гребля или лестница, затем резинка.'),
    strength('deadlift', { sets: 3, repsMin: 6, repsMax: 8, weightKg: 85 }, { note: 'Перед первым силовым упражнением 2 разминочных подхода.' }),
    strength(
      'pull-up',
      { sets: 3, repsMin: 6, repsMax: 8, weightKg: 5, weightKgMax: 10, load: 'added' },
      {
        note: 'Нет пояса: строго 3 × 12–15 с паузой 2 с вверху. Через раз можно заменять тягой блока вертикальной: 73 кг — 3 × 10–12.',
      },
    ),
    strength('ohp', { sets: 3, repsMin: 6, repsMax: 8, weightKg: 55 }),
    strength('back-extension', { sets: 3, repsMin: 12, repsMax: 15 }, {
      note: 'Когда 15 даётся легко, бери блин. Вверху тело в одну линию, без прогиба в пояснице.',
    }),
    superset(
      [
        { exerciseId: ex('bicep-curl'), plan: { sets: 3, repsMin: 12, repsMax: 15, weightKg: 16 } },
        { exerciseId: ex('hanging-leg-raise'), plan: { sets: 3, repsMin: 12, repsMax: 15 } },
      ],
      { inShort: false },
    ),
    strength('smith-machine-calf-raise', { sets: 3, repsMin: 15, repsMax: 20, weightKg: 45 }, { inShort: false }),
    finisher(),
  ],
};

const T3: Seed<TemplateRecord> = {
  id: 'seed:template:t3',
  title: 'Тренировка 3',
  subtitle: 'Комплексы и спринты',
  durationHint: '40–55 мин',
  blocks: [
    warmup('Дорожка или гребля, мобильность таза, затем 2–3 лёгких раунда движений из комплекса.'),
    { type: 'conditioning', id: bid('k'), fromQueue: true, inShort: true },
    {
      type: 'conditioning',
      id: bid('k'),
      fromQueue: false,
      name: 'Спринты',
      format: 'INTERVALS',
      description:
        '6 × 40 с работы / 40 с отдыха (SkiErg, гребля или дорожка), через 2–3 мин после комплекса. Не нужны после интервальных комплексов (#004, #009, #017, #021) и в разгрузочном цикле.',
      inShort: true,
    },
    mobility([{ slug: 'pelvis-mobility' }], 5, 10),
  ],
};

export const TEMPLATES: Seed<TemplateRecord>[] = [T1, T2, T3];

export const QUEUE: Seed<QueueRecord> = {
  id: 'seed:queue:cycle',
  title: 'Цикл Т1 → Т2 → Т3',
  templateIds: TEMPLATES.map((t) => t.id),
};
