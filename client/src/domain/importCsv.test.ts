import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, parseCsvText, tableFromRows } from './csvText.ts';
import { buildImport, normalizeComplexId, parseImportDate, shortHash, type ImportOptions, type PlannedSession } from './importCsv.ts';
import { createMatcher } from './matching.ts';

const TEMPLATE = readFileSync(new URL('../../../docs/import_template.csv', import.meta.url), 'utf8');

/** Небольшой каталог для тестов: названия из шаблона, не зависящие от собранного RepDB. */
const ITEMS = [
  { id: 'ex:squat', name: 'Присед со штангой' },
  { id: 'ex:lunge', name: 'Выпады с гантелями' },
  { id: 'ex:core', name: 'Кор-комплекс' },
  { id: 'ex:pullup', name: 'Подтягивания' },
  { id: 'ex:curl', name: 'Бицепс с гантелями' },
  { id: 'ex:legraise', name: 'Подъёмы ног в висе' },
  { id: 'ex:assisted', name: 'Подтягивания в тренажёре' },
  { id: 'ex:backext', name: 'Гиперэкстензия' },
];
const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({ today: '2026-10-27', matcher: createMatcher(ITEMS), ...over });
const importCsv = (text: string, over: Partial<ImportOptions> = {}) => buildImport(parseCsvText(text), opts(over));

const HEADER = 'date,session,session_type,duration_min,kind,order,exercise,superset,set_no,weight_kg,load,reps,per_side,duration,distance_km,modality,role,pace,avg_hr,floors,complex_id,complex_format,time_cap_min,rounds,extra_reps,total_reps,notes,rpe,session_rpe';
/** Одна строка по именованным колонкам. */
function line(cells: Record<string, string | number>): string {
  const q = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return HEADER.split(',').map((c) => q(String(cells[c] ?? ''))).join(',');
}
const file = (...rows: Record<string, string | number>[]): string => [HEADER, ...rows.map(line)].join('\n');
const set = (over: Record<string, string | number> = {}) => ({ date: '20.10.2026', session: 'Т', kind: 'set', order: 1, exercise: 'Присед со штангой', set_no: 1, weight_kg: 85, reps: 8, ...over });

const byTitle = (plan: ReturnType<typeof importCsv>, title: string, date?: string): PlannedSession =>
  plan.sessions.find((s) => s.draft.title === title && (!date || s.draft.date === date))!;
const errors = (plan: ReturnType<typeof importCsv>) => plan.issues.filter((i) => i.severity === 'error');
const warnings = (plan: ReturnType<typeof importCsv>) => plan.issues.filter((i) => i.severity === 'warning');

describe('таблица: CSV', () => {
  it('BOM, разделитель «;», десятичная запятая, CRLF, лишние колонки и регистр заголовков', () => {
    const text = '﻿Date;Session;Kind;Order;Exercise;Weight_KG;Reps;Лишняя\r\n20.10.2026;Т;set;1;Присед;18,5;8;x\r\n';
    const t = parseCsvText(text);
    expect(t.missingColumns).toEqual([]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]!.cells).toMatchObject({ date: '20.10.2026', session: 'Т', kind: 'set', order: '1', exercise: 'Присед', weight_kg: '18,5', reps: '8' });
  });
  it('переводы строк CRLF, LF и CR (старый Mac) дают одно и то же', () => {
    const rows = ['date,session,kind,order', '20.10.2026,А,note,0', '21.10.2026,Б,note,0'];
    for (const nl of ['\r\n', '\n', '\r']) {
      expect(parseCsvText(rows.join(nl) + nl).rows.map((r) => r.row), JSON.stringify(nl)).toEqual([2, 3]);
    }
  });
  it('файл шаблона целиком (как он лежит на диске) разбирается в 19 строк', () => {
    expect(parseCsvText(TEMPLATE).rows).toHaveLength(19);
  });
  it('разделитель «,» и значения в кавычках с запятой и кавычкой внутри', () => {
    const t = parseCsvText('date,session,kind,order,notes\n20.10.2026,"Т, 1",note,0,"сказал ""ок"", ушёл"');
    expect(t.rows[0]!.cells.session).toBe('Т, 1');
    expect(t.rows[0]!.cells.notes).toBe('сказал "ок", ушёл');
  });
  it('пустые строки пропускаются, но номера строк файла сохраняются', () => {
    const t = parseCsvText('date,session,kind,order\n20.10.2026,А,note,0\n\n,,,\n21.10.2026,Б,note,0\n');
    expect(t.rows.map((r) => r.row)).toEqual([2, 5]);
  });
  it('нет обязательных колонок — перечислены', () => {
    expect(parseCsvText('session,kind\nТ,set').missingColumns).toEqual(['date', 'order']);
    expect(parseCsvText('').missingColumns).toHaveLength(4);
  });
  it('пробелы вокруг значений и неразрывные пробелы убираются', () => {
    const t = parseCsvText('date,session,kind,order\n 20.10.2026 , Т , note ,0');
    expect(t.rows[0]!.cells).toMatchObject({ date: '20.10.2026', session: 'Т', kind: 'note' });
  });
  it('кодировка: UTF-8 и Windows-1251 (Excel на русской Windows)', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('Бег'))).toBe('Бег');
    expect(decodeCsvBytes(new Uint8Array([0xc1, 0xe5, 0xe3]))).toBe('Бег');
  });
  it('таблица из массива строк (общий путь для Excel)', () => {
    const t = tableFromRows([['date', 'session', 'kind', 'order'], ['20.10.2026', 'Т', 'note', 0], [null, '', undefined]]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]!.cells.order).toBe('0');
  });
});

