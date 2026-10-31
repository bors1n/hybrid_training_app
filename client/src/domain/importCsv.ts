import {
  CARDIO_ROLES,
  DateStringSchema,
  FORMATS,
  LOADS,
  MODALITIES,
  SESSION_TYPES,
  SessionRecordSchema,
  type Block,
  type CardioBlock,
  type ConditioningBlock,
  type ExerciseContent,
  type SessionRecord,
  type SessionType,
  type SetEntry,
  type StrengthBlock,
} from '@hybridlog/shared';
import type { Table, TableRow } from './csvText.ts';
import type { Matcher } from './matching.ts';
import { normalizeName } from './matching.ts';
import type { SessionDraft } from './sessionEdit.ts';
import { deriveSessionType } from './sessionType.ts';
import { formatPace, paceDeviationPct, paceFromDistanceTime, parseDecimal, parseDuration } from './units.ts';

export interface ImportIssue {
  /** Номер строки файла; null — замечание ко всему файлу. */
  row: number | null;
  severity: 'error' | 'warning';
  message: string;
}

export interface NewExercise {
  /** Нормализованное название — ключ для выбора человека. */
  key: string;
  name: string;
  id: string;
  content: ExerciseContent;
  rows: number[];
}

export interface AmbiguousName {
  key: string;
  name: string;
  candidates: string[];
  chosen: string;
}

export interface PlannedSession {
  id: string;
  key: string;
  draft: SessionDraft;
  rows: number[];
  /** В журнале уже есть тренировка с той же датой и названием: импорт заменит её. */
  replaces: boolean;
}

export interface ImportStats {
  rows: number;
  importedRows: number;
  skippedRows: number;
  sessions: number;
  sets: number;
  cardio: number;
  complexes: number;
  mobility: number;
}

export interface ImportPlan {
  sessions: PlannedSession[];
  newExercises: NewExercise[];
  ambiguous: AmbiguousName[];
  issues: ImportIssue[];
  stats: ImportStats;
}

export interface LibraryComplex {
  id: string;
  title: string;
  format: ConditioningBlock['format'];
  timeCapMin?: number | undefined;
  description?: string | undefined;
}

export interface ImportOptions {
  /** Сегодняшняя дата, ГГГГ-ММ-ДД: тренировки в будущем не импортируются. */
  today: string;
  matcher: Matcher;
  /** Выбор человека: нормализованное название → id упражнения или 'new' («создать своё»). */
  resolutions?: Readonly<Record<string, string>>;
  complexes?: readonly LibraryComplex[];
  existing?: readonly Pick<SessionRecord, 'id' | 'date' | 'title'>[];
}

/** Короткий детерминированный хэш (два прохода FNV-1a): одинаковые данные дают одинаковые id на любом устройстве. */
export function shortHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_RU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const UINT = /^\d+$/;
const pad2 = (n: string): string => n.padStart(2, '0');

/** «20.10.2026» или «2026-10-20» → «2026-10-20»; несуществующая дата — null. */
export function parseImportDate(s: string): string | null {
  const iso = DATE_ISO.exec(s);
  const ru = DATE_RU.exec(s);
  const candidate = iso ? s : ru ? `${ru[3]}-${pad2(ru[2]!)}-${pad2(ru[1]!)}` : null;
  return candidate && DateStringSchema.safeParse(candidate).success ? candidate : null;
}

/** «#005», «005», «5» → «#005». */
export function normalizeComplexId(s: string): string {
  const m = /^#?(\d{1,3})$/.exec(s.trim());
  return m ? `#${m[1]!.padStart(3, '0')}` : s.trim();
}

type Common = { row: number; index: number; order: number; sessionKey: string; date: string; title: string };
type Parsed = Common &
  (
    | { kind: 'set'; exerciseId: string; letter: string; setNo: number | undefined; set: SetEntry; notes: string }
    | { kind: 'cardio'; block: Omit<CardioBlock, 'id'> }
    | { kind: 'complex'; block: Omit<ConditioningBlock, 'id'> }
    | { kind: 'mobility'; exerciseId: string; durationSec: number | undefined; notes: string }
    | { kind: 'note'; text: string }
  );

