import type { Block, SessionRecord, SetEntry } from '@splav/shared';
import { describe, expect, it } from 'vitest';
import { heatLevel, heatmap, sessionMinutes, weekStreak, weeklyBalance } from './balanceMetrics.ts';
import { cardioBests, cardioEntries, cardioGroup, paceSeries, shownPace, weeklyCardio } from './cardioMetrics.ts';
import { epley, exerciseSeries, lastTopSet, recordSet, trainedExercises, weeklyTonnage } from './strengthMetrics.ts';
import { addDays, daysBetween, formatDayMonth, lastWeeks, weekStart } from './weeks.ts';

let n = 0;
function ses(date: string, blocks: Block[], extra: Partial<SessionRecord> = {}): SessionRecord {
  n += 1;
  return { id: `s${n}`, date, title: `T${n}`, type: 'strength', blocks, updatedAt: n, deletedAt: null, ...extra };
}
const set = (weightKg: number | undefined, reps: number | undefined, extra: Partial<SetEntry> = {}): SetEntry => ({ weightKg, reps, done: true, load: 'normal', ...extra });
const strength = (exerciseId: string, sets: SetEntry[]): Block => ({ type: 'strength', id: `b${n}`, superset: false, items: [{ exerciseId, sets }] });
const cardio = (extra: Partial<Extract<Block, { type: 'cardio' }>> = {}): Block => ({ type: 'cardio', id: `c${n}`, modality: 'run', role: 'main', ...extra });

