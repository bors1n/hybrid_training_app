import type { SessionRecord, SessionType } from '@hybridlog/shared';
import { compareSessionsAsc } from './lastPerformance.ts';
import { normalizeName } from './matching.ts';

/** От новых к старым; удалённые не показываются. */
export function sortSessions<T extends Pick<SessionRecord, 'id' | 'date' | 'blocks' | 'startedAt' | 'updatedAt' | 'deletedAt'>>(sessions: readonly T[]): T[] {
  return sessions.filter((s) => s.deletedAt === null).sort((a, b) => compareSessionsAsc(b, a));
}

export interface HistoryFilter {
  query: string;
  type: SessionType | null;
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const RU_DATE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/;

/** Дата из запроса («20.10.2026» или «2026-10-20») в виде ГГГГ-ММ-ДД и остаток запроса без неё. */
function extractDate(query: string): { date: string | null; rest: string } {
  const p2 = (n: string): string => n.padStart(2, '0');
  const iso = ISO_DATE.exec(query);
  if (iso) return { date: iso[0], rest: query.replace(ISO_DATE, ' ') };
  const ru = RU_DATE.exec(query);
  if (ru) return { date: `${ru[3]}-${p2(ru[2]!)}-${p2(ru[1]!)}`, rest: query.replace(RU_DATE, ' ') };
  return { date: null, rest: query };
}

/**
 * Поиск по названию и заметке, а также по дате целиком (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ).
 * Дата распознаётся до разбиения на слова: иначе «20», «10» и «2026» совпадали бы с чем угодно.
 */
export function filterSessions<T extends Pick<SessionRecord, 'title' | 'date' | 'type' | 'notes'>>(sessions: readonly T[], f: HistoryFilter): T[] {
  const { date, rest } = extractDate(f.query);
  const words = normalizeName(rest).split(' ').filter(Boolean);
  return sessions.filter((s) => {
    if (f.type && s.type !== f.type) return false;
    if (date && s.date !== date) return false;
    if (words.length === 0) return true;
    const hay = normalizeName(`${s.title} ${s.notes ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Сегодняшняя дата в часовом поясе пользователя: ГГГГ-ММ-ДД. */
export function todayKey(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