describe('вспомогательные', () => {
  it('даты: ДД.ММ.ГГГГ и ГГГГ-ММ-ДД, без нулей, несуществующие — null', () => {
    expect(parseImportDate('20.10.2026')).toBe('2026-10-20');
    expect(parseImportDate('1.3.2026')).toBe('2026-03-01');
    expect(parseImportDate('2026-10-20')).toBe('2026-10-20');
    for (const bad of ['31.02.2026', '20/10/2026', '20.10.26', '', 'вчера', '2026-13-01']) expect(parseImportDate(bad), bad).toBeNull();
  });
  it('номер комплекса', () => {
    expect(normalizeComplexId('5')).toBe('#005');
    expect(normalizeComplexId('#005')).toBe('#005');
    expect(normalizeComplexId(' 024 ')).toBe('#024');
    expect(normalizeComplexId('X1')).toBe('X1');
  });
  it('хэш детерминированный и различает входы', () => {
    expect(shortHash('a')).toBe(shortHash('a'));
    expect(shortHash('a')).not.toBe(shortHash('b'));
    expect(shortHash('x')).toHaveLength(16);
  });
});

describe('import_template.csv — каждая строка разбирается в ожидаемую структуру', () => {
  const plan = importCsv(TEMPLATE);

  it('без ошибок; сводка: 19 строк → 9 тренировок', () => {
    expect(errors(plan)).toEqual([]);
    expect(plan.stats).toEqual({ rows: 19, importedRows: 19, skippedRows: 0, sessions: 9, sets: 11, cardio: 5, complexes: 2, mobility: 1 });
    expect(plan.sessions.map((s) => `${s.draft.date} ${s.draft.title}`)).toEqual([
      '2026-10-20 Тренировка 1', '2026-10-23 Тренировка 2', '2026-04-26 Pull day', '2026-10-18 Тренировка 3',
      '2026-08-11 Push day', '2026-05-29 Бег', '2026-09-16 Бег', '2026-08-03 Pull day', '2026-03-08 Pull day',
    ]);
  });

  it('предупреждения о порядке дат ожидаемы (в шаблоне даты намеренно вразброс), других нет', () => {
    const w = warnings(plan);
    expect(w).toHaveLength(5);
    expect(w.every((x) => /раньше предыдущей тренировки/.test(x.message))).toBe(true);
    expect(w[0]!.message).toBe('Дата 26.04.2026 раньше предыдущей тренировки (23.10.2026): проверьте порядок строк');
    expect(w[0]!.row).toBe(14);
  });

  it('Тренировка 1: смешанная, RPE 8, блоки по order: разминка, присед, выпады, кор, финиш', () => {
    const s = byTitle(plan, 'Тренировка 1').draft;
    expect(s).toMatchObject({ type: 'mixed', rpe: 8, date: '2026-10-20' });
    expect(s.finishedAt).toBeGreaterThan(0);
    expect(s.blocks.map((b) => b.type)).toEqual(['cardio', 'strength', 'strength', 'mobility', 'cardio']);
    expect(s.blocks[0]).toMatchObject({ modality: 'stairs', role: 'warmup', name: 'Лестница', durationSec: 600 });
    expect(s.blocks[1]).toMatchObject({
      type: 'strength', superset: false,
      items: [{ exerciseId: 'ex:squat', sets: [
        { weightKg: 85, reps: 8, rpe: 7, done: true, load: 'normal' },
        { weightKg: 85, reps: 8, done: true, load: 'normal' },
        { weightKg: 85, reps: 8, done: true, load: 'normal' },
      ] }],
    });
    expect(s.blocks[2]).toMatchObject({ items: [{ exerciseId: 'ex:lunge', sets: [{ weightKg: 15, reps: 12, perSide: true }, { perSide: true }, { perSide: true }] }] });
    expect(s.blocks[3]).toMatchObject({ type: 'mobility', items: [{ exerciseId: 'ex:core', durationSec: 600 }] });
    expect(s.blocks[4]).toMatchObject({ modality: 'indoor_bike', role: 'finisher', name: 'Велотренажёр', durationSec: 900, notes: 'зона 2' });
  });

  it('Тренировка 2: подтягивания +10 кг (added) и суперсет A из двух упражнений', () => {
    const s = byTitle(plan, 'Тренировка 2').draft;
    expect(s.type).toBe('strength');
    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[0]).toMatchObject({ items: [{ exerciseId: 'ex:pullup', sets: [{ weightKg: 10, load: 'added', reps: 8 }] }] });
    expect(s.blocks[1]).toMatchObject({
      superset: true,
      items: [{ exerciseId: 'ex:curl', sets: [{ weightKg: 16, reps: 13 }] }, { exerciseId: 'ex:legraise', sets: [{ reps: 12 }] }],
    });
  });

  it('Pull day 26.04: подтягивания в тренажёре с противовесом 18,5 кг — отдельное упражнение и другая нагрузка', () => {
    const b = byTitle(plan, 'Pull day', '2026-04-26').draft.blocks[0]!;
    expect(b).toMatchObject({ items: [{ exerciseId: 'ex:assisted', sets: [{ weightKg: 18.5, load: 'assisted', reps: 12 }] }] });
  });

  it('Тренировка 3: комплекс #005, «9 раундов»', () => {
    const s = byTitle(plan, 'Тренировка 3').draft;
    expect(s.type).toBe('conditioning');
    expect(s.blocks[0]).toMatchObject({ type: 'conditioning', complexId: '#005', format: 'AMRAP', timeCapMin: 15, result: { rounds: 9 } });
  });

  it('Push day 11.08: свой комплекс с названием, #002, 3 раунда + 7, RPE 8', () => {
    const s = byTitle(plan, 'Push day').draft;
    expect(s.type).toBe('mixed');
    expect(s.blocks[0]).toMatchObject({ name: 'SkiErg 500 + гребля 500', complexId: '#002', format: 'AMRAP', timeCapMin: 20, result: { rounds: 3, extraReps: 7 }, rpe: 8 });
  });

  it('пробежка 3,09 км за 24:08 с темпом часов 7:46: хранится расчётный 7:49 (критерий приёмки)', () => {
    const b = byTitle(plan, 'Бег', '2026-05-29').draft.blocks[0]!;
    expect(b).toMatchObject({ type: 'cardio', modality: 'run', role: 'main', name: 'Бег', distanceM: 3090, durationSec: 1448, paceSecPerKm: 469, recordedPace: 466 });
    expect(byTitle(plan, 'Бег', '2026-05-29').draft.type).toBe('cardio');
  });

  it('пробежка 4,2 км за 35:51, темп 8:24, заметка', () => {
    expect(byTitle(plan, 'Бег', '2026-09-16').draft.blocks[0]).toMatchObject({ distanceM: 4200, durationSec: 2151, recordedPace: 504, paceSecPerKm: 512, notes: 'Endurance Foundation' });
  });

  it('лестница 20 мин, 80 этажей — разминка; подход на время «статика» без повторов', () => {
    expect(byTitle(plan, 'Pull day', '2026-08-03').draft.blocks[0]).toMatchObject({ modality: 'stairs', role: 'warmup', durationSec: 1200, floors: 80 });
    expect(byTitle(plan, 'Pull day', '2026-03-08').draft.blocks[0]).toMatchObject({
      items: [{ exerciseId: 'ex:backext', sets: [{ durationSec: 90, done: true }], note: 'статика' }],
    });
    expect(byTitle(plan, 'Pull day', '2026-03-08').draft.blocks[0]).not.toHaveProperty('items.0.sets.0.reps');
  });

  it('все тренировки помечены завершёнными, блоки с детерминированными id', () => {
    for (const s of plan.sessions) {
      expect(s.draft.finishedAt).toBeDefined();
      s.draft.blocks.forEach((b, i) => expect(b.id).toBe(`${s.id}:${i}`));
    }
  });

  it('повторный разбор того же файла даёт то же самое (идемпотентность)', () => {
    expect(importCsv(TEMPLATE)).toEqual(plan);
  });
});

