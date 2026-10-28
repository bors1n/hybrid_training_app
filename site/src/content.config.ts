import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { RUBRIC_KEYS } from './lib/articles.ts';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    rubric: z.enum(RUBRIC_KEYS),
    /** Путь к обложке относительно корня сайта (`/covers/…`); без неё карточка рисуется на ночном фоне. */
    cover: z.string().startsWith('/').optional(),
    date: z.coerce.date(),
    /** Вводный абзац: показывается в списке и под заголовком. */
    lead: z.string().min(1).max(400),
    /** Минуты чтения; если не указано, считаются по тексту. */
    readingTime: z.number().int().min(1).max(120).optional(),
    /** Черновик собирается только в dev. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
