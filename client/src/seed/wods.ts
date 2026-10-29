import type { WodRecord } from './wodParse.ts';

/** Библиотека комплексов sportkuznica.com из client/src/seed/generated/wods.json (`npm run seed:wods`, в git не лежит). */
const modules = import.meta.glob<WodRecord[]>('./generated/wods.json', { eager: true, import: 'default' });

export const WODS: readonly WodRecord[] = Object.values(modules)[0] ?? [];
export const HAS_WODS = WODS.length > 0;
export const WOD_SOURCE_NAME = 'sportkuznica.com';
export const WOD_SOURCE_URL = 'https://sportkuznica.com/Wod/';