describe('недели', () => {
  it('неделя начинается с понедельника', () => {
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // пн
    expect(weekStart('2026-10-28')).toBe('2026-10-26'); // ср
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // вс
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
  });
  it('арифметика дат через границы месяца и года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-20', '2026-10-28')).toBe(8);
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('lastWeeks: заканчивается текущей неделей, от старых к новым', () => {
    expect(lastWeeks('2026-10-28', 3)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('формат даты', () => expect(formatDayMonth('2026-10-20')).toBe('20 окт'));
});

describe('сила: расчётный 1ПМ и серии', () => {
  it('Эпли: 100 × 5 → 116,7; один повтор — сам вес', () => {
    expect(epley(100, 5)).toBeCloseTo(116.67, 1);
    expect(epley(100, 1)).toBe(100);
  });

  it('рабочий вес, 1ПМ, тоннаж, лучший вес по повторам, средний RPE', () => {
    const sessions = [
      ses('2026-10-13', [strength('sq', [set(80, 8), set(85, 5, { rpe: 8 })])]),
      ses('2026-10-20', [strength('sq', [set(85, 8), set(90, 3, { rpe: 7 }), set(95, 5, { done: false })])]),
    ];
    const [normal] = exerciseSeries('sq', sessions);
    expect(normal!.load).toBe('normal');
    expect(normal!.sessions.map((s) => s.date)).toEqual(['2026-10-13', '2026-10-20']);
    expect(normal!.sessions[0]).toMatchObject({ topWeightKg: 85, tonnageKg: 80 * 8 + 85 * 5 });
    expect(normal!.sessions[0]!.e1rmKg).toBe(101.3); // лучший из 80 × 8 (101,3) и 85 × 5 (99,2)
    // невыполненный подход 95 × 5 не считается
    expect(normal!.sessions[1]).toMatchObject({ topWeightKg: 90, e1rmKg: 107.7, tonnageKg: 85 * 8 + 90 * 3 });
    expect(normal!.bestByReps).toEqual([
      { reps: 3, weightKg: 90, date: '2026-10-20' },
      { reps: 5, weightKg: 85, date: '2026-10-13' },
      { reps: 8, weightKg: 85, date: '2026-10-20' },
    ]);
    expect(normal!.avgRpe).toBe(7.5);
    expect(normal!.setsCount).toBe(4);
  });

  it('подходы больше 12 повторов в 1ПМ не входят, но входят в рабочий вес и тоннаж', () => {
    const [s] = exerciseSeries('x', [ses('2026-10-20', [strength('x', [set(40, 20)])])]);
    expect(s!.sessions[0]).toMatchObject({ e1rmKg: null, topWeightKg: 40, tonnageKg: 800 });
  });

  it('+10 кг и противовес 18,5 кг — разные серии; 1ПМ и тоннаж только у обычного веса', () => {
    const sessions = [
      ses('2026-10-13', [strength('pull', [set(10, 5, { load: 'added' }), set(18.5, 6, { load: 'assisted' })])]),
      ses('2026-10-20', [strength('pull', [set(12.5, 5, { load: 'added' })])]),
    ];
    const series = exerciseSeries('pull', sessions);
    expect(series.map((s) => s.load)).toEqual(['added', 'assisted']);
    const [added, assisted] = series;
    expect(added!.sessions.map((s) => s.topWeightKg)).toEqual([10, 12.5]);
    expect(assisted!.sessions.map((s) => s.topWeightKg)).toEqual([18.5]);
    for (const s of series) for (const e of s.sessions) expect(e).toMatchObject({ e1rmKg: null, tonnageKg: 0 });
  });

  it('подход с повторами на сторону считается дважды в тоннаже', () => {
    const [s] = exerciseSeries('lunge', [ses('2026-10-20', [strength('lunge', [set(20, 10, { perSide: true })])])]);
    expect(s!.sessions[0]!.tonnageKg).toBe(400);
  });

  it('удалённые тренировки и чужие упражнения не учитываются; нет подходов — нет серий', () => {
    const sessions = [ses('2026-10-20', [strength('a', [set(50, 5)])], { deletedAt: 5 }), ses('2026-10-21', [strength('b', [set(60, 5)])])];
    expect(exerciseSeries('a', sessions)).toEqual([]);
    expect(exerciseSeries('c', sessions)).toEqual([]);
  });

  it('упражнение без веса (только повторы) даёт серию без рабочего веса', () => {
    const [s] = exerciseSeries('pu', [ses('2026-10-20', [strength('pu', [set(undefined, 12)])])]);
    expect(s!.sessions[0]).toMatchObject({ topWeightKg: null, e1rmKg: null });
    expect(s!.bestByReps).toEqual([]);
  });

  it('тоннаж по неделям суммирует тренировки одной недели', () => {
    const sessions = [
      ses('2026-10-19', [strength('sq', [set(100, 5)])]), // пн
      ses('2026-10-25', [strength('sq', [set(100, 4)])]), // вс той же недели
      ses('2026-10-26', [strength('sq', [set(100, 3)])]),
    ];
    expect(weeklyTonnage(exerciseSeries('sq', sessions)[0]!)).toEqual([
      { week: '2026-10-19', tonnageKg: 900 },
      { week: '2026-10-26', tonnageKg: 300 },
    ]);
  });

  it('упражнения для выбора: только с выполненными подходами, недавние первыми', () => {
    const sessions = [
      ses('2026-10-13', [strength('a', [set(50, 5)]), strength('b', [set(50, 5, { done: false })])]),
      ses('2026-10-20', [strength('c', [set(50, 5)])]),
      ses('2026-10-21', [strength('a', [set(50, 5)])]),
    ];
    expect(trainedExercises(sessions)).toEqual([
      { exerciseId: 'a', sessions: 2, lastDate: '2026-10-21' },
      { exerciseId: 'c', sessions: 1, lastDate: '2026-10-20' },
    ]);
  });
});

describe('сила: рекорд и последний подход', () => {
  const sessions = [
    ses('2026-10-06', [strength('sq', [set(90, 6)])]), // 1ПМ 108
    ses('2026-10-20', [strength('sq', [set(87.5, 8), set(85, 8), set(40, 20)])]), // 1ПМ 110,8
  ];
  const [normal] = exerciseSeries('sq', sessions);

  it('рекорд — подход с наибольшим расчётным 1ПМ, а не самый тяжёлый', () => {
    expect(recordSet(normal!)).toEqual({ weightKg: 87.5, reps: 8, date: '2026-10-20' });
  });
  it('последний — самый тяжёлый подход последней тренировки', () => {
    expect(lastTopSet(normal!)).toEqual({ weightKg: 87.5, reps: 8, date: '2026-10-20' });
  });
  it('у отягощения рекорд — по весу; без веса и повторов — null', () => {
    const [added] = exerciseSeries('p', [ses('2026-10-20', [strength('p', [set(10, 5, { load: 'added' }), set(12.5, 3, { load: 'added' })])])]);
    expect(recordSet(added!)).toMatchObject({ weightKg: 12.5, reps: 3 });
    const [bare] = exerciseSeries('b', [ses('2026-10-20', [strength('b', [set(undefined, 12)])])]);
    expect(recordSet(bare!)).toBeNull();
    expect(lastTopSet(bare!)).toBeNull();
  });
});

describe('кардио', () => {
  it('группы: бег = улица + дорожка, вело = велосипед + велотренажёр', () => {
    expect(['run', 'treadmill', 'bike', 'indoor_bike', 'skierg', 'row', 'stairs', 'walk', 'other'].map((m) => cardioGroup(m as never))).toEqual([
      'run', 'run', 'bike', 'bike', 'other', 'other', 'other', 'other', 'other',
    ]);
  });

  it('темп: с часов важнее расчётного (7:46 показываем, 7:49 хранится)', () => {
    expect(shownPace({ recordedPace: 466, paceSecPerKm: 469, distanceM: 3090, durationSec: 1448 })).toBe(466);
    expect(shownPace({ paceSecPerKm: 469 })).toBe(469);
    expect(shownPace({ distanceM: 3090, durationSec: 1448 })).toBe(469);
    expect(shownPace({})).toBeNull();
  });

  const run = ses('2026-10-20', [cardio({ distanceM: 3090, durationSec: 1448, paceSecPerKm: 469, recordedPace: 466 })], { type: 'cardio' });

  it('пробежка 3,09 км попадает в недельный километраж', () => {
    const entries = cardioEntries([run]);
    expect(weeklyCardio(entries, 'run')).toEqual([{ week: '2026-10-19', km: 3.09, minutes: 24 }]);
    expect(weeklyCardio(entries, 'bike')).toEqual([]);
  });

  it('разминка и финиш входят в минуты и км, но не в темп', () => {
    const s = ses('2026-10-21', [
      cardio({ modality: 'treadmill', role: 'warmup', distanceM: 1000, durationSec: 600 }),
      cardio({ modality: 'run', distanceM: 5000, durationSec: 1500 }),
      cardio({ modality: 'treadmill', role: 'finisher', distanceM: 500, durationSec: 240 }),
    ]);
    const entries = cardioEntries([s]);
    expect(weeklyCardio(entries, 'run')).toEqual([{ week: '2026-10-19', km: 6.5, minutes: 39 }]);
    const pace = paceSeries(entries, 'run');
    expect(pace).toHaveLength(1);
    expect(pace[0]).toMatchObject({ distanceM: 5000, paceSecPerKm: 300 });
  });

  it('недели суммируются отдельно; удалённые не считаются; блок без данных пропускается', () => {
    const entries = cardioEntries([
      run,
      ses('2026-10-27', [cardio({ distanceM: 10_000, durationSec: 3000 })]),
      ses('2026-10-28', [cardio({ distanceM: 9000, durationSec: 3000 })], { deletedAt: 1 }),
      ses('2026-10-29', [cardio({})]),
    ]);
    expect(weeklyCardio(entries, 'run').map((w) => [w.week, w.km])).toEqual([['2026-10-19', 3.09], ['2026-10-26', 10]]);
  });

  it('лучшие: темп только на дистанции от 1 км, ничья — более ранний', () => {
    const sprint = ses('2026-10-01', [cardio({ distanceM: 400, durationSec: 80 })]); // 3:20/км, но короткая
    const a = ses('2026-10-05', [cardio({ distanceM: 5000, durationSec: 1500 })]); // 5:00
    const b = ses('2026-10-12', [cardio({ distanceM: 5000, durationSec: 1500 })]); // тоже 5:00, позже
    const c = ses('2026-10-19', [cardio({ distanceM: 12_000, durationSec: 4200 })]); // 5:50, самая длинная
    const bests = cardioBests(paceSeries(cardioEntries([sprint, b, a, c]), 'run'));
    expect(bests.bestPace).toMatchObject({ date: '2026-10-05', paceSecPerKm: 300 });
    expect(bests.longestDistance).toMatchObject({ distanceM: 12_000 });
    expect(bests.longestTime).toMatchObject({ durationSec: 4200 });
    expect(cardioBests([])).toEqual({ longestDistance: null, longestTime: null, bestPace: null, fastestSpeed: null });
  });
});

describe('баланс и регулярность', () => {
  const today = '2026-10-28'; // ср; неделя с 2026-10-26

  it('минуты: остаток от длительности после кардио, комплекса и мобильности — это силовые', () => {
    const s = ses(
      '2026-10-27',
      [
        cardio({ role: 'warmup', modality: 'treadmill', durationSec: 600 }),
        strength('sq', [set(80, 5)]),
        { type: 'conditioning', id: 'k', format: 'AMRAP', timeCapMin: 12, result: {} },
        { type: 'mobility', id: 'm', items: [{ exerciseId: 'x', sets: [], durationSec: 300 }] },
      ],
      { durationMin: 80 },
    );
    expect(sessionMinutes(s)).toEqual({ strength: 80 - 10 - 12 - 5, cardio: 10, conditioning: 12, mobility: 5 });
  });

  it('минуты: без длительности силовые неизвестны (0), силовые без выполненных подходов — 0, остаток не уходит в минус', () => {
    expect(sessionMinutes(ses('2026-10-27', [strength('sq', [set(80, 5)])])).strength).toBe(0);
    expect(sessionMinutes(ses('2026-10-27', [strength('sq', [set(80, 5, { done: false })])], { durationMin: 60 })).strength).toBe(0);
    expect(sessionMinutes(ses('2026-10-27', [strength('sq', [set(80, 5)]), cardio({ durationSec: 3600 })], { durationMin: 30 })).strength).toBe(0);
  });

  it('минуты комплекса: время результата важнее лимита', () => {
    const s = ses('2026-10-27', [{ type: 'conditioning', id: 'k', format: 'FOR_TIME', timeCapMin: 20, result: { timeSec: 754 } }]);
    expect(sessionMinutes(s).conditioning).toBe(13);
  });

  it('недели: считаем тренировки по типам; пустые недели есть; старше окна и удалённые не входят', () => {
    const sessions = [
      ses('2026-10-27', [], { type: 'strength' }),
      ses('2026-10-28', [], { type: 'cardio' }),
      ses('2026-10-20', [], { type: 'conditioning' }),
      ses('2026-10-21', [], { type: 'strength', deletedAt: 1 }),
      ses('2025-01-01', [], { type: 'strength' }),
    ];
    const weeks = weeklyBalance(sessions, today, 3);
    expect(weeks.map((w) => w.week)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(weeks.map((w) => w.sessionsTotal)).toEqual([0, 1, 2]);
    expect(weeks[2]!.sessions).toMatchObject({ strength: 1, cardio: 1, conditioning: 0 });
    expect(weeks[1]!.sessions.conditioning).toBe(1);
  });

  it('теплокарта: 26 недель по 7 дней, последняя колонка — текущая неделя, будущее помечено', () => {
    const map = heatmap([ses('2026-10-27', []), ses('2026-10-27', []), ses('2026-10-19', [])], today);
    expect(map).toHaveLength(26);
    expect(map.every((w) => w.length === 7)).toBe(true);
    const last = map.at(-1)!;
    expect(last[0]!.date).toBe('2026-10-26');
    expect(last[1]).toMatchObject({ date: '2026-10-27', count: 2, future: false });
    expect(last[2]!.future).toBe(false); // сегодня
    expect(last[3]!.future).toBe(true);
    expect(map.at(-2)![0]).toMatchObject({ date: '2026-10-19', count: 1 });
  });

  it('уровни теплокарты', () => expect([0, 1, 2, 3, 5].map(heatLevel)).toEqual([0, 1, 2, 3, 3]));

  describe('недели подряд', () => {
    const on = (...dates: string[]) => dates.map((d) => ses(d, []));
    it('нет тренировок — ноль', () => expect(weekStreak([], today)).toEqual({ current: 0, longest: 0 }));
    it('считаем назад от текущей недели', () => {
      expect(weekStreak(on('2026-10-27', '2026-10-20', '2026-10-13'), today)).toEqual({ current: 3, longest: 3 });
    });
    it('на текущей неделе ещё не было — серия не рвётся, если прошлая была', () => {
      expect(weekStreak(on('2026-10-20', '2026-10-13'), today)).toEqual({ current: 2, longest: 2 });
    });
    it('пропущена целая неделя — серия оборвана, а рекорд помнится', () => {
      const s = on('2026-10-27', '2026-10-06', '2026-09-29', '2026-09-22', '2026-09-15');
      expect(weekStreak(s, today)).toEqual({ current: 1, longest: 4 });
    });
    it('прошлая неделя тоже пустая — текущая серия 0', () => {
      expect(weekStreak(on('2026-10-06'), today)).toEqual({ current: 0, longest: 1 });
    });
    it('несколько тренировок в неделю — одна неделя; через границу года', () => {
      expect(weekStreak(on('2026-12-29', '2026-12-31', '2027-01-04'), '2027-01-06')).toEqual({ current: 2, longest: 2 });
    });
  });
});
