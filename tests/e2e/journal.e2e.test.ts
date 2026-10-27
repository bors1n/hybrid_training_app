import { PullResponseSchema, PushResponseSchema, SessionRecordSchema, type SyncRecord } from '@splav/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SplavDB, getMeta } from '../../client/src/data/db.ts';
import {
  addCardioBlock,
  addConditioningBlock,
  addMobilityItem,
  addSet,
  addStrengthBlock,
  addSupersetBlock,
  finishSession,
  newSession,
  setItemLoad,
  updateCardio,
  updateConditioning,
  updateSession,
  updateSet,
  type SessionDraft,
} from '../../client/src/domain/sessionEdit.ts';
import { summarize } from '../../client/src/domain/summary.ts';
import { AuthError, NetworkError, syncOnce, REJECTED_KEY, type Transport } from '../../client/src/sync/engine.ts';
import { listRecords, saveRecord } from '../../client/src/sync/records.ts';
import { createTestApp, type TestApp } from '../../server/src/test-helpers.ts';

function serverTransport(app: FastifyInstance, sid: string): Transport {
  const call = async (method: 'GET' | 'POST', url: string, payload?: object) => {
    const res = await app.inject({ method, url, cookies: { sid }, ...(payload ? { payload } : {}) });
    if (res.statusCode === 401) throw new AuthError('вход');
    if (res.statusCode >= 500) throw new NetworkError('сервер');
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${res.body}`);
    return res.json();
  };
  return {
    push: async (records: SyncRecord[]) => PushResponseSchema.parse(await call('POST', '/api/sync', { records })),
    pull: async (since, limit) => PullResponseSchema.parse(await call('GET', `/api/sync?since=${since}&limit=${limit}`)),
  };
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
}, 60_000);
afterAll(async () => {
  await t.close();
});

const device = async (): Promise<SplavDB> => {
  const d = new SplavDB(`journal-${Math.random()}`);
  await d.open();
  return d;
};

/** «Тренировка 1» из import_template.csv, собранная теми же операциями, что и экран тренировки. */
function training1(): SessionDraft {
  let s = newSession('2026-10-20', 1_000, 'train-1');
  s = updateSession(s, { title: 'Тренировка 1', rpe: 8, durationMin: 66 });
  s = updateCardio(addCardioBlock(s, 'stairs', 'warmup', 'w'), 'w', { durationSec: 600 });
  s = addStrengthBlock(s, { exerciseId: 'repdb:squat' }, 'sq');
  s = updateSet(s, 'sq', 0, 0, { weightKg: 85, reps: 8, rpe: 7 });
  s = addSet(addSet(s, 'sq', 0), 'sq', 0);
  s = updateSet(s, 'sq', 0, 2, { rpe: 8 });
  s = addStrengthBlock(s, { exerciseId: 'repdb:db-lunge', perSide: true, sets: [{ weightKg: 15, reps: 12, done: true, load: 'normal' }] }, 'lu');
  s = addSupersetBlock(s, [{ exerciseId: 'repdb:bicep-curl' }, { exerciseId: 'repdb:hanging-leg-raise' }], 'ss');
  s = addStrengthBlock(s, { exerciseId: 'repdb:pull-up' }, 'pu');
  s = setItemLoad(updateSet(s, 'pu', 0, 0, { weightKg: 10, reps: 8 }), 'pu', 0, 'added');
  s = addMobilityItem(s, 'splav:core-complex', 600, undefined, 'mob');
  s = updateCardio(addCardioBlock(s, 'indoor_bike', 'finisher', 'bike'), 'bike', { durationSec: 900, notes: 'зона 2' });
  s = updateCardio(addCardioBlock(s, 'run', 'main', 'run'), 'run', { distanceM: 3090, durationSec: 1448, recordedPace: 466, avgHr: 142, rpe: 6 });
  s = updateConditioning(addConditioningBlock(s, { complexId: '#005', format: 'AMRAP', timeCapMin: 15 }, 'k'), 'k', { result: { rounds: 9 }, rpe: 8 });
  return finishSession(s, 4_000_000);
}

describe('журнал и сервер', () => {
  it('тренировка из редактора принимается сервером без отклонений и доезжает до второго устройства', async () => {
    const sid = await t.login('journal@example.com');
    const [phone, laptop] = [await device(), await device()];
    const net = serverTransport(t.app, sid);

    await saveRecord('sessions', training1(), { database: phone });
    await syncOnce(net, phone);
    expect(await getMeta(REJECTED_KEY, phone)).toBeUndefined();
    expect(await phone.outbox.count()).toBe(0);

    await syncOnce(net, laptop);
    const rows = await listRecords('sessions', laptop);
    expect(rows).toHaveLength(1);
    const parsed = SessionRecordSchema.parse(rows[0]);
    expect(parsed).toMatchObject({ id: 'train-1', title: 'Тренировка 1', date: '2026-10-20', rpe: 8, durationMin: 66, type: 'mixed' });
    expect(parsed.blocks.map((b) => b.type)).toEqual(['cardio', 'strength', 'strength', 'strength', 'strength', 'mobility', 'cardio', 'cardio', 'conditioning']);
  });

  it('пробежка 3,09 км: расчётный темп 7:49 и темп часов 7:46 переживают сервер; подтягивания +10 кг остаются «с отягощением»', async () => {
    const sid = await t.login('journal2@example.com');
    const [a, b] = [await device(), await device()];
    const net = serverTransport(t.app, sid);
    await saveRecord('sessions', training1(), { database: a });
    await syncOnce(net, a);
    await syncOnce(net, b);
    const s = SessionRecordSchema.parse((await listRecords('sessions', b))[0]);

    const run = s.blocks.find((x) => x.type === 'cardio' && x.modality === 'run');
    expect(run).toMatchObject({ distanceM: 3090, durationSec: 1448, paceSecPerKm: 469, recordedPace: 466, role: 'main' });
    const pullUp = s.blocks.find((x) => x.type === 'strength' && x.items[0]!.exerciseId === 'repdb:pull-up');
    expect(pullUp?.type === 'strength' && pullUp.items[0]!.sets[0]).toMatchObject({ weightKg: 10, load: 'added', reps: 8 });
    const k = s.blocks.find((x) => x.type === 'conditioning');
    expect(k).toMatchObject({ complexId: '#005', result: { rounds: 9 } });
    // Итоги считаются из записи, а не хранятся. Средний подход приседа — невыполненная копия, в тоннаж не входит:
    // 85×8 (подходы 1 и 3) + 15×12 на каждую из двух сторон.
    expect(summarize(s).tonnageKg).toBe(85 * 8 * 2 + 15 * 12 * 2);
    expect(summarize(s).distanceM).toBe(3090);
  });

  it('удаление и правка тренировки на одном устройстве доезжают до другого', async () => {
    const sid = await t.login('journal3@example.com');
    const [a, b] = [await device(), await device()];
    const net = serverTransport(t.app, sid);
    await saveRecord('sessions', training1(), { database: a });
    await syncOnce(net, a);
    await syncOnce(net, b);

    await saveRecord('sessions', { ...training1(), title: 'Тренировка 1 (правка)' }, { database: b });
    await syncOnce(net, b);
    await syncOnce(net, a);
    expect((await listRecords('sessions', a))[0]?.['title']).toBe('Тренировка 1 (правка)');
  });
});
