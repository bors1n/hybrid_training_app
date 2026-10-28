import { getCollection, type CollectionEntry } from 'astro:content';
import { newestFirst, readingMinutes, type RubricKey } from './articles.ts';

export interface ArticleView {
  slug: string;
  title: string;
  rubric: RubricKey;
  lead: string;
  cover?: string;
  date: Date;
  readingMin: number;
  entry: CollectionEntry<'articles'>;
}

function view(entry: CollectionEntry<'articles'>): ArticleView {
  const { title, rubric, lead, cover, date, readingTime } = entry.data;
  return { slug: entry.id, title, rubric, lead, cover, date, readingMin: readingTime ?? readingMinutes(entry.body ?? ''), entry };
}

/** Все статьи от новых к старым; черновики есть только в dev. */
export async function loadArticles(rubric?: RubricKey): Promise<ArticleView[]> {
  const entries = await getCollection('articles', ({ data }) => (import.meta.env.DEV || !data.draft) && (!rubric || data.rubric === rubric));
  return newestFirst(entries.map(view));
}