const KINDS = ['set', 'cardio', 'complex', 'mobility', 'note'] as const;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Строки шаблона → тренировки и отчёт. Чистая функция: ничего не пишет в базу.
 * Ошибка в строке — строка пропускается; предупреждение — строка импортируется.
 */
export function buildImport(table: Table, opts: ImportOptions): ImportPlan {
  const issues: ImportIssue[] = [];
  const newByKey = new Map<string, NewExercise>();
  const ambiguousByKey = new Map<string, AmbiguousName>();
  const librarySet = new Map((opts.complexes ?? []).map((c) => [c.id, c]));

  for (const col of table.missingColumns) {
    issues.push({ row: null, severity: 'error', message: `В файле нет обязательной колонки «${col}». Возьмите заголовок из шаблона.` });
  }
  if (table.missingColumns.length > 0) return emptyPlan(table, issues);

  /* ---------- упражнения ---------- */
  function resolveExercise(name: string, row: number, hint: { kind: ExerciseContent['kind']; weight: boolean; reps: boolean; time: boolean; perSide: boolean }): string {
    const key = normalizeName(name);
    const forced = opts.resolutions?.[key];
    if (forced && forced !== 'new') return forced;
    if (!forced) {
      const m = opts.matcher.match(name);
      if (m.status === 'exact') return m.id;
      if (m.status === 'ambiguous') {
        if (!ambiguousByKey.has(key)) ambiguousByKey.set(key, { key, name, candidates: m.ids, chosen: m.ids[0]! });
        return m.ids[0]!;
      }
    }
    const existing = newByKey.get(key);
    if (existing) {
      existing.rows.push(row);
      return existing.id;
    }
    const id = `imp-ex-${shortHash(key)}`;
    const metrics: ExerciseContent['metrics'] = hint.weight ? 'weight_reps' : hint.reps || !hint.time ? 'reps' : 'time';
    const kind: ExerciseContent['kind'] = hint.kind === 'mobility' ? 'mobility' : hint.weight || hint.time ? 'strength' : 'bodyweight';
    newByKey.set(key, {
      key,
      name,
      id,
      rows: [row],
      content: {
        name,
        aliases: [],
        kind,
        equipment: hint.weight ? 'none' : 'bodyweight',
        muscles: { primary: [], secondary: [] },
        perSide: hint.perSide,
        metrics: hint.kind === 'mobility' ? 'time' : metrics,
        isCustom: true,
      },
    });
    return id;
  }

  /* ---------- разбор строк ---------- */
  const parsed: Parsed[] = [];
  const sessionMeta = new Map<string, { durationMin?: number; rpe?: number; type?: SessionType; firstRow: number }>();
  let skipped = 0;

  table.rows.forEach((tr, index) => {
    const p = parseRow(tr, index);
    if (p) parsed.push(p);
    else skipped += 1;
  });

  function parseRow(tr: TableRow, index: number): Parsed | null {
    const { row, cells: c } = tr;
    let bad = false;
    const err = (message: string): void => {
      issues.push({ row, severity: 'error', message });
      bad = true;
    };
    const warn = (message: string): void => {
      issues.push({ row, severity: 'warning', message });
    };

    const uint = (v: string, label: string, max?: number): number | undefined => {
      if (v === '') return undefined;
      const n = UINT.test(v) ? Number(v) : NaN;
      if (!Number.isInteger(n) || (max !== undefined && n > max)) {
        err(`«${label}»: нужно целое неотрицательное число, а не «${v}»`);
        return undefined;
      }
      return n;
    };
    const dec = (v: string, label: string): number | undefined => {
      if (v === '') return undefined;
      const n = parseDecimal(v);
      if (n === null || n < 0) {
        err(`«${label}»: нужно неотрицательное число (точка или запятая), а не «${v}»`);
        return undefined;
      }
      return n;
    };
    const dur = (v: string, label: string): number | undefined => {
      if (v === '') return undefined;
      const n = parseDuration(v);
      if (n === null) {
        err(`«${label}»: время в формате мм:сс или ч:мм:сс, а не «${v}»`);
        return undefined;
      }
      return n;
    };
    const rpe = (v: string, label: string): number | undefined => {
      if (v === '') return undefined;
      const n = UINT.test(v) ? Number(v) : NaN;
      if (!(n >= 1 && n <= 10)) {
        err(`«${label}»: RPE — целое число от 1 до 10, а не «${v}»`);
        return undefined;
      }
      return n;
    };

    const date = parseImportDate(c.date);
    if (date === null) err(c.date === '' ? 'Не указана дата' : `Дата «${c.date}» не распознана: нужен формат ДД.ММ.ГГГГ`);
    else if (date > opts.today) err(`Дата ${c.date} в будущем`);
    if (c.session === '') err('Не указано название тренировки («session»)');
    const kind = c.kind.toLowerCase();
    if (!has(KINDS, kind)) err(c.kind === '' ? 'Не указан тип строки («kind»)' : `Неизвестный тип строки «${c.kind}»: ожидается set, cardio, complex, mobility или note`);
    const order = c.order === '' ? undefined : uint(c.order, 'order');
    if (c.order === '') err('Не указан порядок блока («order»)');

    const durationMin = c.duration_min === '' ? undefined : dec(c.duration_min, 'duration_min');
    const sessionRpe = rpe(c.session_rpe, 'session_rpe');
    let sessionType: SessionType | undefined;
    if (c.session_type !== '') {
      const t = c.session_type.toLowerCase();
      if (has(SESSION_TYPES, t)) sessionType = t;
      else warn(`Неизвестный тип тренировки «${c.session_type}»: определён по содержимому`);
    }

    let body: Parsed | null = null;
    // Содержимое разбираем и при ошибке в дате или названии: человеку нужны все ошибки строки сразу.
    if (has(KINDS, kind)) body = parseBody(kind);
    if (bad || date === null || order === undefined || !has(KINDS, kind) || !body) return null;

    const title = c.session;
    const sessionKey = `${date}|${normalizeName(title)}`;
    const meta = sessionMeta.get(sessionKey) ?? { firstRow: row };
    if (durationMin !== undefined) {
      if (meta.durationMin !== undefined && meta.durationMin !== durationMin) warn(`Длительность тренировки указана по-разному (${meta.durationMin} и ${durationMin}): взята первая`);
      else meta.durationMin = durationMin;
    }
    if (sessionRpe !== undefined) {
      if (meta.rpe !== undefined && meta.rpe !== sessionRpe) warn(`RPE тренировки указан по-разному (${meta.rpe} и ${sessionRpe}): взят первый`);
      else meta.rpe = sessionRpe;
    }
    if (sessionType !== undefined && meta.type === undefined) meta.type = sessionType;
    sessionMeta.set(sessionKey, meta);

    return { ...body, row, index, order, sessionKey, date, title } as Parsed;

    function parseBody(k: (typeof KINDS)[number]): Parsed | null {
      const base = { row, index, order: order ?? 0, sessionKey: '', date: date ?? '', title: '' };
      if (k === 'note') {
        return c.notes === '' ? (warn('Пустая заметка'), null) : { ...base, kind: 'note', text: c.notes };
      }

      if (k === 'set') {
        const weightKg = dec(c.weight_kg, 'weight_kg');
        const reps = uint(c.reps, 'reps', 10_000);
        const durationSec = dur(c.duration, 'duration');
        const load = c.load === '' ? 'normal' : c.load.toLowerCase();
        if (!has(LOADS, load)) err(`«load»: normal, added или assisted, а не «${c.load}»`);
        const perSide = parsePerSide(c.per_side);
        if (c.exercise === '') err('Не указано упражнение');
        if (reps === undefined && durationSec === undefined && !bad) err('У подхода нет ни повторов, ни времени');
        const setNo = c.set_no === '' ? undefined : uint(c.set_no, 'set_no', 1000);
        const r = rpe(c.rpe, 'rpe');
        if (bad) return null;
        const exerciseId = resolveExercise(c.exercise, row, { kind: 'strength', weight: weightKg !== undefined, reps: reps !== undefined, time: durationSec !== undefined, perSide: perSide === true });
        const set: SetEntry = { done: true, load: load as SetEntry['load'] };
        if (weightKg !== undefined) set.weightKg = weightKg;
        if (reps !== undefined) set.reps = reps;
        if (durationSec !== undefined) set.durationSec = durationSec;
        if (perSide) set.perSide = true;
        if (r !== undefined) set.rpe = r;
        return { ...base, kind: 'set', exerciseId, letter: c.superset.toUpperCase(), setNo, set, notes: c.notes };
      }

      if (k === 'mobility') {
        const durationSec = dur(c.duration, 'duration');
        if (c.exercise === '') err('Не указано упражнение');
        if (bad) return null;
        const exerciseId = resolveExercise(c.exercise, row, { kind: 'mobility', weight: false, reps: false, time: true, perSide: false });
        return { ...base, kind: 'mobility', exerciseId, durationSec, notes: c.notes };
      }

      if (k === 'cardio') {
        const modality = c.modality.toLowerCase();
        if (!has(MODALITIES, modality)) err(c.modality === '' ? 'Не указан вид кардио («modality»)' : `«modality»: неизвестный вид «${c.modality}»`);
        const role = c.role === '' ? 'main' : c.role.toLowerCase();
        if (!has(CARDIO_ROLES, role)) err(`«role»: main, warmup или finisher, а не «${c.role}»`);
        const km = dec(c.distance_km, 'distance_km');
        const durationSec = dur(c.duration, 'duration');
        const watch = dur(c.pace, 'pace');
        const avgHr = uint(c.avg_hr, 'avg_hr', 250);
        const floors = uint(c.floors, 'floors', 10_000);
        const r = rpe(c.rpe, 'rpe');
        if (km === undefined && durationSec === undefined && !bad) err('У кардио нет ни дистанции, ни времени');
        if (bad) return null;
        const distanceM = km === undefined ? undefined : Math.round(km * 1000);
        const computed = distanceM !== undefined && durationSec !== undefined ? paceFromDistanceTime(distanceM, durationSec) : null;
        if (watch !== undefined && computed !== null && paceDeviationPct(watch, computed) > 5) {
          warn(`Темп с часов ${formatPace(watch)} отличается от расчётного ${formatPace(computed)} больше чем на 5%`);
        }
        const block: Omit<CardioBlock, 'id'> = { type: 'cardio', modality: modality as CardioBlock['modality'], role: role as CardioBlock['role'] };
        if (c.exercise !== '') block.name = c.exercise;
        if (distanceM !== undefined) block.distanceM = distanceM;
        if (durationSec !== undefined) block.durationSec = durationSec;
        if (computed !== null) block.paceSecPerKm = computed;
        if (watch !== undefined) block.recordedPace = watch;
        if (avgHr !== undefined) block.avgHr = avgHr;
        if (floors !== undefined) block.floors = floors;
        if (r !== undefined) block.rpe = r;
        if (c.notes !== '') block.notes = c.notes;
        return { ...base, kind: 'cardio', block };
      }

      // complex
      const complexId = c.complex_id === '' ? undefined : normalizeComplexId(c.complex_id);
      const lib = complexId ? librarySet.get(complexId) : undefined;
      // Пустая библиотека (ещё не создана) — не повод предупреждать про каждую строку.
      if (complexId && !lib && opts.complexes && opts.complexes.length > 0) warn(`Комплекса ${complexId} нет в библиотеке: записан как есть`);
      let format: ConditioningBlock['format'] | undefined;
      if (c.complex_format !== '') {
        const f = c.complex_format.toUpperCase();
        if (has(FORMATS, f)) format = f;
        else err(`«complex_format»: AMRAP, EMOM, FOR_TIME, TABATA, INTERVALS, LADDER, ROUNDS или OTHER, а не «${c.complex_format}»`);
      } else if (lib) format = lib.format;
      else err('У комплекса не указан формат («complex_format»)');
      const timeCap = c.time_cap_min === '' ? lib?.timeCapMin : dec(c.time_cap_min, 'time_cap_min');
      const timeSec = dur(c.duration, 'duration');
      const rounds = uint(c.rounds, 'rounds', 1000);
      const extraReps = uint(c.extra_reps, 'extra_reps', 10_000);
      const totalReps = uint(c.total_reps, 'total_reps', 100_000);
      const r = rpe(c.rpe, 'rpe');
      if (bad || !format) return null;
      const result: ConditioningBlock['result'] = {};
      if (rounds !== undefined) result.rounds = rounds;
      if (extraReps !== undefined) result.extraReps = extraReps;
      if (totalReps !== undefined) result.totalReps = totalReps;
      if (timeSec !== undefined) result.timeSec = timeSec;
      const block: Omit<ConditioningBlock, 'id'> = { type: 'conditioning', format, result };
      if (complexId) block.complexId = complexId;
      const name = c.exercise !== '' ? c.exercise : lib?.title;
      if (name) block.name = name;
      if (timeCap !== undefined) block.timeCapMin = timeCap;
      if (lib?.description) block.description = lib.description;
      if (r !== undefined) block.rpe = r;
      if (c.notes !== '') block.notes = c.notes;
      return { ...base, kind: 'complex', block };
    }

    function parsePerSide(v: string): boolean | undefined {
      const t = v.toLowerCase();
      if (t === '') return undefined;
      if (['1', 'true', 'да', 'yes', 'y'].includes(t)) return true;
      if (['0', 'false', 'нет', 'no', 'n'].includes(t)) return false;
      err(`«per_side»: 1 или 0, а не «${v}»`);
      return undefined;
    }
  }

  /* ---------- сборка тренировок ---------- */
  const bySession = new Map<string, Parsed[]>();
  for (const p of parsed) bySession.set(p.sessionKey, [...(bySession.get(p.sessionKey) ?? []), p]);

  const existingByKey = new Map((opts.existing ?? []).map((s) => [`${s.date}|${normalizeName(s.title)}`, s.id]));
  const sessions: PlannedSession[] = [];
  const stats: ImportStats = { rows: table.rows.length, importedRows: 0, skippedRows: skipped, sessions: 0, sets: 0, cardio: 0, complexes: 0, mobility: 0 };

  for (const [key, rows] of bySession) {
    const first = rows[0]!;
    const meta = sessionMeta.get(key)!;
    const replacedId = existingByKey.get(key);
    const id = replacedId ?? `imp-${first.date}-${shortHash(key)}`;

    const blocks = assembleBlocks(id, rows);
    const notes = rows.flatMap((r) => (r.kind === 'note' ? [r.text] : [])).join('\n');
    if (blocks.length === 0 && notes === '') {
      issues.push({ row: meta.firstRow, severity: 'warning', message: `Тренировка «${first.title}» от ${first.date} пропущена: в ней нет ни одной корректной строки` });
      stats.skippedRows += rows.length;
      continue;
    }

    const [y, m, d] = first.date.split('-').map(Number) as [number, number, number];
    const draft: SessionDraft = {
      id,
      date: first.date,
      title: first.title,
      type: meta.type ?? deriveSessionType(blocks),
      finishedAt: new Date(y, m - 1, d, 12, 0, 0).getTime(),
      blocks,
    };
    if (meta.durationMin !== undefined) draft.durationMin = meta.durationMin;
    if (meta.rpe !== undefined) draft.rpe = meta.rpe;
    if (notes !== '') draft.notes = notes;

    const check = SessionRecordSchema.safeParse({ ...draft, updatedAt: 1, deletedAt: null });
    if (!check.success) {
      const issue = check.error.issues[0];
      issues.push({ row: meta.firstRow, severity: 'error', message: `Тренировка «${first.title}» не прошла проверку: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim() });
      stats.skippedRows += rows.length;
      continue;
    }

    sessions.push({ id, key, draft, rows: rows.map((r) => r.row), replaces: replacedId !== undefined });
    for (const r of rows) {
      stats.importedRows += 1;
      if (r.kind === 'set') stats.sets += 1;
      else if (r.kind === 'cardio') stats.cardio += 1;
      else if (r.kind === 'complex') stats.complexes += 1;
      else if (r.kind === 'mobility') stats.mobility += 1;
    }
  }
  stats.sessions = sessions.length;

  // Порядок дат: тренировка раньше предыдущей в файле — скорее всего, ошибка в дате или порядке строк.
  let prev: PlannedSession | undefined;
  for (const s of sessions) {
    if (prev && s.draft.date < prev.draft.date) {
      issues.push({
        row: s.rows[0]!,
        severity: 'warning',
        message: `Дата ${ruDate(s.draft.date)} раньше предыдущей тренировки (${ruDate(prev.draft.date)}): проверьте порядок строк`,
      });
    }
    prev = s;
  }

  issues.sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return { sessions, newExercises: [...newByKey.values()], ambiguous: [...ambiguousByKey.values()], issues, stats };

  /** Блоки тренировки: по `order`; силовые и мобильность с одним order — один блок, остальные — по строке. */
  function assembleBlocks(sessionId: string, rows: Parsed[]): Block[] {
    type Slot = { order: number; first: number; build: (id: string) => Block };
    const slots: Slot[] = [];
    const strength = new Map<number, Slot & { items: Map<string, { sets: { no: number | undefined; i: number; set: SetEntry }[]; notes: string[] }>; letters: Set<string> }>();
    const mobility = new Map<number, Slot & { items: { exerciseId: string; durationSec: number | undefined; notes: string }[] }>();

    for (const r of rows) {
      if (r.kind === 'cardio') slots.push({ order: r.order, first: r.index, build: (id) => ({ ...r.block, id }) as Block });
      else if (r.kind === 'complex') slots.push({ order: r.order, first: r.index, build: (id) => ({ ...r.block, id }) as Block });
      else if (r.kind === 'set') {
        let g = strength.get(r.order);
        if (!g) {
          const group = {
            order: r.order,
            first: r.index,
            items: new Map<string, { sets: { no: number | undefined; i: number; set: SetEntry }[]; notes: string[] }>(),
            letters: new Set<string>(),
            build: (id: string): Block => buildStrength(id, group.items, group.letters, r.row),
          };
          g = group;
          strength.set(r.order, g);
          slots.push(g);
        }
        const item = g.items.get(r.exerciseId) ?? { sets: [], notes: [] };
        item.sets.push({ no: r.setNo, i: r.index, set: r.set });
        if (r.notes) item.notes.push(r.notes);
        g.items.set(r.exerciseId, item);
        if (r.letter) g.letters.add(r.letter);
      } else if (r.kind === 'mobility') {
        let g = mobility.get(r.order);
        if (!g) {
          const group = {
            order: r.order,
            first: r.index,
            items: [] as { exerciseId: string; durationSec: number | undefined; notes: string }[],
            build: (id: string): Block => ({
              type: 'mobility',
              id,
              items: group.items.map((i) => ({
                exerciseId: i.exerciseId,
                sets: [],
                ...(i.durationSec !== undefined ? { durationSec: i.durationSec } : {}),
                ...(i.notes ? { note: i.notes } : {}),
              })),
            }),
          };
          g = group;
          mobility.set(r.order, g);
          slots.push(g);
        }
        g.items.push({ exerciseId: r.exerciseId, durationSec: r.durationSec, notes: r.notes });
      }
    }

    function buildStrength(
      id: string,
      items: Map<string, { sets: { no: number | undefined; i: number; set: SetEntry }[]; notes: string[] }>,
      letters: Set<string>,
      row: number,
    ): StrengthBlock {
      if (items.size > 1 && letters.size === 0) {
        issues.push({ row, severity: 'warning', message: 'В одном блоке несколько упражнений без буквы суперсета: объединены в суперсет' });
      }
      return {
        type: 'strength',
        id,
        superset: items.size > 1,
        items: [...items].map(([exerciseId, it]) => ({
          exerciseId,
          // Подходы по номеру; без номеров — в порядке строк.
          sets: [...it.sets].sort((a, b) => (a.no ?? Infinity) - (b.no ?? Infinity) || a.i - b.i).map((s) => s.set),
          ...(it.notes.length > 0 ? { note: it.notes.join('; ') } : {}),
        })),
      };
    }

    return slots
      .sort((a, b) => a.order - b.order || a.first - b.first)
      .map((slot, i) => slot.build(`${sessionId}:${i}`));
  }
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function emptyPlan(table: Table, issues: ImportIssue[]): ImportPlan {
  return {
    sessions: [],
    newExercises: [],
    ambiguous: [],
    issues,
    stats: { rows: table.rows.length, importedRows: 0, skippedRows: table.rows.length, sessions: 0, sets: 0, cardio: 0, complexes: 0, mobility: 0 },
  };
}
