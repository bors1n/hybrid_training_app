// Собирает каталог упражнений из бесплатного набора RepDB (https://repdb.co, Free Tier).
//
//   npm run seed:media
//
// Что делает:
//   1. скачивает репозиторий датасета в .cache/repdb-src (если его там нет);
//   2. проверяет, что условия лицензии не изменились;
//   3. пишет client/src/seed/generated/catalog.json  — упрощённый каталог (id, оборудование, мышцы, картинки);
//   4. копирует иллюстрации в client/public/media/repdb/flat/.
//
// Ни каталог, ни картинки не попадают в git (см. .gitignore): лицензия RepDB запрещает распространять
// набор данных как набор данных, разрешено только использование внутри приложения.
// В приложении обязательна видимая подпись «Exercise data by RepDB (repdb.co)».

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const cache = join(root, '.cache', 'repdb-src');
const REPO = 'https://github.com/RepDB/exercise-dataset';

if (!existsSync(join(cache, 'exercises.json'))) {
  console.log(`Скачиваю ${REPO} …`);
  mkdirSync(dirname(cache), { recursive: true });
  execFileSync('git', ['clone', '--depth', '1', REPO, cache], { stdio: 'inherit' });
}

// Условия, на которые рассчитан проект. Если лицензия изменилась — остановиться и перечитать её.
const license = readFileSync(join(cache, 'LICENSE-DATA.md'), 'utf8');
const expected = ['Free Tier License', 'Attribution required', 'No redistribution as a dataset', 'No generative-AI derivation'];
const missing = expected.filter((t) => !license.includes(t));
if (missing.length > 0) {
  console.error('Лицензия RepDB изменилась (не нашёл пункты: ' + missing.join(', ') + '). Перечитайте LICENSE-DATA.md.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(cache, 'exercises.json'), 'utf8')).exercises;

const MACHINE = new Set([
  'ab_crunch_machine', 'assisted_pullup_machine', 'back_extension_machine', 'bicep_curl_machine', 'chest_fly_machine',
  'chest_press_machine', 'dip_machine', 'donkey_calf_raise_machine', 'hack_squat', 'hip_abduction_machine',
  'hip_adduction_machine', 'hip_thrust_machine', 'lat_pulldown_machine', 'leg_curl', 'leg_extension', 'leg_press',
  'pec_deck', 'plate_loaded_dip_machine', 'plate_loaded_lateral_raise_machine', 'preacher_curl_machine',
  'reverse_fly_machine', 'seated_calf_raise_machine', 'seated_row_machine', 'shoulder_press_machine', 'shrug_machine',
  'standing_calf_raise_machine', 'tricep_extension_machine', 'glute_ham_developer', 'plate_loaded_glute_drive',
]);
const ERG = new Set(['rower', 'ski_erg', 'air_bike', 'stationary_bike', 'treadmill', 'elliptical', 'stair_climber', 'bicycle']);
const BODY = new Set(['pull_up_bar', 'dip_station', 'rings', 'suspension_trainer']);

function equipment(e) {
  const q = e.equipment;
  if (!q) return 'bodyweight';
  if (['barbell', 'ez_bar', 'trap_bar', 'plates'].includes(q)) return 'barbell';
  if (q === 'dumbbell') return 'dumbbell';
  if (q === 'kettlebell') return 'kettlebell';
  if (q === 'smith_machine') return 'smith';
  if (q === 'cable') return 'cable';
  if (q === 'resistance_band' || q === 'loop_band') return 'band';
  if (ERG.has(q)) return 'erg';
  if (MACHINE.has(q)) return 'machine';
  if (BODY.has(q)) return 'bodyweight';
  return 'none';
}

function kind(e) {
  if (e.category === 'stretching') return 'mobility';
  if (e.category === 'cardio') return 'cardio';
  if (e.body_part === 'core') return 'core';
  if (e.is_bodyweight) return 'bodyweight';
  return 'strength';
}

function metrics(e, k) {
  if (k === 'cardio') return 'distance_time';
  if (k === 'mobility' || e.force_type === 'static') return 'time';
  if (k === 'bodyweight' && !BODY.has(e.equipment)) return 'reps';
  return 'weight_reps';
}

const outMedia = join(root, 'client', 'public', 'media', 'repdb', 'flat');
mkdirSync(outMedia, { recursive: true });

let copied = 0;
let withoutImage = 0;
const catalog = data.map((e) => {
  const k = kind(e);
  const flat = e.images?.flat ?? {};
  const main = flat.peak ?? flat.main ?? flat.start;
  const files = [main, flat.start].filter(Boolean);
  for (const rel of new Set(files)) {
    const src = join(cache, rel);
    if (existsSync(src)) {
      copyFileSync(src, join(outMedia, rel.split('/').pop()));
      copied += 1;
    }
  }
  if (!main) withoutImage += 1;
  return {
    slug: e.id,
    nameEn: e.name_en,
    kind: k,
    equipment: equipment(e),
    muscles: { primary: e.primary_muscles ?? [], secondary: e.secondary_muscles ?? [] },
    perSide: Boolean(e.is_unilateral),
    metrics: metrics(e, k),
    ...(main ? { image: main.split('/').pop() } : {}),
    ...(flat.start && flat.start !== main ? { imageStart: flat.start.split('/').pop() } : {}),
  };
});

const genDir = join(root, 'client', 'src', 'seed', 'generated');
mkdirSync(genDir, { recursive: true });
writeFileSync(join(genDir, 'catalog.json'), JSON.stringify(catalog));
writeFileSync(
  join(root, 'client', 'public', 'media', 'repdb', 'ATTRIBUTION.txt'),
  'Exercise data by RepDB (repdb.co)\nhttps://repdb.co\nFree Tier License: см. LICENSE-DATA.md в https://github.com/RepDB/exercise-dataset\n',
);

console.log(`Каталог: ${catalog.length} упражнений, картинок скопировано: ${copied}, без картинки: ${withoutImage}.`);
