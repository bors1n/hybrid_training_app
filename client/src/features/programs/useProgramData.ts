import { ComplexQueueRecordSchema, ComplexRecordSchema, ProgramRecordSchema, QueueRecordSchema, SettingsRecordSchema, TemplateRecordSchema, type ComplexQueueRecord, type ComplexRecord, type ProgramRecord, type QueueRecord, type SettingsRecord, type TemplateRecord } from '@splav/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { SETTINGS_ID } from '../../data/programService.ts';
import { activeProgram } from '../../domain/programs.ts';
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

export function useComplexQueues(): ComplexQueueRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('complexQueue'), []);
  return useMemo(() => parseAll(rows, ComplexQueueRecordSchema as z.ZodType<ComplexQueueRecord>)?.sort((a, b) => a.id.localeCompare(b.id)), [rows]);
}

export function usePrograms(): ProgramRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('programs'), []);
  return useMemo(() => parseAll(rows, ProgramRecordSchema as z.ZodType<ProgramRecord>)?.sort((a, b) => a.id.localeCompare(b.id)), [rows]);
}

/** Единственная запись настроек (`id = 'settings'`); `null` — ещё не создана. */
export function useSettings(): SettingsRecord | null | undefined {
  const rows = useLiveQuery(() => listRecords('settings'), []);
  return useMemo(() => {
    const all = parseAll(rows, SettingsRecordSchema as z.ZodType<SettingsRecord>);
    return all === undefined ? undefined : (all.find((s) => s.id === SETTINGS_ID) ?? null);
  }, [rows]);
}

export interface ActiveProgramData {
  program: ProgramRecord;
  queue: QueueRecord | undefined;
  complexQueue: ComplexQueueRecord | undefined;
}

/** Активная программа вместе с её очередями; `undefined` — ещё загружается, `null` — программ нет. */
export function useActiveProgram(): ActiveProgramData | null | undefined {
  const programs = usePrograms();
  const settings = useSettings();
  const queues = useQueues();
  const cqs = useComplexQueues();
  return useMemo(() => {
    if (!programs || settings === undefined || !queues || !cqs) return undefined;
    const program = activeProgram(programs, settings);
    if (!program) return null;
    return { program, queue: queues.find((q) => q.id === program.queueId), complexQueue: cqs.find((q) => q.id === program.complexQueueId) };
  }, [programs, settings, queues, cqs]);
}
