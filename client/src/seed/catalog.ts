import type { CatalogExercise, ExerciseContent } from '@hybridlog/shared';
import ruNames from './catalog.ru.json';
import { OWN_EXERCISES } from './ownExercises.ts';
import { PROGRAM_EXERCISES } from './programExercises.ts';

/** Запись из client/src/seed/generated/catalog.json (собирается скриптом `npm run seed:media`, в git не лежит). */
export interface GeneratedExercise {
  slug: string;
  nameEn: string;
  kind: ExerciseContent['kind'];
  equipment: ExerciseContent['equipment'];
  muscles: { primary: string[]; secondary: string[] };
  perSide: boolean;
  metrics: ExerciseContent['metrics'];
  image?: string;
  imageStart?: string;
}

export const MEDIA_BASE = '/media/repdb/flat/';
export const MEDIA_SOURCE = 'repdb';
export const MEDIA_LICENSE = 'RepDB Free Tier (attribution required)';
export const REPDB_ATTRIBUTION = 'Exercise data by RepDB (repdb.co)';
export const REPDB_URL = 'https://repdb.co';

/**
 * Каталог = RepDB (если собран) + упражнения автора. Русское название: сначала проверенное вручную
 * (programExercises), затем перевод (catalog.ru.json), затем английское. Английское название
 * остаётся псевдонимом, чтобы поиск и импорт находили упражнение и по нему.
 */
export function buildCatalog(
  generated: readonly GeneratedExercise[],
  ru: Readonly<Record<string, string>> = ruNames,
  program: typeof PROGRAM_EXERCISES = PROGRAM_EXERCISES,
): CatalogExercise[] {
  const repdb = generated.map((g): CatalogExercise => {
    const manual = program[g.slug];
    const name = manual?.name ?? ru[g.slug] ?? g.nameEn;
    const aliases = [g.nameEn, ru[g.slug], ...(manual?.aliases ?? [])].filter(
      (a, i, all): a is string => Boolean(a) && a !== name && all.indexOf(a) === i,
    );
    return {
      id: `repdb:${g.slug}`,
      name,
      aliases,
      kind: g.kind,
      equipment: g.equipment,
      muscles: g.muscles,
      perSide: g.perSide,
      metrics: g.metrics,
      isCustom: false,
      ...(g.image
        ? {
            media: {
              image: MEDIA_BASE + g.image,
              ...(g.imageStart ? { imageStart: MEDIA_BASE + g.imageStart } : {}),
              source: MEDIA_SOURCE,
              license: MEDIA_LICENSE,
            },
          }
        : {}),
    };
  });
  return [...repdb, ...OWN_EXERCISES];
}

const generatedModules = import.meta.glob<GeneratedExercise[]>('./generated/catalog.json', { eager: true, import: 'default' });
const generated = Object.values(generatedModules)[0] ?? [];

/** true, если каталог RepDB собран; иначе доступны только упражнения автора. */
export const HAS_REPDB_CATALOG = generated.length > 0;

export const CATALOG: CatalogExercise[] = buildCatalog(generated);
export const CATALOG_BY_ID: ReadonlyMap<string, CatalogExercise> = new Map(CATALOG.map((e) => [e.id, e]));
