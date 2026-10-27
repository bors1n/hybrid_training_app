import type { TemplateBlock } from '@splav/shared';
import { formatMinutesRange, formatPlan } from './planFormat.ts';
import { MODALITY_LABELS, ROLE_LABELS } from './sessionEdit.ts';

export interface BlockLine {
  /** «Присед со штангой — 3 × 6–8 · 85 кг». */
  text: string;
  /** Суперсет: строки блока идут вместе. */
  group?: 'superset';
}

/** Блок шаблона человеческим языком — для просмотра шаблона и подписей. */
export function describeBlock(b: TemplateBlock, nameOf: (exerciseId: string) => string): BlockLine[] {
  if (b.type === 'strength') {
    return b.items.map((i) => ({ text: `${nameOf(i.exerciseId)} — ${formatPlan(i.plan)}`, ...(b.superset ? { group: 'superset' as const } : {}) }));
  }
  if (b.type === 'cardio') {
    const time = formatMinutesRange(b.durationSec, b.durationSecMax);
    const role = b.role === 'main' ? '' : `${ROLE_LABELS[b.role]}: `;
    return [{ text: `${role}${b.name ?? MODALITY_LABELS[b.modality]}${time ? `, ${time}` : ''}` }];
  }
  if (b.type === 'conditioning') {
    if (b.fromQueue) return [{ text: 'Комплекс: следующий из очереди комплексов' }];
    return [{ text: `${b.complexId ? `${b.complexId} · ` : ''}${b.name ?? 'Комплекс'}` }];
  }
  const time = formatMinutesRange(b.durationSec, b.durationSecMax);
  return [{ text: `Мобильность: ${b.items.map((i) => nameOf(i.exerciseId)).join(', ')}${time ? `, ${time}` : ''}` }];
}
