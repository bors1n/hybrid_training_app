import { RECORD_SCHEMAS, type CatalogExercise, type TemplateBlock } from '@splav/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMatcher } from '../domain/matching.ts';
import { SplavDB, getMeta } from '../data/db.ts';
import { deleteRecord, listRecords, saveRecord } from '../sync/records.ts';
import { buildCatalog, CATALOG, CATALOG_BY_ID, HAS_REPDB_CATALOG, type GeneratedExercise } from './catalog.ts';
import { COMPLEX_QUEUE_ORDER, COMPLEXES } from './complexes.ts';
import { COMPLEX_QUEUE_ID, ensureSeed, SEED_META_KEY, SEED_UPDATED_AT, seedRecords } from './install.ts';
import { OWN_EXERCISES } from './ownExercises.ts';
import { PROGRAM_EXERCISES } from './programExercises.ts';
import { TEMPLATES } from './templates.ts';

const repdb = it.skipIf(!HAS_REPDB_CATALOG);

describe('комплексы #001–#024', () => {
  it('24 комплекса с id #001…#024 и описанием', () => {
    expect(COMPLEXES).toHaveLength(24);
    expect(COMPLEXES.map((c) => c.id)).toEqual(Array.from({ length: 24 }, (_, i) => `#${String(i + 1).padStart(3, '0')}`));
    for (const c of COMPLEXES) expect(c.description.length, c.id).toBeGreaterThan(10);
  });
  it('форматы из программы', () => {
    const f = (id: string) => COMPLEXES.find((c) => c.id === id)!;
    expect(f('#001').format).toBe('EMOM');
    expect(f('#002')).toMatchObject({ format: 'AMRAP', timeCapMin: 20 });
    expect(f('#004')).toMatchObject({ format: 'TABATA', timeCapMin: 8 });
    expect(f('#005')).toMatchObject({ format: 'AMRAP', timeCapMin: 15 });
    expect(f('#007')).toMatchObject({ format: 'FOR_TIME', timeCapMin: 20 });
    expect(f('#008').format).toBe('LADDER');
    expect(f('#017').format).toBe('INTERVALS');
  });
  it('интервальные комплексы — те же, что названы в программе: #004, #009, #017, #021', () => {
    expect(COMPLEXES.filter((c) => c.tags.includes('интервальный')).map((c) => c.id)).toEqual(['#004', '#009', '#017', '#021']);
  });
  it('очередь в Т3: #001, #002, #003, #005, #006 … #024 (без #004)', () => {
    expect(COMPLEX_QUEUE_ORDER.slice(0, 5)).toEqual(['#001', '#002', '#003', '#005', '#006']);
    expect(COMPLEX_QUEUE_ORDER.at(-1)).toBe('#024');
    expect(COMPLEX_QUEUE_ORDER).toHaveLength(23);
    expect(COMPLEX_QUEUE_ORDER).not.toContain('#004');
  });
});

