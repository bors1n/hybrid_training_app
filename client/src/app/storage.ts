import { getMeta, setMeta } from '../data/db.ts';

/** Просит браузер не вычищать IndexedDB; один раз при первом запуске. */
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  if (await getMeta<boolean>('persistRequested')) return;
  try {
    const granted = await navigator.storage.persist();
    await setMeta('persistRequested', true);
    await setMeta('persistGranted', granted);
  } catch {
    // iOS может отказать; приложение работает и без этого.
  }
}
