import type { SessionRecord, TemplateRecord } from '@splav/shared';

type Sync = 'updatedAt' | 'deletedAt';

/** Тренировка без полей синхронизации — в том виде, как её передают в saveRecord. */
export function session(id: string, extra: Partial<Omit<SessionRecord, Sync>> = {}): Omit<SessionRecord, Sync> {
  return { id, date: '2026-10-20', title: `Тренировка ${id}`, type: 'strength', blocks: [], ...extra };
}

export function template(id: string, extra: Partial<Omit<TemplateRecord, Sync>> = {}): Omit<TemplateRecord, Sync> {
  return { id, title: `Шаблон ${id}`, blocks: [], ...extra };
}