describe('ошибки: строка не импортируется', () => {
  const one = (cells: Record<string, string | number>, over: Partial<ImportOptions> = {}) => importCsv(file(cells), over);
  const msgOf = (plan: ReturnType<typeof importCsv>) => errors(plan).map((e) => `${e.row}: ${e.message}`);

  it.each([
    ['неверная дата', set({ date: '31.02.2026' }), /Дата «31.02.2026» не распознана/],
    ['дата не по формату', set({ date: '20/10/2026' }), /не распознана/],
    ['пустая дата', set({ date: '' }), /Не указана дата/],
    ['дата в будущем', set({ date: '28.10.2026' }), /в будущем/],
    ['нет названия тренировки', set({ session: '' }), /название тренировки/],
    ['неизвестный kind', set({ kind: 'sett' }), /Неизвестный тип строки «sett»/],
    ['нет kind', set({ kind: '' }), /Не указан тип строки/],
    ['нет order', set({ order: '' }), /порядок блока/],
    ['order не число', set({ order: 'x' }), /order/],
    ['у подхода нет повторов и времени', set({ reps: '' }), /ни повторов, ни времени/],
    ['нет упражнения у подхода', set({ exercise: '' }), /Не указано упражнение/],
    ['отрицательный вес', set({ weight_kg: '-5' }), /weight_kg/],
    ['вес — не число', set({ weight_kg: 'много' }), /weight_kg/],
    ['дробные повторы', set({ reps: '8,5' }), /reps/],
    ['неизвестная нагрузка', set({ load: 'heavy' }), /load/],
    ['per_side не 0/1', set({ per_side: 'maybe' }), /per_side/],
    ['RPE 11', set({ rpe: 11 }), /RPE — целое число от 1 до 10/],
    ['RPE 0', set({ rpe: 0 }), /RPE/],
    ['RPE дробный', set({ rpe: '7,5' }), /RPE/],
    ['RPE тренировки 12', set({ session_rpe: 12 }), /session_rpe/],
    ['время без двоеточия', set({ reps: '', duration: '90' }), /мм:сс/],
    ['время 1:75', set({ reps: '', duration: '1:75' }), /мм:сс/],
  ])('%s', (_name, cells, re) => {
    const plan = one(cells);
    expect(plan.sessions).toEqual([]);
    expect(plan.stats.skippedRows).toBe(1);
    expect(msgOf(plan).join('\n')).toMatch(re);
    expect(errors(plan)[0]!.row).toBe(2);
  });

  it.each([
    ['у кардио нет ни дистанции, ни времени', { kind: 'cardio', modality: 'run' }, /ни дистанции, ни времени/],
    ['нет modality', { kind: 'cardio', duration: '10:00' }, /Не указан вид кардио/],
    ['неизвестный вид', { kind: 'cardio', modality: 'swim', duration: '10:00' }, /неизвестный вид «swim»/],
    ['неизвестная роль', { kind: 'cardio', modality: 'run', duration: '10:00', role: 'cooldown' }, /role/],
    ['пульс 400', { kind: 'cardio', modality: 'run', duration: '10:00', avg_hr: 400 }, /avg_hr/],
    ['темп не время', { kind: 'cardio', modality: 'run', duration: '10:00', pace: 'быстро' }, /pace/],
    ['нет формата комплекса', { kind: 'complex', rounds: 9 }, /формат/],
    ['неизвестный формат', { kind: 'complex', complex_format: 'SPRINT' }, /complex_format/],
    ['мобильность без упражнения', { kind: 'mobility', duration: '10:00' }, /Не указано упражнение/],
  ])('%s', (_name, extra, re) => {
    const plan = one({ date: '20.10.2026', session: 'Т', order: 1, ...extra } as Record<string, string | number>);
    expect(plan.sessions).toEqual([]);
    expect(msgOf(plan).join('\n')).toMatch(re);
  });

  it('плохая строка не мешает остальным; тренировка, у которой все строки с ошибками, не создаётся', () => {
    const plan = importCsv(file(set(), set({ set_no: 2, reps: '' }), set({ session: 'Пустая', reps: '' })));
    expect(plan.sessions.map((s) => s.draft.title)).toEqual(['Т']);
    expect(byTitle(plan, 'Т').draft.blocks[0]).toMatchObject({ items: [{ sets: [{ reps: 8 }] }] });
    expect(errors(plan).map((e) => e.row)).toEqual([3, 4]);
    expect(warnings(plan)).toEqual([]);
    expect(plan.stats).toMatchObject({ rows: 3, importedRows: 1, skippedRows: 2, sessions: 1 });
  });

  it('несколько ошибок в одной строке сообщаются все', () => {
    const plan = one(set({ date: '31.02.2026', rpe: 11, load: 'heavy' }));
    expect(errors(plan).length).toBeGreaterThanOrEqual(3);
  });

  it('файл без обязательных колонок: ничего не импортируется, ошибка уровня файла', () => {
    const plan = buildImport(parseCsvText('session,kind\nТ,set'), opts());
    expect(plan.sessions).toEqual([]);
    expect(plan.issues.map((i) => i.row)).toEqual([null, null]);
    expect(plan.issues[0]!.message).toMatch(/нет обязательной колонки «date»/);
  });
});