describe('шаблоны Т1–Т3', () => {
  const [t1, t2, t3] = TEMPLATES as [(typeof TEMPLATES)[0], (typeof TEMPLATES)[0], (typeof TEMPLATES)[0]];
  const strengthIds = (blocks: TemplateBlock[]) =>
    blocks.filter((b) => b.type === 'strength').flatMap((b) => (b.type === 'strength' ? b.items.map((i) => i.exerciseId) : []));

  it('три шаблона с детерминированными id', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['seed:template:t1', 'seed:template:t2', 'seed:template:t3']);
    expect(TEMPLATES.map((t) => t.title)).toEqual(['Тренировка 1', 'Тренировка 2', 'Тренировка 3']);
  });
  it('Т1: присед 85 кг 3×6–8, жим лёжа 80, тяга 59 3×10–12', () => {
    const items = t1.blocks.flatMap((b) => (b.type === 'strength' ? b.items : []));
    const by = (id: string) => items.find((i) => i.exerciseId === id)!.plan;
    expect(by('repdb:squat')).toMatchObject({ sets: 3, repsMin: 6, repsMax: 8, weightKg: 85 });
    expect(by('repdb:bench-press')).toMatchObject({ weightKg: 80, repsMin: 6, repsMax: 8 });
    expect(by('repdb:seated-cable-row')).toMatchObject({ weightKg: 59, repsMin: 10, repsMax: 12 });
    expect(by('repdb:db-lunge')).toMatchObject({ weightKg: 14, weightKgMax: 16, perSide: true });
  });
  it('Т1: суперсет трицепс + боковые подъёмы, 3 раунда', () => {
    const ss = t1.blocks.find((b) => b.type === 'strength' && b.superset);
    expect(ss).toBeDefined();
    if (ss?.type === 'strength') {
      expect(ss.items.map((i) => i.exerciseId)).toEqual(['repdb:tricep-pushdown', 'repdb:cable-lateral-raise']);
      expect(ss.items.every((i) => i.plan.sets === 3)).toBe(true);
    }
  });
  it('Т2: подтягивания с отягощением +5–10 кг (load=added), жим стоя 55', () => {
    const items = t2.blocks.flatMap((b) => (b.type === 'strength' ? b.items : []));
    expect(items.find((i) => i.exerciseId === 'repdb:pull-up')!.plan).toMatchObject({ load: 'added', weightKg: 5, weightKgMax: 10 });
    expect(items.find((i) => i.exerciseId === 'repdb:ohp')!.plan.weightKg).toBe(55);
    expect(items.find((i) => i.exerciseId === 'repdb:deadlift')!.plan.weightKg).toBe(85);
  });
  it('короткая Т1: пункты 1–3 и 7 (присед, жим, тяга, кор)', () => {
    const short = t1.blocks.filter((b) => b.inShort);
    expect(strengthIds(short)).toEqual(['repdb:squat', 'repdb:bench-press', 'repdb:seated-cable-row']);
    expect(short.some((b) => b.type === 'mobility' && b.items.some((i) => i.exerciseId === 'splav:core-complex'))).toBe(true);
    expect(short.some((b) => b.type === 'cardio' && b.role === 'finisher')).toBe(false);
  });
  it('короткая Т2: пункты 1–4 (становая, подтягивания, жим стоя, гиперэкстензия)', () => {
    expect(strengthIds(t2.blocks.filter((b) => b.inShort))).toEqual(['repdb:deadlift', 'repdb:pull-up', 'repdb:ohp', 'repdb:back-extension']);
  });
  it('Т3: комплекс берётся из очереди, затем спринты', () => {
    const k = t3.blocks.filter((b) => b.type === 'conditioning');
    expect(k).toHaveLength(2);
    expect(k[0]).toMatchObject({ fromQueue: true });
    expect(k[1]).toMatchObject({ name: 'Спринты', format: 'INTERVALS' });
  });
  it('id блоков внутри шаблона уникальны', () => {
    for (const t of TEMPLATES) {
      const ids = t.blocks.map((b) => b.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
    }
  });
});

