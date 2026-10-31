import type { SessionRecord } from '@hybridlog/shared';
import { toCsvText, type Column } from './csvText.ts';
import { compareSessionsAsc } from './lastPerformance.ts';
import { formatDuration } from './units.ts';

export interface ExportResult {
  /** Текст CSV: UTF-8 с BOM (иначе Excel на Windows ломает кириллицу), разделитель «,», десятичная точка. */
  csv: string;
  sessions: number;
  rows: number;
  /** Что в файл не попало или изменилось: показывается человеку после экспорта. */
  warnings: string[];
}

type Row = Partial<Record<Column, string | number | undefined>>;

const num = (n: number): string => String(Number(n.toFixed(3)));
const ruDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

/**
 * Тренировки → строки шаблона импорта (docs/import_template.csv). Обратная операция к `buildImport`:
 * импорт того, что экспортировано, даёт те же тренировки (проверяется тестами).
 * Подходы, не отмеченные выполненными, не экспортируются: это не то, что было сделано.
 */
export function exportSessionsCsv(sessions: readonly SessionRecord[], exerciseName: (exerciseId: string) => string | undefined): ExportResult {
  const warnings = new Set<string>();
  const rows: Row[] = [];
  const ordered = sessions.filter((s) => s.deletedAt === null).sort(compareSessionsAsc);

  for (const s of ordered) {
    const sessionRows: Row[] = [];
    const where = `«${s.title}» ${ruDate(s.date)}`;
    const nameOf = (id: string): string => {
      const n = exerciseName(id);
      if (!n) warnings.add(`${where}: упражнение «${id}» не найдено в каталоге, записано под своим кодом`);
      return n ?? id;
    };
    let supersets = 0;
    let skippedSets = 0;

    s.blocks.forEach((b, order) => {
      if (b.type === 'strength') {
        const letter = b.superset ? String.fromCharCode(65 + supersets++) : '';
        for (const item of b.items) {
          const done = item.sets.filter((x) => x.done);
          skippedSets += item.sets.length - done.length;
          done.forEach((set, i) => {
            if (set.reps === undefined && set.durationSec === undefined) {
              warnings.add(`${where}: подход без повторов и времени записан, но при импорте будет отклонён`);
            }
            sessionRows.push({
              kind: 'set',
              order,
              exercise: nameOf(item.exerciseId),
              superset: letter,
              set_no: i + 1,
              weight_kg: set.weightKg === undefined ? undefined : num(set.weightKg),
              load: set.load === 'normal' ? undefined : set.load,
              reps: set.reps,
              per_side: set.perSide ? 1 : undefined,
              duration: set.durationSec === undefined ? undefined : formatDuration(set.durationSec),
              rpe: set.rpe,
              notes: i === 0 ? item.note : undefined,
            });
          });
        }
      } else if (b.type === 'cardio') {
        if (b.inclinePct !== undefined) warnings.add(`${where}: наклон дорожки в шаблоне нет колонки, он не экспортируется`);
        sessionRows.push({
          kind: 'cardio',
          order,
          exercise: b.name,
          modality: b.modality,
          role: b.role,
          duration: b.durationSec === undefined ? undefined : formatDuration(b.durationSec),
          distance_km: b.distanceM === undefined ? undefined : num(b.distanceM / 1000),
          // Расчётный темп при импорте считается заново; в файл идёт только темп с часов.
          pace: b.recordedPace === undefined ? undefined : formatDuration(b.recordedPace),
          avg_hr: b.avgHr,
          floors: b.floors,
          rpe: b.rpe,
          notes: b.notes,
        });
      } else if (b.type === 'conditioning') {
        if (b.result.finished === false) warnings.add(`${where}: отметка «не уложился» в шаблоне нет колонки, она не экспортируется`);
        sessionRows.push({
          kind: 'complex',
          order,
          exercise: b.name,
          complex_id: b.complexId,
          complex_format: b.format,
          time_cap_min: b.timeCapMin === undefined ? undefined : num(b.timeCapMin),
          duration: b.result.timeSec === undefined ? undefined : formatDuration(b.result.timeSec),
          rounds: b.result.rounds,
          extra_reps: b.result.extraReps,
          total_reps: b.result.totalReps,
          rpe: b.rpe,
          notes: b.notes,
        });
      } else {
        if (b.durationSec !== undefined) warnings.add(`${where}: общее время блока мобильности в шаблоне нет колонки; время указано у упражнений`);
        for (const item of b.items) {
          sessionRows.push({
            kind: 'mobility',
            order,
            exercise: nameOf(item.exerciseId),
            duration: item.durationSec === undefined ? undefined : formatDuration(item.durationSec),
            notes: item.note,
          });
        }
      }
    });

    if (skippedSets > 0) warnings.add(`${where}: ${skippedSets} подходов не отмечены выполненными и не экспортированы`);
    if (s.notes) sessionRows.push({ kind: 'note', order: s.blocks.length, notes: s.notes });
    if (sessionRows.length === 0) {
      warnings.add(`${where}: нет данных для экспорта`);
      continue;
    }

    // Общие данные тренировки пишутся в первую строку (при импорте годится любая).
    const first = sessionRows[0]!;
    first.session_type = s.type;
    if (s.durationMin !== undefined) first.duration_min = num(s.durationMin);
    if (s.rpe !== undefined) first.session_rpe = s.rpe;
    for (const r of sessionRows) rows.push({ date: ruDate(s.date), session: s.title, ...r });
  }

  return { csv: '﻿' + toCsvText(rows), sessions: ordered.length, rows: rows.length, warnings: [...warnings] };
}