describe('предупреждения: строка импортируется', () => {
  it('темп с часов расходится с расчётным больше чем на 5%', () => {
    const plan = importCsv(file({ date: '20.10.2026', session: 'Бег', kind: 'cardio', order: 1, modality: 'run', distance_km: '3,09', duration: '24:08', pace: '6:00' }));
    expect(plan.sessions).toHaveLength(1);
    expect(warnings(plan)[0]!.message).toBe('Темп с часов 6:00 отличается от расчётного 7:49 больше чем на 5%');
  });
  it('небольшое расхождение (до 5%) предупреждения не даёт', () => {
    const plan = importCsv(file({ date: '20.10.2026', session: 'Бег', kind: 'cardio', order: 1, modality: 'run', distance_km: '3.09', duration: '24:08', pace: "7'46''" }));
    expect(warnings(plan)).toEqual([]);
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({ distanceM: 3090, recordedPace: 466 });
  });
  it('неизвестный session_type: определяется по содержимому', () => {
    const plan = importCsv(file(set({ session_type: 'yoga' })));
    expect(plan.sessions[0]!.draft.type).toBe('strength');
    expect(warnings(plan)[0]!.message).toMatch(/Неизвестный тип тренировки «yoga»/);
  });
  it('явный session_type важнее вычисленного, пустой — вычисляется', () => {
    expect(importCsv(file(set({ session_type: 'mixed' }))).sessions[0]!.draft.type).toBe('mixed');
    expect(importCsv(file(set())).sessions[0]!.draft.type).toBe('strength');
  });
  it('два упражнения в одном блоке без буквы суперсета объединяются в суперсет', () => {
    const plan = importCsv(file(set(), set({ exercise: 'Подтягивания', weight_kg: '' })));
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({ superset: true });
    expect(warnings(plan)[0]!.message).toMatch(/без буквы суперсета/);
  });
  it('буква суперсета у одного упражнения суперсета не создаёт', () => {
    const plan = importCsv(file(set({ superset: 'A' })));
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({ superset: false });
    expect(warnings(plan)).toEqual([]);
  });
  it('длительность и RPE тренировки в разных строках: берутся из любой, при расхождении — первая и предупреждение', () => {
    const ok = importCsv(file(set(), set({ set_no: 2, duration_min: 66, session_rpe: 8 })));
    expect(ok.sessions[0]!.draft).toMatchObject({ durationMin: 66, rpe: 8 });
    const diff = importCsv(file(set({ duration_min: 60 }), set({ set_no: 2, duration_min: 70 })));
    expect(diff.sessions[0]!.draft.durationMin).toBe(60);
    expect(warnings(diff).some((w) => /по-разному/.test(w.message))).toBe(true);
  });
});

