import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { RUBRIC_KEYS } from './lib/articles.ts';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: ({ image }) => z.object({
    title: z.string().min(1).max(120),
    rubric: z.enum(RUBRIC_KEYS),
    /** Картинка рядом со статьёй (`./имя_cover.jpg`); без неё карточка рисуется на ночном фоне. */
    cover: image().optional(),
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
