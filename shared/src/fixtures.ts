import type { SessionRecord, TemplateRecord } from './schemas/index.ts';

/** Минимальные валидные записи для тестов (с полями синхронизации). */
export function sessionData(id: string, updatedAt = 1, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    updatedAt,
    deletedAt: null,
    date: '2026-10-20',
    title: `Тренировка ${id}`,
    type: 'strength',
    blocks: [],
    ...extra,
  };
}

export function templateData(id: string, updatedAt = 1, extra: Partial<TemplateRecord> = {}): TemplateRecord {
  return { id, updatedAt, deletedAt: null, title: `Шаблон ${id}`, blocks: [], ...extra };
}