describe('форматы значений', () => {
  it('десятичная запятая и точка, время мм:сс и ч:мм:сс, регистр перечислений', () => {
    const plan = importCsv(file(
      set({ weight_kg: '18,5', load: 'ASSISTED', per_side: 'да', duration: '1:05:10' }),
      { date: '20.10.2026', session: 'Т', kind: 'CARDIO', order: 2, modality: 'RUN', role: 'Finisher', distance_km: '3,09', duration: '24:08' },
      { date: '20.10.2026', session: 'Т', kind: 'complex', order: 3, complex_format: 'amrap', rounds: 9 },
    ));
    expect(errors(plan)).toEqual([]);
    const [a, b, c] = plan.sessions[0]!.draft.blocks;
    expect(a).toMatchObject({ items: [{ sets: [{ weightKg: 18.5, load: 'assisted', perSide: true, durationSec: 3910, reps: 8 }] }] });
    expect(b).toMatchObject({ modality: 'run', role: 'finisher', distanceM: 3090 });
    expect(c).toMatchObject({ format: 'AMRAP', result: { rounds: 9 } });
  });
  it('заметки note → заметка тренировки; несколько склеиваются', () => {
    const plan = importCsv(file(set(), { date: '20.10.2026', session: 'Т', kind: 'note', order: 9, notes: 'спал 6 ч' }, { date: '20.10.2026', session: 'Т', kind: 'note', order: 9, notes: 'ноги тяжёлые' }));
    expect(plan.sessions[0]!.draft.notes).toBe('спал 6 ч\nноги тяжёлые');
    expect(plan.sessions[0]!.draft.blocks).toHaveLength(1);
  });
  it('номера подходов определяют порядок; без номеров — порядок строк', () => {
    const plan = importCsv(file(set({ set_no: 2, reps: 5 }), set({ set_no: 1, reps: 8 }), set({ set_no: '', reps: 3 })));
    const sets = (plan.sessions[0]!.draft.blocks[0] as { items: { sets: { reps: number }[] }[] }).items[0]!.sets;
    expect(sets.map((s) => s.reps)).toEqual([8, 5, 3]);
  });
  it('строки одной тренировки в разных местах файла объединяются по дате и названию', () => {
    const plan = importCsv(file(set({ order: 1 }), set({ session: 'Другая', order: 1 }), set({ order: 2, exercise: 'Подтягивания', weight_kg: '' })));
    expect(plan.sessions.map((s) => s.draft.title)).toEqual(['Т', 'Другая']);
    expect(plan.sessions[0]!.draft.blocks).toHaveLength(2);
  });
  it('название тренировки сравнивается без учёта регистра и пробелов', () => {
    const plan = importCsv(file(set({ session: 'Pull Day' }), set({ session: ' pull  day ', set_no: 2 })));
    expect(plan.sessions).toHaveLength(1);
  });
  it('блоки разных видов с одним order не склеиваются', () => {
    const plan = importCsv(file(set({ order: 1 }), { date: '20.10.2026', session: 'Т', kind: 'cardio', order: 1, modality: 'run', duration: '10:00' }));
    expect(plan.sessions[0]!.draft.blocks.map((b) => b.type)).toEqual(['strength', 'cardio']);
  });
});

