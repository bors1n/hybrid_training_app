// Собирает библиотеку комплексов из каталога sportkuznica.com/Wod/ (11 страниц списка).
//
//   npm run seed:wods
//
// Пишет client/src/seed/generated/wods.json. Файл не попадает в git (папка generated в .gitignore):
// тексты принадлежат сайту, мы только показываем их внутри приложения со ссылкой на источник.
// Запросы идут не чаще одного в секунду. Без wods.json приложение работает: в библиотеке остаются
// комплексы автора и свои.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { parseWodPage, WOD_SITE } from '../../client/src/seed/wodParse.ts';

const root = join(import.meta.dirname, '..', '..');
const out = join(root, 'client', 'src', 'seed', 'generated', 'wods.json');
const PAGES = 11;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const all = new Map();
for (let p = 1; p <= PAGES; p += 1) {
  const url = `${WOD_SITE}/Wod/${p === 1 ? '' : `?p=${p}`}`;
  const res = await fetch(url, { headers: { 'user-agent': 'HybridLog-seed/1.0 (personal training log)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const items = parseWodPage(new JSDOM(await res.text()).window.document);
  for (const w of items) all.set(w.id, w);
  console.log(`Страница ${p}/${PAGES}: ${items.length} комплексов`);
  if (p < PAGES) await sleep(1000);
}

const list = [...all.values()].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, `${JSON.stringify(list, null, 1)}\n`);
console.log(`Готово: ${list.length} комплексов → ${out}`);
