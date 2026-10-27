import { ComplexQueueRecordSchema, ComplexRecordSchema, QueueRecordSchema, TemplateRecordSchema, type ComplexQueueRecord, type ComplexRecord, type QueueRecord, type TemplateRecord } from '@splav/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { listRecords } from '../../sync/records.ts';
import type { z } from 'zod';

function parseAll<T>(rows: readonly unknown[] | undefined, schema: z.ZodType<T>): T[] | undefined {
  return rows?.flatMap((r) => {
    const p = schema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

/** Шаблоны (без удалённых); `undefined` — ещё загружаются. */
export function useTemplates(): TemplateRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('templates'), []);
  return useMemo(() => parseAll(rows, TemplateRecordSchema as z.ZodType<TemplateRecord>)?.sort((a, b) => a.id.localeCompare(b.id)), [rows]);
}

export function useQueues(): QueueRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('queues'), []);
  return useMemo(() => parseAll(rows, QueueRecordSchema as z.ZodType<QueueRecord>)?.sort((a, b) => a.id.localeCompare(b.id)), [rows]);
}

/** Библиотека комплексов по возрастанию номера. */
export function useComplexes(): ComplexRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('complexes'), []);
  return useMemo(() => parseAll(rows, ComplexRecordSchema as z.ZodType<ComplexRecord>)?.sort((a, b) => a.id.localeCompare(b.id)), [rows]);
}

export function useComplexQueue(): ComplexQueueRecord | undefined | null {
  const rows = useLiveQuery(() => listRecords('complexQueue'), []);
  return useMemo(() => {
    const all = parseAll(rows, ComplexQueueRecordSchema as z.ZodType<ComplexQueueRecord>);
    return all === undefined ? undefined : (all[0] ?? null);
  }, [rows]);
}