describe('упражнения: сопоставление и новые', () => {
  it('известное название находится, регистр и ё не важны', () => {
    const plan = importCsv(file(set({ exercise: 'ПРИСЕД со штангой' }), set({ order: 2, exercise: 'подъемы ног в висе', weight_kg: '' })));
    expect(plan.newExercises).toEqual([]);
    const ids = plan.sessions[0]!.draft.blocks.map((b) => (b.type === 'strength' ? b.items[0]!.exerciseId : ''));
    expect(ids).toEqual(['ex:squat', 'ex:legraise']);
  });

  it('неизвестное название — будет создано своё упражнение с детерминированным id и выведенными свойствами', () => {
    const plan = importCsv(file(
      set({ exercise: 'Фермерская прогулка', weight_kg: 24, reps: 40, per_side: '' }),
      set({ order: 2, exercise: 'Отжимания на кольцах', weight_kg: '', reps: 12 }),
      { date: '20.10.2026', session: 'Т', kind: 'mobility', order: 3, exercise: 'Растяжка бедра', duration: '1:30' },
      set({ order: 4, exercise: 'Планка', weight_kg: '', reps: '', duration: '1:00' }),
    ));
    expect(plan.newExercises.map((e) => e.name)).toEqual(['Фермерская прогулка', 'Отжимания на кольцах', 'Растяжка бедра', 'Планка']);
    const [farmer, rings, stretch, plank] = plan.newExercises;
    expect(farmer!.id).toBe(`imp-ex-${shortHash('фермерская прогулка')}`);
    expect(farmer!.content).toMatchObject({ isCustom: true, kind: 'strength', metrics: 'weight_reps', perSide: false });
    expect(rings!.content).toMatchObject({ kind: 'bodyweight', metrics: 'reps', equipment: 'bodyweight' });
    expect(stretch!.content).toMatchObject({ kind: 'mobility', metrics: 'time' });
    expect(plank!.content).toMatchObject({ metrics: 'time' });
    expect(farmer!.rows).toEqual([2]);
    // Блоки ссылаются на эти id
    const first = plan.sessions[0]!.draft.blocks[0]!;
    expect(first.type === 'strength' && first.items[0]!.exerciseId).toBe(farmer!.id);
  });

  it('одно новое название в нескольких строках — одно упражнение, строки запоминаются', () => {
    const plan = importCsv(file(set({ exercise: 'Новое', set_no: 1 }), set({ exercise: 'Новое', set_no: 2 }), set({ date: '21.10.2026', exercise: 'новое' })));
    expect(plan.newExercises).toHaveLength(1);
    expect(plan.newExercises[0]!.rows).toEqual([2, 3, 4]);
  });

  it('выбор человека: сопоставить с существующим или принудительно создать своё', () => {
    const f = file(set({ exercise: 'Приседы' }), set({ order: 2, exercise: 'Присед со штангой' }));
    const mapped = importCsv(f, { resolutions: { приседы: 'ex:squat' } });
    expect(mapped.newExercises).toEqual([]);
    expect((mapped.sessions[0]!.draft.blocks[0] as { items: { exerciseId: string }[] }).items[0]!.exerciseId).toBe('ex:squat');

    const forcedNew = importCsv(f, { resolutions: { 'присед со штангой': 'new' } });
    expect(forcedNew.newExercises.map((e) => e.name)).toEqual(['Приседы', 'Присед со штангой']);
  });

  it('неоднозначное название: выбран первый кандидат и показан выбор', () => {
    const matcher = createMatcher([...ITEMS, { id: 'ex:board1', name: 'Планка' }, { id: 'ex:board2', name: 'Планка' }]);
    const plan = importCsv(file(set({ exercise: 'Планка', weight_kg: '', reps: 10 })), { matcher });
    expect(plan.ambiguous).toEqual([{ key: 'планка', name: 'Планка', candidates: ['ex:board1', 'ex:board2'], chosen: 'ex:board1' }]);
    const chosen = importCsv(file(set({ exercise: 'Планка', weight_kg: '', reps: 10 })), { matcher, resolutions: { планка: 'ex:board2' } });
    expect(chosen.ambiguous).toEqual([]);
    expect((chosen.sessions[0]!.draft.blocks[0] as { items: { exerciseId: string }[] }).items[0]!.exerciseId).toBe('ex:board2');
  });

  it('запомненные сопоставления из прошлых импортов применяются', () => {
    const matcher = createMatcher(ITEMS, { remembered: [{ alias: 'Присед со штангой (мой)', exerciseId: 'ex:squat' }] });
    expect(importCsv(file(set({ exercise: 'присед со штангой (мой)' })), { matcher }).newExercises).toEqual([]);
  });

  it('название кардио и комплекса упражнением не считается', () => {
    const plan = importCsv(file({ date: '20.10.2026', session: 'Т', kind: 'cardio', order: 1, exercise: 'Бег куда-то', modality: 'run', duration: '10:00' }));
    expect(plan.newExercises).toEqual([]);
  });
});

