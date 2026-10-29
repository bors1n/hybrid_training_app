import type { ComplexFormatName } from './wodTypes.ts';

/**
 * Разбор страницы каталога sportkuznica.com/Wod/ (используется скриптом `npm run seed:wods`).
 * Файл запускается и в Node без сборки, поэтому здесь только типы и чистые функции, без зависимостей.
 */

export interface WodRecord {
  /** `wod:<номер на сайте>`. */
  id: string;
  title: string;
  format: ComplexFormatName;
  timeCapMin?: number;
  description: string;
  tags: string[];
  sourceUrl: string;
}

export const WOD_SITE = 'https://sportkuznica.com';

/** Формат по тексту задания: «ЗКМБР/AMRAP 23 МИНУТЫ», «Выполнить на время», «EMOM», «Табата»… */
export function detectFormat(text: string): { format: ComplexFormatName; timeCapMin?: number } {
  const t = text.toLowerCase();
  const minutes = /(\d+)\s*мин/.exec(t);
  const cap = minutes ? { timeCapMin: Number(minutes[1]) } : {};
  if (/зкмбр|amrap/.test(t)) return { format: 'AMRAP', ...cap };
  if (/emom|каждую минуту|каждые \d+ мин/.test(t)) return { format: 'EMOM', ...cap };
  if (/табата|tabata/.test(t)) return { format: 'TABATA' };
  if (/лесенк|(^|\n)\s*\d+(-\d+){2,}\s*(\n|$)/.test(t)) return { format: 'LADDER' };
  if (/раунд\S*\s+на время/.test(t)) return { format: 'ROUNDS' };
  if (/на время/.test(t)) return { format: 'FOR_TIME', ...(minutes && /лимит|за\s+\d+\s*мин/.test(t) ? cap : {}) };
  if (/интервал/.test(t)) return { format: 'INTERVALS' };
  return { format: 'OTHER' };
}

/** Текст блока с переносами строк: `<br>` → «\n», лишние пробелы убираются. */
function textWithBreaks(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Карточки комплексов на одной странице списка. Карточки без номера или без названия пропускаются. */
export function parseWodPage(doc: Document): WodRecord[] {
  const out: WodRecord[] = [];
  for (const a of doc.querySelectorAll('a.WodItemsItem')) {
    const href = a.getAttribute('href') ?? '';
    const num = /\/Wod\/Complex\/(\d+)\//.exec(href)?.[1];
    const title = a.querySelector('.title')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200);
    const descEl = a.querySelector('.desc');
    if (!num || !title || !descEl) continue;
    const description = textWithBreaks(descEl).slice(0, 4000);
    const tags = (a.querySelector('.letters')?.getAttribute('title') ?? '')
      .split(',')
      .map((s) => s.trim().slice(0, 50))
      .filter(Boolean)
      .slice(0, 20);
    out.push({ id: `wod:${num}`, title, ...detectFormat(description), description, tags, sourceUrl: `${WOD_SITE}${href}` });
  }
  return out;
}
