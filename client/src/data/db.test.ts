import { beforeEach, describe, expect, it } from 'vitest';
import { getMeta, setMeta, HybridLogDB } from './db.ts';

let database: HybridLogDB;
beforeEach(async () => {
  database = new HybridLogDB(`test-${Math.random()}`);
  await database.open();
});

describe('meta', () => {
  it('сохраняет и читает значение', async () => {
    await setMeta('cursor', 42, database);
    expect(await getMeta<number>('cursor', database)).toBe(42);
  });
  it('возвращает undefined для отсутствующего ключа', async () => {
    expect(await getMeta('nope', database)).toBeUndefined();
  });
  it('перезаписывает значение', async () => {
    await setMeta('k', 'a', database);
    await setMeta('k', 'b', database);
    expect(await getMeta<string>('k', database)).toBe('b');
  });
});