describe('комплексы из библиотеки', () => {
  const library = [{ id: '#005', title: 'AMRAP 15 мин, вес тела', format: 'AMRAP' as const, timeCapMin: 15, description: '6 подтягиваний → …' }];
  const row = { date: '18.10.2026', session: 'Т3', kind: 'complex', order: 5, rounds: 9 };

  it('формат, лимит, название и состав берутся из библиотеки, если не указаны в файле', () => {
    const plan = importCsv(file({ ...row, complex_id: '5' }), { complexes: library });
    expect(errors(plan)).toEqual([]);
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({
      complexId: '#005', format: 'AMRAP', timeCapMin: 15, name: 'AMRAP 15 мин, вес тела', description: '6 подтягиваний → …', result: { rounds: 9 },
    });
  });
  it('значения из файла важнее библиотеки', () => {
    const plan = importCsv(file({ ...row, complex_id: '#005', complex_format: 'EMOM', time_cap_min: 12, exercise: 'Моё название' }), { complexes: library });
    expect(plan.sessions[0]!.draft.blocks[0]).toMatchObject({ format: 'EMOM', timeCapMin: 12, name: 'Моё название' });
  });
  it('комплекса нет в библиотеке: записан как есть с предупреждением; без формата — ошибка', () => {
    const ok = importCsv(file({ ...row, complex_id: '#099', complex_format: 'AMRAP' }), { complexes: library });
    expect(ok.sessions).toHaveLength(1);
    expect(warnings(ok)[0]!.message).toMatch(/Комплекса #099 нет в библиотеке/);
    expect(errors(importCsv(file({ ...row, complex_id: '#099' }), { complexes: library }))[0]!.message).toMatch(/формат/);
  });
  it('библиотека не передана: предупреждений о библиотеке нет', () => {
    expect(warnings(importCsv(file({ ...row, complex_id: '#099', complex_format: 'AMRAP' })))).toEqual([]);
  });
});

describe('повторный импорт', () => {
  const existing = [{ id: 'my-uuid', date: '2026-10-20', title: 'тренировка 1' }];

  it('тренировка с той же датой и названием заменяет существующую и сохраняет её id', () => {
    const plan = importCsv(TEMPLATE, { existing });
    const t1 = byTitle(plan, 'Тренировка 1');
    expect(t1.replaces).toBe(true);
    expect(t1.id).toBe('my-uuid');
    expect(t1.draft.id).toBe('my-uuid');
    expect(t1.draft.blocks[0]!.id).toBe('my-uuid:0');
    expect(plan.sessions.filter((s) => s.replaces)).toHaveLength(1);
  });
  it('без существующих id детерминированные и одинаковые при повторном разборе', () => {
    const a = importCsv(TEMPLATE);
    const b = importCsv(TEMPLATE);
    expect(a.sessions.map((s) => s.id)).toEqual(b.sessions.map((s) => s.id));
    expect(new Set(a.sessions.map((s) => s.id)).size).toBe(a.sessions.length);
    expect(a.sessions.every((s) => s.id.startsWith('imp-'))).toBe(true);
  });
  it('другая дата или другое название — не замена', () => {
    const plan = importCsv(TEMPLATE, { existing: [{ id: 'x', date: '2026-10-21', title: 'Тренировка 1' }, { id: 'y', date: '2026-10-20', title: 'Тренировка 11' }] });
    expect(plan.sessions.some((s) => s.replaces)).toBe(false);
  });
});