describe('начальные записи', () => {
  it('все проходят схемы своих коллекций', () => {
    for (const { collection, data } of seedRecords()) {
      const res = RECORD_SCHEMAS[collection].safeParse({ ...data, updatedAt: SEED_UPDATED_AT, deletedAt: null });
      expect(res.success, `${collection}:${data.id} ${res.success ? '' : res.error.issues[0]?.message}`).toBe(true);
    }
  });
  it('состав: 3 шаблона, очередь, 24 комплекса, очередь комплексов', () => {
    const by = (c: string) => seedRecords().filter((r) => r.collection === c).length;
    expect([by('templates'), by('queues'), by('complexes'), by('complexQueue')]).toEqual([3, 1, 24, 1]);
  });
  it('id уникальны внутри коллекции', () => {
    const keys = seedRecords().map((r) => `${r.collection}:${r.data.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('очередь ссылается на существующие шаблоны, очередь комплексов — на существующие комплексы', () => {
    const queue = seedRecords().find((r) => r.collection === 'queues')!.data as unknown as { templateIds: string[] };
    expect(queue.templateIds).toEqual(TEMPLATES.map((t) => t.id));
    const cq = seedRecords().find((r) => r.collection === 'complexQueue')!.data as unknown as { id: string; order: string[] };
    expect(cq.id).toBe(COMPLEX_QUEUE_ID);
    const ids = new Set(COMPLEXES.map((c) => c.id));
    for (const id of cq.order) expect(ids.has(id), id).toBe(true);
  });
});

describe('ссылки на упражнения', () => {
  const referenced = new Set<string>();
  for (const t of TEMPLATES) {
    for (const b of t.blocks) if (b.type === 'strength' || b.type === 'mobility') for (const i of b.items) referenced.add(i.exerciseId);
  }

  it('упражнения автора (splav:*) существуют', () => {
    const own = new Set(OWN_EXERCISES.map((e) => e.id));
    for (const id of referenced) if (id.startsWith('splav:')) expect(own.has(id), id).toBe(true);
  });
  repdb('упражнения RepDB из шаблонов есть в собранном каталоге', () => {
    for (const id of referenced) expect(CATALOG_BY_ID.has(id), id).toBe(true);
  });
  repdb('slug из programExercises есть в каталоге RepDB', () => {
    for (const slug of Object.keys(PROGRAM_EXERCISES)) expect(CATALOG_BY_ID.has(`repdb:${slug}`), slug).toBe(true);
  });
});

describe('каталог', () => {
  const sample: GeneratedExercise[] = [
    { slug: 'squat', nameEn: 'Barbell Back Squat', kind: 'strength', equipment: 'barbell', muscles: { primary: ['quadriceps'], secondary: [] }, perSide: false, metrics: 'weight_reps', image: 'squat-peak.webp', imageStart: 'squat-start.webp' },
    { slug: 'x-move', nameEn: 'X Move', kind: 'core', equipment: 'bodyweight', muscles: { primary: [], secondary: [] }, perSide: true, metrics: 'reps' },
  ];

  it('приоритет названия: ручное → перевод → английское', () => {
    const cat = buildCatalog(sample, { squat: 'Приседания (машинный перевод)', 'x-move': 'Иск' }, { squat: { name: 'Присед со штангой', aliases: ['Присед'] } });
    const squat = cat.find((e) => e.id === 'repdb:squat')!;
    expect(squat.name).toBe('Присед со штангой');
    expect(squat.aliases).toEqual(['Barbell Back Squat', 'Приседания (машинный перевод)', 'Присед']);
    expect(cat.find((e) => e.id === 'repdb:x-move')!.name).toBe('Иск');
    expect(buildCatalog(sample, {}, {}).find((e) => e.id === 'repdb:x-move')!.name).toBe('X Move');
  });
  it('картинки: источник и лицензия сохраняются', () => {
    const squat = buildCatalog(sample, {}, {}).find((e) => e.id === 'repdb:squat')!;
    expect(squat.media).toMatchObject({ image: '/media/repdb/flat/squat-peak.webp', imageStart: '/media/repdb/flat/squat-start.webp', source: 'repdb' });
    expect(squat.media?.license).toContain('RepDB');
    expect(buildCatalog(sample, {}, {}).find((e) => e.id === 'repdb:x-move')!.media).toBeUndefined();
  });
  it('упражнения автора всегда в каталоге и помечены «свои»', () => {
    const cat = buildCatalog([], {}, {});
    expect(cat).toHaveLength(OWN_EXERCISES.length);
    expect(cat.every((e) => e.isCustom)).toBe(true);
  });
  it('id уникальны', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  repdb('в собранном каталоге 650 упражнений RepDB и у каждого есть русское название', () => {
    const fromRepdb = CATALOG.filter((e) => e.id.startsWith('repdb:'));
    expect(fromRepdb).toHaveLength(650);
    // Латиницей оставлены устоявшиеся термины: dead bug, SkiErg, V-ups, push press, 90/90.
    const latinOk = new Set(['repdb:dead-bug', 'repdb:ski-erg', 'repdb:v-ups', 'repdb:push-press', 'repdb:90-90-hold']);
    for (const e of fromRepdb) expect(/[а-яё]/i.test(e.name) || latinOk.has(e.id), `${e.id}: ${e.name}`).toBe(true);
  });
  repdb('русские названия не повторяются (иначе импорт не сможет выбрать упражнение)', () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const e of CATALOG) {
      const key = e.name.toLowerCase().replace(/ё/g, 'е');
      const prev = seen.get(key);
      if (prev) dups.push(`${prev} и ${e.id}: «${e.name}»`);
      else seen.set(key, e.id);
    }
    expect(dups).toEqual([]);
  });
});

describe('сопоставление названий из истории', () => {
  const matcher = createMatcher(CATALOG as readonly CatalogExercise[]);
  const expectId = (name: string, id: string) => expect(matcher.match(name), name).toEqual({ status: 'exact', id });

  it('упражнения автора', () => {
    expectId('Кор-комплекс', 'splav:core-complex');
    expectId('Мобильность ТБС', 'splav:pelvis-mobility');
    expectId('Боковая гиперэкстензия', 'splav:side-back-extension');
    expectId('Самолет ягодицы', 'splav:glute-airplane');
    expectId('Payoff press (с резинкой)', 'splav:pallof-press');
    expectId('Приседания в тренажере', 'splav:machine-squat');
    expectId('Подьем таза стоя на кубиках', 'splav:hip-lift-blocks');
  });

  repdb('названия из workouts_history.md и программы находятся в каталоге', () => {
    const cases: [string, string][] = [
      ['Присед со штангой', 'repdb:squat'],
      ['Жим лежа', 'repdb:bench-press'],
      ['Становая', 'repdb:deadlift'],
      ['Жим стоя', 'repdb:ohp'],
      ['Жим штанги стоя', 'repdb:ohp'],
      ['Тяга горизонтальная', 'repdb:seated-cable-row'],
      ['Тяга горизонтальная (seated row)', 'repdb:seated-cable-row'],
      ['Горизонтальная тяга', 'repdb:seated-cable-row'],
      ['Тяга в тренажере горизонтальная', 'repdb:seated-cable-row'],
      ['Тяга блока вертикальная', 'repdb:lat-pulldown'],
      ['Выпады с гантелями', 'repdb:db-lunge'],
      ['Жим гантелей в верхнем наклоне', 'repdb:incline-db-press'],
      ['Разведение рук в тренажере (fly, настройка угла 4)', 'repdb:machine-chest-fly'],
      ['Разведение рук назад в тренажере (fly)', 'repdb:machine-reverse-fly'],
      ['Боковые подъемы одной рукой в кроссовере на плечо', 'repdb:cable-lateral-raise'],
      ['Трицепс, разгибание в кроссовере, канат', 'repdb:tricep-pushdown'],
      ['Бицепс сидя гантели, классика', 'repdb:seated-dumbbell-curl'],
      ['Бицепс, гантели, стоя, горизонтально', 'repdb:bicep-curl'],
      ['Подъем гантелей на бицепс', 'repdb:bicep-curl'],
      ['Гиперэкстензия', 'repdb:back-extension'],
      ['Подтягивания', 'repdb:pull-up'],
      ['Подтягивания в тренажере', 'repdb:assisted-pull-ups'],
      ['Подтягивания обрт. хват', 'repdb:chin-ups'],
      ['Подтягивания шир. хват', 'repdb:wide-grip-pull-ups'],
      ['Отжимания на брусьях', 'repdb:dips'],
      ['Брусья', 'repdb:dips'],
      ['Отжимания', 'repdb:push-up'],
      ['Подъём на носки в смите', 'repdb:smith-machine-calf-raise'],
      ['Подьем на носки в Смите', 'repdb:smith-machine-calf-raise'],
      ['Жим ногам, свободный тренажер', 'repdb:leg-press'],
      ['Разгибание ног сидя', 'repdb:leg-extension'],
      ['Сгибание ног сидя', 'repdb:seated-leg-curl'],
      ['Румынская тяга', 'repdb:romanian-deadlift'],
      ['Жим в мосту на ягодице, тренажер', 'repdb:plate-loaded-glute-drive'],
      ['Dead Bug', 'repdb:dead-bug'],
      ['Мертвый жук', 'repdb:dead-bug'],
      ['Планка на предплечьях', 'repdb:plank'],
      ['Боковая планка на коленях', 'repdb:side-plank'],
      ['Ягодичный мостик', 'repdb:glute-bridge'],
      ['Подвздошная растяжка', 'repdb:kneeling-hip-flexor-stretch'],
      ['Nordic curls', 'repdb:nordic-hamstring-curl'],
      ['Подъемы ног в висе', 'repdb:hanging-leg-raise'],
    ];
    for (const [name, id] of cases) expectId(name, id);
  });

  it('«Подтягивания с отягощением» и «в гравитроне» — разные упражнения', () => {
    const a = matcher.match('Подтягивания с весом');
    const b = matcher.match('Гравитрон');
    if (HAS_REPDB_CATALOG) {
      expect(a).toEqual({ status: 'exact', id: 'repdb:pull-up' });
      expect(b).toEqual({ status: 'exact', id: 'repdb:assisted-pull-ups' });
    }
  });

  repdb('каждое название и псевдоним из programExercises ведёт к своему упражнению (без коллизий)', () => {
    const bad: string[] = [];
    for (const [slug, p] of Object.entries(PROGRAM_EXERCISES)) {
      for (const label of [p.name, ...p.aliases]) {
        const r = matcher.match(label);
        if (r.status !== 'exact' || r.id !== `repdb:${slug}`) bad.push(`«${label}» → ${JSON.stringify(r)} (ожидалось repdb:${slug})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('псевдонимы упражнений автора ведут к своему упражнению', () => {
    const bad: string[] = [];
    for (const e of OWN_EXERCISES) {
      for (const label of [e.name, ...e.aliases]) {
        const r = matcher.match(label);
        if (r.status !== 'exact' || r.id !== e.id) bad.push(`«${label}» → ${JSON.stringify(r)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('ensureSeed', () => {
  let database: SplavDB;
  beforeEach(async () => {
    database = new SplavDB(`seed-${Math.random()}`);
    await database.open();
  });

  it('создаёт все начальные записи с минимальным updatedAt и ставит их в очередь отправки', async () => {
    expect(await ensureSeed(database)).toBe(seedRecords().length);
    expect(await database.rows('complexes').count()).toBe(24);
    expect(await database.rows('templates').count()).toBe(3);
    expect(await database.outbox.count()).toBe(seedRecords().length);
    const t1 = await database.rows('templates').get('seed:template:t1');
    expect(t1?.updatedAt).toBe(SEED_UPDATED_AT);
    expect(await getMeta(SEED_META_KEY, database)).toBe(1);
  });

  it('повторный вызов ничего не делает', async () => {
    await ensureSeed(database);
    expect(await ensureSeed(database)).toBe(0);
    expect(await database.rows('complexes').count()).toBe(24);
  });

  it('не перезаписывает то, что пришло с сервера или изменено пользователем', async () => {
    await database.rows('templates').put({ ...TEMPLATES[0]!, title: 'Моя Т1', updatedAt: 500, deletedAt: null });
    await ensureSeed(database);
    expect((await database.rows('templates').get('seed:template:t1'))?.['title']).toBe('Моя Т1');
    expect(await database.rows('templates').count()).toBe(3);
  });

  it('удалённую пользователем запись заново не создаёт', async () => {
    await ensureSeed(database);
    await deleteRecord('complexes', '#007', { database });
    await database.meta.clear();
    expect(await ensureSeed(database)).toBe(0);
    expect(await listRecords('complexes', database)).toHaveLength(23);
  });

  it('правка пользователя новее seed', async () => {
    await ensureSeed(database);
    const edited = await saveRecord('complexes', { ...COMPLEXES[4]!, title: 'Мой #005' }, { database });
    expect(edited.updatedAt).toBeGreaterThan(SEED_UPDATED_AT);
  });
});
