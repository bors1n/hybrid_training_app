import { SessionRecordSchema, type SessionRecord } from '@hybridlog/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { listRecords } from '../../sync/records.ts';

/** Все тренировки (без удалённых), обновляются при любой записи. `undefined` — ещё загружаются. */
export function useSessions(): SessionRecord[] | undefined {
  const rows = useLiveQuery(() => listRecords('sessions'), []);
  return useMemo(
    () =>
      rows?.flatMap((r) => {
        const parsed = SessionRecordSchema.safeParse(r);
        return parsed.success ? [parsed.data] : [];
      }),
    [rows],
  );
}
