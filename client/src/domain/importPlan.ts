import type { SessionRecord } from '@splav/shared';
import type { ImportPlan, PlannedSession } from './importCsv.ts';

/** JSON с отсортированными ключами: сравнение содержимого не зависит от порядка полей. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface Classified {
  /** Таких тренировок в журнале нет (в том числе удалённых ранее): будут добавлены. */
  added: PlannedSession[];
  /** Тренировка с тем же id уже есть и отличается: заменяется только с подтверждением. */
  replaced: PlannedSession[];
  /** Совпадает с журналом до последнего поля: повторный импорт ничего не меняет. */
  unchanged: PlannedSession[];
}

/**
 * Что сделает импорт с журналом. Повторный импорт того же файла даёт «без изменений»,
 * а не дубликаты: id тренировок детерминированные (или берутся у уже существующей).
 */
export function classifyPlan(plan: Pick<ImportPlan, 'sessions'>, existing: readonly SessionRecord[]): Classified {
  const live = new Map(existing.filter((s) => s.deletedAt === null).map((s) => [s.id, s]));
  const out: Classified = { added: [], replaced: [], unchanged: [] };
  for (const planned of plan.sessions) {
    const current = live.get(planned.id);
    if (!current) {
      out.added.push(planned);
      continue;
    }
    const { updatedAt: _u, deletedAt: _d, ...content } = current;
    (canonicalJson(content) === canonicalJson(planned.draft) ? out.unchanged : out.replaced).push(planned);
  }
  return out;
}
