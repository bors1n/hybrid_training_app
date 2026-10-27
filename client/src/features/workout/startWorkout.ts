import { todayKey } from '../../domain/history.ts';
import { newSession } from '../../domain/sessionEdit.ts';
import { saveRecord } from '../../sync/records.ts';

/** Создаёт пустую свободную тренировку на сегодня и возвращает её id; дату потом можно сменить на экране. */
export async function startFreeWorkout(now: number = Date.now()): Promise<string> {
  const draft = newSession(todayKey(new Date(now)), now);
  await saveRecord('sessions', draft);
  return draft.id;
}
